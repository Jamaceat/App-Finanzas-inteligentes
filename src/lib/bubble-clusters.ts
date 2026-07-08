import { DEFAULT_SECTION_NAME } from '@/db/queries/sections';
import { type Urgency, maxUrgency, urgencyRank } from '@/lib/bubble-visuals';

export type AssignablePoint = {
  key: string;
  label: string;
  amountLabel: string;
  fullAmountLabel: string;
  sectionId: number | null;
  sectionName: string;
  sectionColor?: string;
  sectionIcon?: string;
  isVariable: boolean;
  rawAmount: number;
  frequency?: string;
  nextDueDate?: Date;
  urgency: Urgency;
  onAssign: (incomeRuleId: number, allocatedAmount: number) => void;
};

export type LeafNode = { kind: 'leaf'; key: string; point: AssignablePoint };

export type ClusterNode = {
  kind: 'cluster';
  key: string;
  level: 'section' | 'month';
  label: string;
  icon?: string;
  color?: string;
  count: number;
  totalAmount: number;
  variableCount: number;
  urgency: Urgency;
  children: BubbleNode[];
};

export type BubbleNode = LeafNode | ClusterNode;

export type BubbleTreeConfig = {
  maxFloating: number;
  maxPerCluster: number;
  maxClusters: number;
};

function makeLeaf(point: AssignablePoint): LeafNode {
  return { kind: 'leaf', key: point.key, point };
}

function aggregate(children: BubbleNode[]): {
  count: number;
  totalAmount: number;
  variableCount: number;
  urgency: Urgency;
} {
  let count = 0;
  let totalAmount = 0;
  let variableCount = 0;
  const urgencies: Urgency[] = [];
  for (const child of children) {
    if (child.kind === 'leaf') {
      count += 1;
      if (child.point.isVariable) variableCount += 1;
      else totalAmount += child.point.rawAmount;
      urgencies.push(child.point.urgency);
    } else {
      count += child.count;
      totalAmount += child.totalAmount;
      variableCount += child.variableCount;
      urgencies.push(child.urgency);
    }
  }
  return { count, totalAmount, variableCount, urgency: maxUrgency(urgencies) };
}

// Orden determinista dentro de un nivel: urgencia desc, luego monto desc, luego
// key. Determinismo importa porque el scatter sembrado de las burbujas depende
// de que la key de cada nodo tenga siempre el mismo significado entre renders.
function sortNodes(nodes: BubbleNode[]): BubbleNode[] {
  return [...nodes].sort((a, b) => {
    const urgencyA = urgencyRank(a.kind === 'leaf' ? a.point.urgency : a.urgency);
    const urgencyB = urgencyRank(b.kind === 'leaf' ? b.point.urgency : b.urgency);
    if (urgencyB !== urgencyA) return urgencyB - urgencyA;
    const amountA = a.kind === 'leaf' ? a.point.rawAmount : a.totalAmount;
    const amountB = b.kind === 'leaf' ? b.point.rawAmount : b.totalAmount;
    if (amountB !== amountA) return amountB - amountA;
    return a.key.localeCompare(b.key);
  });
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return map;
}

function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabelOf(date: Date): string {
  const label = date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Buckets de mes ordenados cronológicamente (el más vencido/antiguo primero) en
// vez de por urgencia: para fechas, el orden natural es temporal.
function sortedMonthEntries(points: AssignablePoint[]): [string, AssignablePoint[]][] {
  const groups = groupBy(points, (p) => (p.nextDueDate ? monthKeyOf(p.nextDueDate) : 'sin-fecha'));
  return [...groups.entries()].sort(([a], [b]) => {
    if (a === 'sin-fecha') return 1;
    if (b === 'sin-fecha') return -1;
    return a.localeCompare(b);
  });
}

function monthNodeLabel(groupPoints: AssignablePoint[]): string {
  const sampleDate = groupPoints.find((p) => p.nextDueDate)?.nextDueDate;
  return sampleDate ? monthLabelOf(sampleDate) : 'Sin fecha';
}

// Sub-agrupa los puntos de UNA sección por mes de vencimiento, cuando esa
// sección sola excede maxPerCluster. Los hijos de cada bucket son hojas.
function buildMonthLeafNodes(points: AssignablePoint[], keyPrefix: string): BubbleNode[] {
  const nodes: BubbleNode[] = [];
  for (const [monthKeyStr, groupPoints] of sortedMonthEntries(points)) {
    if (groupPoints.length === 1) {
      nodes.push(makeLeaf(groupPoints[0]));
      continue;
    }
    const leaves = sortNodes(groupPoints.map(makeLeaf));
    const agg = aggregate(leaves);
    nodes.push({
      kind: 'cluster',
      key: `${keyPrefix}month-${monthKeyStr}`,
      level: 'month',
      label: monthNodeLabel(groupPoints),
      count: agg.count,
      totalAmount: agg.totalAmount,
      variableCount: agg.variableCount,
      urgency: agg.urgency,
      children: leaves,
    });
  }
  return nodes;
}

// Agrupa por sección; una sección con un solo gasto queda como hoja (regla
// skip-level). Si una sección sola excede maxPerCluster Y sus gastos caen en
// más de un mes, sub-agrupa por mes; si caen todos en el mismo mes, subdividir
// no ayudaría (relabelearía el cluster sin reducir hijos), así que no se hace.
function buildSectionNodes(points: AssignablePoint[], config: BubbleTreeConfig): BubbleNode[] {
  const groups = groupBy(points, (p) => (p.sectionId === null ? 'none' : String(p.sectionId)));
  const nodes: BubbleNode[] = [];
  for (const [sectionKey, groupPoints] of groups) {
    if (groupPoints.length === 1) {
      nodes.push(makeLeaf(groupPoints[0]));
      continue;
    }

    const distinctMonths = new Set(groupPoints.map((p) => (p.nextDueDate ? monthKeyOf(p.nextDueDate) : 'sin-fecha')));
    const shouldSubdivide = groupPoints.length > config.maxPerCluster && distinctMonths.size > 1;

    const children = shouldSubdivide
      ? buildMonthLeafNodes(groupPoints, `sec-${sectionKey}-`)
      : sortNodes(groupPoints.map(makeLeaf));

    if (children.length === 1) {
      nodes.push(children[0]);
      continue;
    }

    const agg = aggregate(children);
    const sample = groupPoints[0];
    nodes.push({
      kind: 'cluster',
      key: `sec-${sectionKey}`,
      level: 'section',
      label: sample.sectionName || DEFAULT_SECTION_NAME,
      icon: sample.sectionIcon,
      color: sample.sectionColor,
      count: agg.count,
      totalAmount: agg.totalAmount,
      variableCount: agg.variableCount,
      urgency: agg.urgency,
      children,
    });
  }
  return sortNodes(nodes);
}

// Pivote de nivel superior cuando hay demasiados clusters de sección: agrupa
// por mes y, dentro de cada mes, vuelve a agrupar por sección.
function buildMonthSectionNodes(points: AssignablePoint[], config: BubbleTreeConfig): BubbleNode[] {
  const nodes: BubbleNode[] = [];
  for (const [monthKeyStr, groupPoints] of sortedMonthEntries(points)) {
    const children = buildSectionNodes(groupPoints, config);
    if (children.length === 1) {
      nodes.push(children[0]);
      continue;
    }
    const agg = aggregate(children);
    nodes.push({
      kind: 'cluster',
      key: `month-${monthKeyStr}`,
      level: 'month',
      label: monthNodeLabel(groupPoints),
      count: agg.count,
      totalAmount: agg.totalAmount,
      variableCount: agg.variableCount,
      urgency: agg.urgency,
      children,
    });
  }
  return nodes;
}

// Construye el árbol jerárquico de burbujas:
// 1. Pocos puntos (<= maxFloating) -> todas hojas, comportamiento actual intacto.
// 2. Si no, se agrupan por sección.
// 3. Si eso deja demasiados clusters en la raíz (> maxClusters), el nivel
//    superior pivota a buckets por mes conteniendo clusters de sección.
export function buildBubbleTree(points: AssignablePoint[], config: BubbleTreeConfig): BubbleNode[] {
  if (points.length <= config.maxFloating) {
    return points.map(makeLeaf);
  }

  const sectionNodes = buildSectionNodes(points, config);
  if (sectionNodes.length <= config.maxClusters) {
    return sectionNodes;
  }

  return buildMonthSectionNodes(points, config);
}

export function childrenAt(tree: BubbleNode[], path: string[]): BubbleNode[] {
  let level = tree;
  for (const key of path) {
    const found = level.find((node): node is ClusterNode => node.kind === 'cluster' && node.key === key);
    if (!found) return level;
    level = found.children;
  }
  return level;
}

// Recorta un expandedPath a su prefijo válido más largo dentro del árbol
// actual: usado para reaccionar cuando un cluster desaparece (p. ej. se
// asignó su último hijo) sin dejar el estado apuntando a una key inexistente.
export function prunePath(tree: BubbleNode[], path: string[]): string[] {
  let level = tree;
  const validPath: string[] = [];
  for (const key of path) {
    const found = level.find((node): node is ClusterNode => node.kind === 'cluster' && node.key === key);
    if (!found) break;
    validPath.push(key);
    level = found.children;
  }
  return validPath;
}

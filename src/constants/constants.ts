import { Spacing } from '@/constants/theme';

// Home — tanque de ingresos y tanque "Libre"
export const TANK_COLOR = '#0091FF';
export const FREE_TANK_COLOR = '#12A594';
// Tanque especial temporal (financiado desde Libre para un solo gasto recurrente)
export const SPECIAL_TANK_COLOR = '#F76B15';

// Home — dimensiones del carrusel de tanques
export const TANK_WIDTH = 120;
export const TANK_ITEM_WIDTH = 140;
export const TANK_HEIGHT = 200;
export const TANK_LABEL_HEIGHT = 52;
export const TANK_GAP = 12;
export const TANK_SNAP_INTERVAL = TANK_ITEM_WIDTH + TANK_GAP;
export const TANK_CAROUSEL_HEIGHT = Math.ceil((TANK_HEIGHT + TANK_LABEL_HEIGHT) * 1.3) + Spacing.three;

// Home — auto-scroll al mantener presionado en los bordes del carrusel
export const EDGE_ZONE_WIDTH = 44;
export const EDGE_SCROLL_STEP = 14;
export const EDGE_SCROLL_INTERVAL_MS = 16;

// Home — botón de lupa (press-and-hold para abrir el buscador de tanques)
export const SEARCH_LONG_PRESS_DURATION_MS = 1000;
export const SEARCH_PRESS_RELEASE_DURATION_MS = 150;

// Home — animación de llenado del tanque
export const TANK_FILL_ANIMATION_DURATION_MS = 400;

// Calendario — cantidad de ocurrencias por defecto a simular en la regla recurrente
export const DEFAULT_SIMULATION_OCCURRENCES = 24;

// Asignar gastos — animación de entrada de las burbujas de gasto (fly-out escalonado, sin rebote)
export const EXPENSE_POINT_ENTRANCE_BASE_DELAY_MS = 80;
export const EXPENSE_POINT_ENTRANCE_STAGGER_MS = 40;
export const EXPENSE_POINT_ENTRANCE_DURATION_MS = 400;

// Burbujas flotantes — escalabilidad y agrupación
export const MAX_FLOATING_BUBBLES = 10; // <= esto: modo individual (comportamiento actual, sin clusters)
export const MAX_BUBBLES_PER_CLUSTER = 8; // hijos visibles al expandir; si excede, se sub-agrupa por mes
export const MAX_CLUSTERS_ON_SCREEN = 6; // > esto: el nivel superior pasa a buckets por mes
export const CLUSTER_EXPAND_BACKDROP_OPACITY = 0.35; // oscurecido detrás de un cluster expandido

// Burbujas flotantes — tamaño según monto
export const BUBBLE_PILL_SCALE_MIN = 0.85; // factor de escala de la pill de asignar-gastos
export const BUBBLE_PILL_SCALE_MAX = 1.2;
export const CLUSTER_SCALE_MIN = 1.0; // factor de escala de la burbuja de cluster
export const CLUSTER_SCALE_MAX = 1.3;
export const CLUSTER_BASE_SIZE = 110; // diámetro base (px) de la burbuja de cluster
export const POCKET_BUBBLE_SIZE_MIN = 72; // diámetro (px) de las burbujas del bolsillo
export const POCKET_BUBBLE_SIZE_MAX = 112;
export const POCKET_GRID_GAP = 14; // separación (px) entre celdas del grid del bolsillo
export const POCKET_GRID_PADDING = 16; // padding (px) alrededor del grid scrolleable del bolsillo
export const POCKET_WANDER_AMPLITUDE = 8; // amplitud (px) del vaivén en modo grid (celdas fijas, sin solapar)
export const BUBBLE_SIZE_VARIABLE_RATIO = 0.4; // baseline de tamaño para montos variables/0

// Burbujas flotantes — urgencia por vencimiento
export const DUE_SOON_WINDOW_DAYS = 3; // ámbar si vence dentro de N días (o venció hace <= N)
export const OVERDUE_SEVERE_DAYS = 3; // rojo si venció hace más de N días
export const URGENCY_OVERDUE_COLOR = '#E5484D'; // Radix red9 — ya usado inline en la app
export const URGENCY_DUE_SOON_COLOR = '#FFB224'; // Radix amber9 — misma familia que blue9/teal9/red9

// Bolsillo — drag dentro del grid scrolleable (hold breve para levantar la burbuja)
export const BUBBLE_DRAG_LONG_PRESS_MS = 200;

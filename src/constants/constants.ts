import { Spacing } from '@/constants/theme';

// Home — tanque de ingresos y tanque "Libre"
export const TANK_COLOR = '#0091FF';
export const FREE_TANK_COLOR = '#12A594';

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

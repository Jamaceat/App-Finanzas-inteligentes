# Parametrizaciones del proyecto — FinZ

Referencia centralizada de todos los valores configurables/parametrizables del proyecto: config de la app, build/tooling, constantes de UI/animación, sensores, notificaciones, reglas recurrentes, formato de moneda/fecha, defaults de DB y otros valores "hardcodeados" de tipo configuración.

> Nota: estos valores viven hoy dispersos en el código (no centralizados). Este archivo es documentación de referencia, no una fuente de verdad ejecutable — si cambiás un valor en el código, actualizá también esta tabla.

## 1. Configuración de la app (`app.json`)

| Valor | Descripción |
|---|---|
| `name: "FinZ"` | Nombre visible de la app |
| `slug: "finz"` | Slug del proyecto Expo |
| `version: "1.0.0"` | Versión de la app |
| `orientation: "portrait"` | Orientación fija |
| `scheme: "finz"` | Esquema de deep-link |
| `userInterfaceStyle: "automatic"` | Sigue el modo claro/oscuro del sistema |
| `ios.bundleIdentifier: "com.jamaceat.finz"` | Bundle ID de iOS |
| `android.package: "com.jamaceat.finz"` | Package name de Android |
| `android.adaptiveIcon.backgroundColor: "#E6F4FE"` | Color de fondo del ícono adaptativo Android |
| `android.predictiveBackGestureEnabled: false` | Desactiva el gesto de "back" predictivo de Android 14 |
| `web.output: "static"` | Modo de export web estático |
| plugin `expo-splash-screen.backgroundColor: "#208AEF"` | Color de fondo del splash screen |
| plugin `expo-splash-screen.android.imageWidth: 76` | Ancho del ícono del splash en Android |
| plugin `expo-notifications.defaultChannel: "finz-reminders"` | Canal de notificaciones Android por defecto |
| `experiments.typedRoutes: true` | Expo Router con rutas tipadas |
| `experiments.reactCompiler: true` | React Compiler habilitado |

## 2. Build / tooling

**`drizzle.config.ts`**
- `schema: './src/db/schema.ts'` — path del schema de Drizzle
- `out: './src/db/migrations'` — carpeta de migraciones generadas
- `dialect: 'sqlite'`
- `driver: 'expo'`

**`babel.config.js`** / **`metro.config.js`**
- Preset `babel-preset-expo` + plugin `inline-import` para archivos `.sql` (inlinea SQL como strings)
- Metro: `config.resolver.sourceExts.push('sql')` para poder bundlear `.sql`

**`tsconfig.json`**
- Extiende `expo/tsconfig.base`, `strict: true`
- Alias: `@/*` → `./src/*`, `@/assets/*` → `./assets/*`

**`eslint.config.js`**
- Extiende `eslint-config-expo/flat`, ignora `dist/*`

**`package.json`**
- `main: "expo-router/entry"`
- Scripts: `start`, `android`, `ios`, `web`, `lint`, `db:generate` (`drizzle-kit generate`), `reset-project`

**Docker (`Dockerfile` / `docker-compose.yml`)**
- Imagen base: `reactnativecommunity/react-native-android:latest`
- `image: reactnative-android-builder:latest`, `container_name: finz_apk_builder`
- Env vars: `USER_ID`, `GROUP_ID`, `GRADLE_USER_HOME=/root/.gradle`, `APK_NAME=finz.apk`
- Volúmenes de cache: `node_modules_cache`, `gradle_cache`, `android_cache`, `npm_cache`

**`Makefile`**
- `PORT ?= 8082` — puerto de Metro/debug, sobreescribible (`make <target> PORT=xxxx`)
- `PACKAGE_MANAGER = npm`
- `APP_PACKAGE = com.jamaceat.finz` — usado en `adb shell am force-stop` (target `dev-reset`)

## 3. Tema y espaciado (`src/constants/theme.ts`)

- `Colors.light` / `Colors.dark` — paletas de texto/fondo/elementos
- `Spacing`: `half:2, one:4, two:8, three:16, four:24, five:32, six:64`
- `BottomTabInset = Platform.select({ios:50, android:80}) ?? 0`
- `MaxContentWidth = 800` — ancho máximo de contenido en pantallas grandes/web

## 4. UI / animación — carrusel de tanques (`src/constants/constants.ts`)

Estas constantes vivían inline en `src/app/(tabs)/index.tsx` y ahora están centralizadas en `src/constants/constants.ts` (se importan desde ahí):

| Constante | Valor | Controla |
|---|---|---|
| `TANK_COLOR` | `#0091FF` | Color de relleno de tanques de ingreso |
| `FREE_TANK_COLOR` | `#12A594` | Color de relleno del tanque "Libre" |
| `TANK_WIDTH` | `120` | Ancho del cuerpo del tanque (px) |
| `TANK_ITEM_WIDTH` | `140` | Ancho de cada slot del carrusel |
| `TANK_HEIGHT` | `200` | Alto del cuerpo del tanque (px) |
| `TANK_LABEL_HEIGHT` | `52` | Alto reservado para el label bajo el tanque |
| `TANK_GAP` | `12` | Espacio entre items del carrusel |
| `TANK_SNAP_INTERVAL` | `152` (`TANK_ITEM_WIDTH + TANK_GAP`) | Intervalo de snap del scroll |
| `TANK_CAROUSEL_HEIGHT` | `(TANK_HEIGHT+TANK_LABEL_HEIGHT)*1.3 + Spacing.three` | Alto del contenedor (margen para tilt 3D) |
| `EDGE_ZONE_WIDTH` | `44` | Ancho de las zonas táctiles de auto-scroll en los bordes (px) |
| `EDGE_SCROLL_STEP` | `14` | Px scrolleados por tick de auto-scroll |
| `EDGE_SCROLL_INTERVAL_MS` | `16` | Intervalo del auto-scroll (~60fps) |
| `SEARCH_LONG_PRESS_DURATION_MS` | `3000` | Tiempo de press-and-hold sobre el botón de lupa para abrir `TankSearchModal` |
| `SEARCH_PRESS_RELEASE_DURATION_MS` | `150` | Animación de retroceso al soltar el botón de lupa antes de tiempo |
| Delay de recentrado tras selección | `100 ms` (`setTimeout`) | Antes del `scrollTo` programático |
| Curvas coverflow (scale/rotateY/opacity) | `[1.3,1.15,1.0,0.85,1.0,1.15,1.3]` / `[-84,-56,-28,0,28,56,84]°` / `[0,0.4,0.9,1,0.9,0.4,0]` | Efecto 3D del carrusel |
| `perspective` | `700` | Profundidad 3D del coverflow |
| `TANK_FILL_ANIMATION_DURATION_MS` | `400` | Duración de la animación de llenado del tanque (`withTiming` del nivel de agua) |
| `scrollEventThrottle` | `16` | Frecuencia de muestreo del scroll (ms) |
| Umbral de swipe (drag horizontal) | `80` px | Distancia para cambiar de tanque destino en tarjeta de gasto pendiente |
| Umbral de "tap" | `10` px | Distancia máxima de drag considerada tap (confirmar drop) |
| Botón de búsqueda | `44` (ancho/alto), `22` (borderRadius) | Dimensiones del botón circular + anillo de presión |

## 5. Sensor de inclinación (`src/hooks/use-device-tilt.ts`)

| Constante | Valor | Descripción |
|---|---|---|
| `UPDATE_INTERVAL_MS` | `60` | Frecuencia de polling de `DeviceMotion` (ms) |
| `SENSITIVITY` | `1.4` | Multiplicador aplicado al ángulo gamma crudo |
| `MAX_TILT_DEG` | `15` | Rango de clamp de la inclinación (±15°) |

## 6. Notificaciones (`src/lib/notifications.ts`)

| Constante | Valor | Descripción |
|---|---|---|
| `CHANNEL_ID` | `'finz-reminders'` | Canal de notificaciones Android (coincide con `app.json`) |
| Nombre de canal | `'Recordatorios de FinZ'` | Nombre legible del canal Android |
| Importancia de canal | `AndroidImportance.DEFAULT` | Nivel de importancia |
| `isExpoGo` | `Constants.appOwnership === 'expo'` | Gate para saltear notificaciones en Expo Go |
| Formato de id de recordatorio | `` `recurring-rule-${ruleId}` `` | Esquema de id de notificación programada |
| Flags del handler foreground | `shouldShowBanner/List/PlaySound: true`, `shouldSetBadge: false` | Comportamiento de notificación en foreground |

## 7. Reglas recurrentes / scheduling

**Enums de schema (`src/db/schema.ts`)**
- `sections.kind`: `['income', 'expense', 'both']`, default `'both'`
- `recurringRules.frequency`: `['daily','weekly','biweekly','monthly','quarterly','semiannual','yearly','custom']`
- `recurringRules.customIntervalUnit`: `['days','weeks']`
- `recurringRules.isVariableAmount` default `false`
- `recurringRules.reminderEnabled` default `true`
- `savingsGoals.currentAmount` default `0`
- `createdAt` default `unixepoch()` en todas las tablas

**Cálculo de intervalos (`src/db/queries/tanks.ts`)**
- `daily`: +1 día · `weekly`: +7 días · `biweekly`: +15 días · `monthly`: +1 mes · `quarterly`: +3 meses · `semiannual`: +6 meses · `yearly`: +1 año
- `custom`: `amount * (unit==='weeks' ? 7 : 1)` días (amount por defecto `1` si es inválido)

**UI (`src/app/recurring-rules.tsx`)**
- `FREQUENCY_OPTIONS` — labels: Diario, Semanal, Quincenal, Mensual, Trimestral, Semestral, Anual, Personalizado
- `CUSTOM_UNIT_OPTIONS` — `'days'→'Días'`, `'weeks'→'Semanas'`
- Default de nueva regla: `frequency: 'monthly'`, `customUnit: 'days'`
- `simulateOccurrences` default `count = 8` — ocurrencias futuras precalculadas en el mini-calendario
- `WEEKDAY_LABELS = ['D','L','M','M','J','V','S']`
- Colores de highlight ingreso/gasto: `#30A46C` / `#E5484D`

## 8. Formato de moneda y fecha

Definido de forma duplicada (no centralizado) en 4 archivos:
- `src/app/(tabs)/index.tsx`, `src/components/tank-search-modal.tsx`, `src/app/recurring-rules.tsx`, `src/app/(tabs)/transactions.tsx`
- `Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 })`
- Locale `es-AR`, moneda `ARS`, 2 decimales fijos

- `Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' })` — `src/app/recurring-rules.tsx` — header mes/año del mini-calendario

## 9. Defaults de base de datos (`src/db/schema.ts`, `src/db/queries/`)

- `DEFAULT_SECTION_NAME = 'General'` (`src/db/queries/sections.ts`) — sección de fallback auto-creada
- Sección default auto-creada con `icon: 'house'`, `color: '#60646C'`, `kind: 'both'`
- `sections.kind` default `'both'`
- `recurringRules.isVariableAmount` default `false`, `.reminderEnabled` default `true`
- `savingsGoals.currentAmount` default `0`
- `DATABASE_NAME = 'finz.db'` (`src/db/client.ts`) — nombre del archivo SQLite
- `enableChangeListener: true` (`src/db/client.ts`) — live-queries de Drizzle

## 10. Otros valores de configuración (colores, dimensiones, opciones fijas)

**Colores fuera de `theme.ts`**
- `src/app/(tabs)/caja.tsx`: `INCOME_COLOR='#30A46C'`, `EXPENSE_COLOR='#E5484D'`
- `src/app/(tabs)/transactions.tsx`: `#E5484D` (gasto) / `#30A46C` (ingreso) en filas
- `src/app/recurring-rules.tsx`: `#E5484D` texto "Archivar"
- `src/app/(tabs)/sections.tsx`: `COLOR_OPTIONS` — paleta de 10 swatches: `#E5484D, #F76B15, #FFB224, #30A46C, #12A594, #0091FF, #3E63DD, #8E4EC6, #D6409F, #60646C`; `#E5484D` texto "Archivar"
- `src/components/themed-text.tsx`: `linkPrimary = '#3c87f7'`

**Dimensiones/límites**
- `src/components/tank-search-modal.tsx`: mini-tanque `24x38`, `borderWidth 1.5`, `borderRadius 6`
- `src/app/(tabs)/sections.tsx`: swatch de color `28x28`, `borderRadius 14`
- `src/app/recurring-rules.tsx`: celda de calendario `14.2857%` (1/7), círculo de día `80%` / `borderRadius 999`

**Opciones fijas**
- `src/app/(tabs)/caja.tsx`: `QUICK_ACTIONS` (acciones "ahora/fijo/variable" con labels, hints, íconos, flags `enabled`)
- `src/app/(tabs)/sections.tsx`: `ICON_OPTIONS` (12 íconos), `KIND_OPTIONS` (`expense/income/both`)

No se encontraron constantes de reintentos ni timeouts de red — la app es 100% local/offline (SQLite), sin config de networking más allá del deep-link scheme y las notificaciones locales.

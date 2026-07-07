# App de Finanzas Personales — Plan por Fases

## Contexto
Partimos del template Expo Router recién generado (nombre interno `"GymSmart"`, sin lógica de negocio) para construir una app de finanzas personales: registro de gastos/ingresos, entradas y salidas recurrentes (con montos variables y recordatorios), secciones personalizables, un tanque de agua animado ligado al sensor de movimiento del dispositivo, destino de dinero a ahorro, y lectura de SMS bancarios para detectar pagos automáticamente.

Decisiones ya acordadas con el usuario:
- **SMS**: la app se instala como APK directo (Makefile/Docker ya soportan esto), no va a Play Store → se puede pedir `READ_SMS` sin la restricción de "default SMS app".
- **Desarrollo**: incremental, fase por fase, revisando cada una antes de seguir.
- **Almacenamiento**: `expo-sqlite` + Drizzle ORM (oficialmente soportado en SDK 56, incluye `drizzle-studio-expo` para inspección).

## Lo que ya existe y se reutiliza
- **Theming**: `src/constants/theme.ts` (`Colors.light/dark`, `Spacing`, `Fonts`), `src/hooks/use-theme.ts`, `src/components/themed-view.tsx` / `themed-text.tsx` — todo nuevo componente sigue el patrón `useTheme()` + `theme[colorKey]`.
- **Navegación**: rutas de tabs movidas a grupo `src/app/(tabs)/` (`_layout.tsx`, `index.tsx` Home, `caja.tsx`, `transactions.tsx`, `sections.tsx`) para que Expo Router las agrupe bajo el tab navigator; `recurring-rules.tsx` queda fuera del grupo (pantalla modal-like, no es un tab). `src/components/app-tabs.tsx` (native tabs, `expo-router/unstable-native-tabs`) y `app-tabs.web.tsx` (web, `expo-router/ui`) ahora declaran 4 triggers: Home, Caja, Movimientos, Secciones. Agregar pantallas = nuevo archivo en `src/app/(tabs)/` + nuevo trigger en ambos archivos de tabs.
- **Animación**: `react-native-reanimated` 4.3.1 y `react-native-worklets` ya instalados y en uso (`Keyframe`, `FadeIn`, `scheduleOnRN`) en `src/components/animated-icon.tsx` y `ui/collapsible.tsx`. El tanque de agua será el primer uso de `useSharedValue`/`useAnimatedStyle` (API de más bajo nivel), pero el paquete y el patrón de worklets ya están probados en el repo.
- **Build APK**: `scripts/docker-build.sh` corre `expo prebuild --platform android` + `gradlew assembleRelease` dentro de Docker. Los permisos nativos (`READ_SMS`, etc.) deben declararse vía `app.json` (`android.permissions` / config plugins), no a mano en `android/AndroidManifest.xml` (se regenera).
- Alias `@/*` → `src/*` (tsconfig), sin ESLint/Prettier custom (usa `expo lint`).

## Fases

### Fase 0 — Rebrand + fundaciones ✅ COMPLETA
- [x] Renombrar app en `app.json` y `package.json` (nombre definitivo: "FinZ") y fijar `android.package` / `ios.bundleIdentifier` (`com.jamaceat.finz`).
- [x] Instalar `expo-sqlite`, `drizzle-orm`, `drizzle-kit`, `expo-notifications`, `expo-sensors`.
- [x] Configurar `SQLiteProvider`/migrator en `src/app/_layout.tsx` (`DatabaseMigrator`) para correr migraciones de Drizzle.

### Fase 1 — Modelo de datos (Drizzle + SQLite) ✅ COMPLETA
Tablas iniciales (`src/db/schema.ts`):
- [x] `sections` (id, name, icon, color, kind: income/expense/both)
- [x] `transactions` (id, section_id FK, amount, kind, description, occurred_at, recurring_rule_id FK nullable)
- [x] `recurring_rules` (id, section_id FK, label, kind, frequency, is_variable_amount, estimated_amount nullable, next_due_date, reminder_enabled)
- [x] `savings_goals` (id, name, target_amount, current_amount)
- [x] Capa de acceso (`src/db/queries/*.ts`) usada por las pantallas.

### Fase 2 — Transacciones (core) ⚠️ PARCIAL
- [x] Formulario alta rápida de ingreso/gasto con input de monto tipo cajero (`src/app/(tabs)/transactions.tsx`, `QuickAddForm`) — guarda centavos como dígitos crudos, formatea con `Intl.NumberFormat('es-AR', {style:'currency', currency:'ARS'})`.
- [x] Lista de transacciones filtrable por sección (`useLiveQuery`), montos formateados como moneda.
- [x] Sección por defecto: si no se elige sección al cargar una transacción, se usa/crea automáticamente "General" (`getOrCreateDefaultSection`, `src/db/queries/sections.ts`).
- [x] Tab "Movimientos" (`transactions`) confirmado en `app-tabs.tsx` / `.web.tsx`.
- [x] Botones "Fijo" y "Variable" en pantalla Caja — ahora habilitados, navegan a `/recurring-rules` con `kind`/`variable` como params (Fase 4 CRUD ya existe).
- [ ] Filtro por fecha (solo hay filtro por sección todavía).

### Fase 2.5 — Pantalla "Caja" (rediseño del Home) ✅ COMPLETA
- [x] `src/app/(tabs)/index.tsx` (tab Home) ya no es accesos rápidos: ahora es un dashboard de "tanques" de efectivo — un tanque por regla de ingreso recurrente activa (capacidad = ingreso recibido en el ciclo, nivel = ingreso menos gastos ya asignados a esa regla) más un tanque "Libre" para movimientos sin regla recurrente asociada. Cálculo puro en `src/db/queries/tanks.ts` (`computeIncomeTanks`, `computeFreeCash`, `computePendingExpenses`, con ventana de ciclo via `getCycleWindow`/`getPreviousCycleWindow`/`advanceDate`).
- [x] Gastos recurrentes vencidos (`nextDueDate < now`) se listan como tarjetas "pendientes"; gesto de pan (`react-native-gesture-handler` + reanimated) para elegir a qué tanque asignarlos y confirmar el pago (`Alert.alert` → `allocateExpenseToIncomeTank` en `src/db/queries/transactions.ts`, que crea la transacción con `allocatedIncomeRuleId` y avanza `nextDueDate` de la regla del gasto).
- [x] Nueva columna `transactions.allocated_income_rule_id` (FK a `recurring_rules`) — migración `0001_worthless_shaman.sql`.
- [x] `src/app/(tabs)/caja.tsx` quedó como el formulario de alta rápida por tipo: columnas Ingreso/Gasto con botones "Ahora" (navega a `/transactions`), "Fijo"/"Variable" (navegan a `/recurring-rules`) — los tres habilitados.
- [x] `GestureHandlerRootView` agregado en `src/app/_layout.tsx` para soportar el gesto de pan.
- **Nota**: este dashboard de tanques reemplaza conceptualmente lo que la Fase 5 original (ahorro con `savings_goals`) iba a resolver con transferencias explícitas — acá el "ahorro" implícito es el remanente que queda en un tanque de ingreso al cerrar su ciclo (`leftoverFromClosedCycles` en `computeFreeCash`). La tabla `savings_goals` sigue sin usarse; se decide más adelante si conviene fusionarla con este modelo de tanques o mantenerla aparte para metas explícitas.

### Fase 3 — Secciones personalizables ✅ COMPLETA
- [x] `src/app/(tabs)/sections.tsx`: CRUD completo (crear/editar/archivar), ícono (`expo-symbols`, `SymbolView`) y color por sección, chip de tipo (Gasto/Ingreso/Ambos). Nuevo tab "Secciones" en `app-tabs.tsx`/`.web.tsx`.

### Fase 4 — Recurrentes + recordatorios ✅ COMPLETA
- [x] Capa de datos: `src/db/queries/recurring-rules.ts` (`listActiveRecurringRules`, `createRecurringRule`, `updateRecurringRule`, `updateNextDueDate`, `archiveRecurringRule`).
- [x] UI de CRUD: `src/app/recurring-rules.tsx` (form + lista con editar/archivar, mismo patrón que `sections.tsx`). Se llega ahí desde los botones "Fijo"/"Variable" de `caja.tsx`, que pasan `kind`/`variable` como params iniciales.
- [x] Frecuencias extendidas: `daily`/`weekly`/`biweekly`/`monthly`/`quarterly`/`semiannual`/`yearly`/`custom` (custom = `customIntervalValue` + `customIntervalUnit: 'days'|'weeks'`, columnas nuevas nullable) — migración `0002_regular_manta.sql`. Lógica de avance/retroceso de fecha centralizada en `src/db/queries/tanks.ts` (`advanceDate`/`stepBack`), reutilizada por el CRUD y por el cálculo de tanques.
- [x] Selector de fecha de inicio (`MiniCalendar` dentro de `recurring-rules.tsx`): calendario mensual con navegación, resalta las próximas ~8 ocurrencias simuladas según la frecuencia elegida, y permite tocar un día para fijar `nextDueDate` manualmente (ya no se autogenera solo con `new Date()`).
- [x] Integración con `expo-notifications` (`src/lib/notifications.ts`, trigger `SchedulableTriggerInputTypes.DATE`): notificación one-shot en `nextDueDate` con identifier determinístico `recurring-rule-{id}` (permite cancelar/reprogramar sin guardar estado extra). Chip "Recordatorio activado"/"Sin recordatorio" en el form escribe `reminderEnabled` (columna ya existía en el schema). `src/components/notifications-sync.tsx` se monta una vez en `_layout.tsx` y usa `useLiveQuery(listActiveRecurringRules())` para resincronizar automáticamente los recordatorios ante cualquier alta/edición/pago que cambie `nextDueDate` o `reminderEnabled` — sin llamadas manuales dispersas por las pantallas. Al archivar una regla se cancela explícitamente (`cancelRuleReminder`) porque sale del query reactivo. Vencimientos ya pasados no se re-notifican (ya se muestran como tarjetas "pendientes" en Home). Permisos + canal de Android (`finz-reminders`) se piden/crean perezosamente la primera vez que hay algo para programar. Plugin `expo-notifications` agregado a `app.json`.

### Fase 5 — Ahorro ❌ PENDIENTE / A REDEFINIR
- [ ] Tabla `savings_goals` sigue sin queries de escritura ni UI. Definir si esto sigue siendo un flujo aparte (metas explícitas con transferencias) o si se absorbe en el modelo de tanques de Fase 2.5.

### Fase 6 — Tanque animado con sensor de movimiento ✅ COMPLETA
- [x] Nuevo hook `src/hooks/use-device-tilt.ts` (`useDeviceTilt(): SharedValue<number>`): suscribe `DeviceMotion` de `expo-sensors` (`isAvailableAsync` → fallback silencioso a `0` si no hay sensor, `requestPermissionsAsync`, `setUpdateInterval(60)`), deriva el tilt lateral de `rotation.gamma` (rad→deg, sensibilidad 1.4x, clamp ±15°), y limpia la suscripción al desmontar.
- [x] `src/app/(tabs)/index.tsx`: `Tank` ahora recibe `tilt: SharedValue<number>` (un solo `useDeviceTilt()` en `HomeScreen`, compartido por todos los tanques) y lo aplica como `transform: [{ rotate }]` amortiguado con `withSpring` dentro del `useAnimatedStyle` existente (junto al `height`/`withTiming` de siempre). `tankFill` pasa a `width: '130%'` + `alignSelf: 'center'` para que la rotación no deje huecos laterales — el hueco que sí se ve es arriba, simulando el vaciado del tanque hacia ese lado. No requiere prebuild/dev client (`DeviceMotion` funciona en Expo Go).

### Fase 7 — Lectura de SMS bancarios (Android, último) ❌ PENDIENTE (pausada — no desarrollar hasta indicación explícita)
- [ ] Módulo nativo Android vía Expo Modules API: `BroadcastReceiver` (`SMS_RECEIVED`) + lectura de histórico (`Telephony.Sms` content provider).
- [ ] Permiso `READ_SMS` en `app.json` y build con `expo prebuild` (dev client, no Expo Go).
- [ ] Parser de mensajes por patrón de entidad bancaria → sugiere transacción, el usuario confirma antes de guardar.

## Verificación
- Cada fase: `npx tsc --noEmit`, `expo lint`, y correr la app (`expo start` / `make local-apk` para features nativas como sensores/notificaciones/SMS que no funcionan en Expo Go) para probar el flujo real en dispositivo/emulador Android.
- Fase 7 en particular solo se puede validar en un APK instalado directo (no Expo Go), acorde a lo ya acordado.

## Próximo paso inmediato
Fases 0, 1, 2.5, 3, 4 y 6 completas. Rutas de tabs migradas a `src/app/(tabs)/` con 4 tabs (Home, Caja, Movimientos, Secciones). `npx tsc --noEmit` y `expo lint` pasan limpio sobre todo lo agregado (el único error de lint pendiente, en `use-color-scheme.web.ts`, es preexistente del template y no está relacionado).
Falta probar en dispositivo/emulador Android: el flujo completo (crear sección → crear regla recurrente con recordatorio activado → confirmar permiso de notificaciones → ver tanque en Home → arrastrar gasto pendiente para pagarlo → verificar que la notificación se reprograma), y el nuevo tilt del tanque por sensor de movimiento (inclinar el teléfono y ver la superficie del agua inclinarse). Fase 7 (SMS) queda pausada — no arrancar sin indicación explícita del usuario.

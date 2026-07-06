# App de Finanzas Personales — Plan por Fases

## Contexto
Partimos del template Expo Router recién generado (nombre interno `"GymSmart"`, sin lógica de negocio) para construir una app de finanzas personales: registro de gastos/ingresos, entradas y salidas recurrentes (con montos variables y recordatorios), secciones personalizables, un tanque de agua animado ligado al sensor de movimiento del dispositivo, destino de dinero a ahorro, y lectura de SMS bancarios para detectar pagos automáticamente.

Decisiones ya acordadas con el usuario:
- **SMS**: la app se instala como APK directo (Makefile/Docker ya soportan esto), no va a Play Store → se puede pedir `READ_SMS` sin la restricción de "default SMS app".
- **Desarrollo**: incremental, fase por fase, revisando cada una antes de seguir.
- **Almacenamiento**: `expo-sqlite` + Drizzle ORM (oficialmente soportado en SDK 56, incluye `drizzle-studio-expo` para inspección).

## Lo que ya existe y se reutiliza
- **Theming**: `src/constants/theme.ts` (`Colors.light/dark`, `Spacing`, `Fonts`), `src/hooks/use-theme.ts`, `src/components/themed-view.tsx` / `themed-text.tsx` — todo nuevo componente sigue el patrón `useTheme()` + `theme[colorKey]`.
- **Navegación**: `src/components/app-tabs.tsx` (native tabs, `expo-router/unstable-native-tabs`) y `app-tabs.web.tsx` (web, `expo-router/ui`). Agregar pantallas = nuevo archivo en `src/app/` + nuevo trigger en ambos archivos de tabs.
- **Animación**: `react-native-reanimated` 4.3.1 y `react-native-worklets` ya instalados y en uso (`Keyframe`, `FadeIn`, `scheduleOnRN`) en `src/components/animated-icon.tsx` y `ui/collapsible.tsx`. El tanque de agua será el primer uso de `useSharedValue`/`useAnimatedStyle` (API de más bajo nivel), pero el paquete y el patrón de worklets ya están probados en el repo.
- **Build APK**: `scripts/docker-build.sh` corre `expo prebuild --platform android` + `gradlew assembleRelease` dentro de Docker. Los permisos nativos (`READ_SMS`, etc.) deben declararse vía `app.json` (`android.permissions` / config plugins), no a mano en `android/AndroidManifest.xml` (se regenera).
- Alias `@/*` → `src/*` (tsconfig), sin ESLint/Prettier custom (usa `expo lint`).

## Fases

### Fase 0 — Rebrand + fundaciones
- Renombrar app en `app.json` y `package.json` (de "GymSmart" a nombre definitivo — a confirmar con el usuario) y fijar `android.package` / `ios.bundleIdentifier`.
- Instalar `expo-sqlite`, `drizzle-orm`, `drizzle-kit`, `expo-notifications`, `expo-sensors`.
- Configurar `SQLiteProvider` en `src/app/_layout.tsx` con `onInit` para correr migraciones de Drizzle.

### Fase 1 — Modelo de datos (Drizzle + SQLite)
Tablas iniciales (`src/db/schema.ts`):
- `sections` (id, name, icon, color, kind: income/expense/both)
- `transactions` (id, section_id FK, amount, kind, description, occurred_at, recurring_rule_id FK nullable)
- `recurring_rules` (id, section_id FK, label, kind, frequency, is_variable_amount, estimated_amount nullable, next_due_date, reminder_enabled)
- `savings_goals` (id, name, target_amount, current_amount)
Se genera capa de acceso (`src/db/queries/*.ts`) usada por las pantallas.

### Fase 2 — Transacciones (core)
Pantallas: lista de transacciones filtrable por sección/fecha, formulario alta rápida de ingreso/gasto. Reutiliza `ThemedView`/`ThemedText`, nuevo tab en `app-tabs.tsx`/`.web.tsx`.

### Fase 3 — Secciones personalizables
CRUD de secciones (crear/editar/archivar, ícono y color), usadas como categoría en transacciones y recurrentes.

### Fase 4 — Recurrentes + recordatorios
CRUD de reglas recurrentes (entradas/salidas, frecuencia, monto fijo o variable). Integración con `expo-notifications` (`scheduleNotificationAsync`, triggers `DAILY`/`TIME_INTERVAL`) para avisar cuándo registrar un ingreso/gasto de monto variable.

### Fase 5 — Ahorro
Destinar montos a `savings_goals` (transferencias internas, no afectan el balance general pero sí el progreso de la meta).

### Fase 6 — Tanque animado con sensor de movimiento
Widget con `react-native-reanimated` (`useSharedValue`, `useAnimatedStyle`) + `expo-sensors` (`DeviceMotion`, throttle bajo ~60ms para batería) representando el progreso de ahorro como nivel de agua que se inclina con el movimiento del teléfono.

### Fase 7 — Lectura de SMS bancarios (Android, último)
Módulo nativo Android vía Expo Modules API: `BroadcastReceiver` (`SMS_RECEIVED`) + lectura de histórico (`Telephony.Sms` content provider). Requiere permiso `READ_SMS` en `app.json` y build con `expo prebuild` (dev client, no Expo Go). Parser de mensajes por patrón de entidad bancaria → sugiere transacción, el usuario confirma antes de guardar.

## Verificación
- Cada fase: `npx tsc --noEmit`, `expo lint`, y correr la app (`expo start` / `make local-apk` para features nativas como sensores/notificaciones/SMS que no funcionan en Expo Go) para probar el flujo real en dispositivo/emulador Android.
- Fase 7 en particular solo se puede validar en un APK instalado directo (no Expo Go), acorde a lo ya acordado.

## Próximo paso inmediato
Arrancar por **Fase 0 + Fase 1** (fundaciones + modelo de datos), que es prerequisito de todo lo demás.

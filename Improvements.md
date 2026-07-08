# Improvements

## PocketWidget: animación de apertura con saltos (jank)

**Archivo**: `src/components/pocket-widget.tsx`

**Síntoma**: Al abrir la pestaña del bolsillo en "Asignar gastos" la animación de expansión (colapsado → esquina → fullscreen) se veía con saltos de tiempo, poco fluida.

**Causas**:

1. **La animación arrancaba tarde.** El `withTiming` que anima `progress` vivía dentro de un `useEffect` disparado por el cambio de `state`. Eso significa que la animación solo empezaba después de que React terminara de re-renderizar el widget y la pantalla padre completa — el `onCollapsedChange` dispara un `setState` en `asignar-gastos.tsx` que re-renderiza todos los `FloatingExpensePoint` en pantalla. Ese trabajo de JS bloqueaba los primeros frames antes de que la animación pudiera arrancar en el hilo de UI.

2. **El SVG de la ola se re-dibujaba entero en cada frame.** El wrapper de la ola (`waveWrapper`) estaba dimensionado en porcentaje del contenedor que anima `width`/`height` (de 130px a pantalla completa). Animar el tamaño de un `react-native-svg` fuerza re-layout y re-rasterización del vector en cada frame, en vez de ser una transformación barata en la GPU.

**Solución**:

- `updateState` ahora dispara `progress.value = withTiming(...)` de forma sincrónica en el handler del press, **antes** del `setState`. Así la animación arranca en el hilo de UI (Reanimated) inmediatamente, sin esperar al re-render de React ([pocket-widget.tsx:113-124](src/components/pocket-widget.tsx#L113-L124)).
- `waveWrapper` pasó a tener tamaño fijo (`COLLAPSED_SIZE` = 130px), anclado abajo a la derecha con `transformOrigin: 'right bottom'`, y se agranda mediante `transform: scale` interpolado entre `1` y `CORNER_SIZE / COLLAPSED_SIZE` ([pocket-widget.tsx:371-378](src/components/pocket-widget.tsx#L371-L378), estilo en [pocket-widget.tsx](src/components/pocket-widget.tsx) `waveWrapper`).

**Por qué el resultado es idéntico visualmente**: el contenedor mide `130 + 120·p` en el tramo colapsado→esquina, y la ola escalada mide `130 · (1 + p·(250/130 − 1))`, que da el mismo valor — coinciden pixel a pixel.

**Regla general para el proyecto**: nunca dimensionar un elemento `react-native-svg` en porcentaje de un contenedor cuyo `width`/`height` anima Reanimated — usar una capa de tamaño fijo + `transform: scale`. Y cuando un cambio de estado dispara re-renders pesados (listas, puntos flotantes, etc.), arrancar animaciones de Reanimated en el handler del evento en vez de en un `useEffect` posterior al render.

## Pantallas sin scroll (Movimientos, Secciones, Ajustes, Reglas recurrentes)

**Archivos**: `src/app/(tabs)/transactions.tsx`, `src/app/(tabs)/sections.tsx`, `src/app/(tabs)/settings.tsx`, `src/app/recurring-rules.tsx`

**Síntoma**: En dispositivo, ninguna de estas pantallas se podía scrollear ni arrastrar hacia abajo aunque el contenido excediera el alto visible.

**Causa**: Las cuatro pantallas usaban el `ScrollView` importado de `react-native-gesture-handler` en vez del `ScrollView` nativo de React Native. RNGH resuelve sus gestos contra el `GestureHandlerRootView` raíz declarado en `src/app/_layout.tsx`, pero:

- Las pestañas (`transactions`, `sections`, `settings`) se renderizan dentro de `NativeTabs` (`src/components/app-tabs.tsx`), que en Android/iOS son fragments/view controllers nativos de `react-native-screens` — una jerarquía nativa separada del árbol de `GestureHandlerRootView`.
- `recurring-rules.tsx` se registra con `presentation: 'modal'` en `src/app/_layout.tsx`, y los modales nativos de `react-native-screens` también montan fuera del `GestureHandlerRootView` raíz.

En ambos casos los toques de pan nunca llegaban al `ScrollView` de RNGH: la pantalla se veía bien pero no reaccionaba al arrastre. El único scroll que sí funcionaba en la app (el carrusel de tanques del Home, `src/app/(tabs)/index.tsx`) ya usaba el `ScrollView` nativo de `react-native`, lo cual confirmó el diagnóstico.

**Solución**: Reemplazar el import `ScrollView` de `react-native-gesture-handler` por el de `react-native` en las cuatro pantallas (solo cambia el import, el resto del código queda igual — `keyboardShouldPersistTaps`, estilos, etc. son API compatible entre ambos).

**Regla general para el proyecto**: no usar el `ScrollView` (u otros componentes) de `react-native-gesture-handler` en pantallas que vivan dentro de `NativeTabs` o de un `Stack.Screen` con `presentation: 'modal'` — esas jerarquías nativas quedan fuera del `GestureHandlerRootView` raíz y los gestos de RNGH no llegan. Usar siempre el `ScrollView` nativo de `react-native` salvo que se necesite explícitamente una feature de gesture-handler (en cuyo caso hay que envolver esa pantalla en su propio `GestureHandlerRootView` anidado).

**Pendiente de verificar**: `src/components/floating-expense-point.tsx` usa `GestureDetector` para el drag dentro de `asignar-gastos.tsx`, que es modal. No fue reportado como roto, pero por el mismo mecanismo descrito arriba podría estar afectado — si en el futuro aparece un bug de drag ahí, revisar primero si el `GestureDetector` está quedando fuera del `GestureHandlerRootView` raíz (ver solución aplicada a Home más abajo).

## Home sin scroll vertical y swipe de tarjetas potencialmente roto (NativeTabs)

**Archivo**: `src/app/(tabs)/index.tsx`

**Síntoma**: Al revisar Home tras el fix de las otras pantallas, aparecieron dos problemas relacionados con el mismo mecanismo de `NativeTabs`:

1. **Sin scroll vertical real**: a diferencia de las otras pantallas, Home nunca tuvo un `ScrollView` vertical envolviendo el contenido — el `SafeAreaView` era un simple contenedor flex-column con `gap`. Con el carrusel de tanques + la lista de "Gastos pendientes" (que crece con cada regla recurrente), el contenido puede superar el alto de pantalla y quedar inaccesible, sin forma de desplazarse.
2. **Swipe de `PendingExpenseCard` en riesgo**: la tarjeta de gasto pendiente usa `Gesture.Pan()` + `GestureDetector` (de `react-native-gesture-handler`) para deslizar y cambiar el tanque de origen. Igual que el `ScrollView` de RNGH en las otras pantallas, este componente depende de que el `GestureHandlerRootView` raíz (`src/app/_layout.tsx`) esté en el mismo árbol nativo — pero Home es una pantalla de `NativeTabs` (`src/components/app-tabs.tsx`), que monta su contenido en una superficie nativa separada (evidencia empírica: el mismo patrón fue la causa raíz confirmada del bug de scroll en Movimientos/Secciones/Ajustes/Reglas recurrentes).

**Solución**:

- Se agregó un `ScrollView` vertical nativo (`react-native`, no RNGH) envolviendo todo el contenido de Home (título, filtros, botón de búsqueda, carrusel de tanques y lista de gastos pendientes), con estilos `scrollView`/`scrollContent` siguiendo el mismo patrón que las demás pantallas ([index.tsx:270-390](<src/app/(tabs)/index.tsx#L270-L390>)).
- Se envolvió toda la pantalla en un `GestureHandlerRootView` anidado (`styles.gestureRoot`, `flex: 1`) para que el `GestureDetector` de `PendingExpenseCard` tenga una raíz de gestos válida dentro de la superficie nativa del tab.
- Se le agregó `.activeOffsetX([-10, 10]).failOffsetY([-10, 10])` al `Gesture.Pan()` de `PendingExpenseCard` ([index.tsx:820-822](<src/app/(tabs)/index.tsx#L820-L822>)) para que solo se active con arrastres predominantemente horizontales — sin esto, el pan competiría con el nuevo scroll vertical y podría bloquear el desplazamiento al tocar sobre una tarjeta.

**Regla general para el proyecto**: cualquier pantalla de `NativeTabs` o modal que use componentes de `react-native-gesture-handler` más allá de `ScrollView` (p. ej. `GestureDetector`/`Gesture.Pan`) necesita su propio `GestureHandlerRootView` anidado — el de `_layout.tsx` no alcanza esas superficies nativas. Y cuando se agrega un `ScrollView` vertical alrededor de contenido que ya tiene gestos de pan/swipe horizontales, restringir el gesto con `activeOffsetX`/`failOffsetY` para que no le gane la carrera al scroll.

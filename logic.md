# Lógica del Sistema de Finanzas

Este documento detalla la lógica de cálculo del tanque **Libre** y el flujo de edición de reglas recurrentes con preservación de historial.

---

## 1. Cálculo del Nivel del Tanque "Libre"

El nivel actual del dinero libre disponible se calcula de la siguiente manera:

$$\text{Nivel Libre} = (\text{Ingresos Libres [Históricos]} - \text{Gastos Libres [Históricos]}) + \text{Sobrante Ciclos Cerrados Activos} + \text{Sobrante Reglas Desactivadas/Archivadas}$$

### Desglose:

1. **Ingresos Libres [Históricos] - Gastos Libres [Históricos]**:
   - Transacciones digitadas manualmente que **no están asociadas a ninguna regla recurrente** (`recurringRuleId === null` para ingresos, y `allocatedIncomeRuleId === null` para gastos).
   - Se calculan sobre todo el historial de la aplicación, evitando pérdidas de saldo cuando el usuario cambia el rango del máximo a períodos muy cortos (ej. 1 día).

2. **Suma de sobrantes de ciclos cerrados de reglas activas**:
   - Para cada regla recurrente de ingreso activa, los fondos del período en curso (ej. del mes actual) se retienen dentro del tanque de esa regla y no van al Libre.
   - Cuando el período finaliza y la regla se renueva (el ciclo se cierra), el sobrante ($\text{Ingresos Recibidos en el ciclo} - \text{Gastos Asignados a ese ciclo}$) se transfiere definitivamente al fondo **Libre**.
   - Esto se acumula retroactivamente sobre todos los ciclos pasados completados de cada regla activa.

3. **Sobrante de reglas desactivadas (archivadas)**:
   - Dinero sobrante neto de reglas de ingresos que han sido desactivadas en el pasado.
   - $\text{Total ingresos históricos de la regla} - \text{Total gastos históricos asignados}$.
   - Evita la desaparición de fondos ahorrados de fuentes de ingresos del pasado que fueron archivadas o eliminadas de la vista activa.

---

## 2. Flujo de Edición de Reglas Recurrentes (Preservación de Historial)

Para evitar la corrupción o alteración de los cálculos de ciclos pasados cuando se modifica una regla recurrente (por ejemplo, si cambias el monto estimado o la frecuencia de un sueldo o alquiler):

### Procedimiento en Modificaciones:
1. **Desactivar la Regla Anterior**:
   - Se marca el registro existente como archivado/desactivado (`archivedAt = new Date()`).
   - Esto preserva las relaciones de las transacciones pasadas vinculadas a ese ID de regla, asegurando que el cálculo de sus ciclos cerrados permanezca intacto.
2. **Crear un Nuevo Registro**:
   - Se inserta una nueva fila en la tabla de reglas recurrentes con los datos y configuraciones confirmados.
   - Esta nueva regla comenzará a operar para los ciclos futuros.

### Interfaz de Usuario (UI):
- La acción anteriormente llamada **"Archivar"** se renombra a **"Desactivar"** para reflejar con mayor claridad este comportamiento.

---

## 3. Vista "Confirmar" — Hacer Efectivos Ingresos y Gastos Recurrentes

Antes de esta vista, las transacciones de ingreso recurrente **nunca se registraban**: Home avanzaba
`nextDueDate` de las reglas de ingreso vencidas en silencio (`rolloverDueIncomeRules`, ya eliminado), por
lo que los tanques de ingreso siempre quedaban en `received = 0`. La pestaña **Confirmar** es la pieza que
cierra ese ciclo: el usuario decide explícitamente cuándo un ingreso o gasto recurrente ya ocurrió en la
realidad, y recién ahí se crea la transacción.

### Detección de pendientes
- `computePendingConfirmations(rules, kind)` ([tanks.ts](src/db/queries/tanks.ts)) recorre cada regla activa
  del `kind` pedido con `nextDueDate < ahora`, y usa `advanceDate` para enumerar **todas** las fechas de
  ciclo vencidas (`occurrences`), hasta llegar a la primera fecha futura (`nextDueAfter`).
- Sin este cómputo, una regla mensual con 3 meses sin confirmar solo mostraría "1 pendiente"; con él se
  listan las 3 ocurrencias individuales para que el usuario decida cuáles hacer efectivas.

### Confirmación (una transacción por ciclo marcado)
- `confirmRecurringOccurrences(...)` ([transactions.ts](src/db/queries/transactions.ts)) crea una
  `transaction` por cada ocurrencia marcada, usando la **fecha de vencimiento del ciclo** como `occurredAt`
  (no la fecha actual), para que caiga en la ventana correcta de `computeIncomeTanks`/sobrantes. Luego
  actualiza `nextDueDate = nextDueAfter`, saltando de una sola vez todos los ciclos mostrados en el modal
  (marcados o no: los desmarcados se descartan, no vuelven a aparecer como pendientes).

### Reglas de negocio acordadas
1. **Monto fijo vs variable**: las filas de reglas fijas llegan pre-cargadas con `estimatedAmount` y
   marcadas; las variables llegan vacías y marcadas, exigiendo que el usuario cargue el monto de cada fila
   que decida confirmar (validación bloquea el botón si alguna fila marcada tiene monto ≤ 0).
2. **Selección de tanque para gastos**: al confirmar un gasto se busca en el historial la transacción más
   reciente de esa regla con `allocatedIncomeRuleId` no nulo (`findRememberedTankId`); si existe, se reusa
   sin preguntar. Si la regla nunca fue asignada a un tanque, el modal exige elegir uno de
   `computeIncomeTanks` antes de habilitar "Confirmar".
3. **Checklist con selección masiva**: el modal muestra una fila por ciclo pendiente (checkbox + fecha +
   monto), con botones "Seleccionar todos" / "Deseleccionar todos". Solo se registran las filas marcadas.
4. **Auto-rollover eliminado**: se quitó `rolloverDueIncomeRules` (Home) y su export en
   `recurring-rules.ts` — ya no tenía otro llamador. Ahora los ciclos de ingreso vencidos permanecen
   visibles en Confirmar hasta que el usuario los resuelve, en vez de avanzar solos sin dejar rastro.

### Archivos
- [src/db/queries/tanks.ts](src/db/queries/tanks.ts) — `computePendingConfirmations`, tipo `PendingConfirmation`.
- [src/db/queries/transactions.ts](src/db/queries/transactions.ts) — `confirmRecurringOccurrences`.
- [src/app/(tabs)/confirmar.tsx](src/app/(tabs)/confirmar.tsx) — pantalla nueva (toggle ingreso/gasto + cards + modal).
- [src/components/app-tabs.tsx](src/components/app-tabs.tsx) y [app-tabs.web.tsx](src/components/app-tabs.web.tsx) — registro del tab.
- [src/app/(tabs)/index.tsx](src/app/(tabs)/index.tsx) — remoción del `useEffect` de auto-rollover.

---

## 4. Asignar Gastos a un Tanque — Planificar vs. Confirmar

Arrastrar un gasto recurrente vencido a un tanque en `asignar-gastos` (o asignarlo desde
Home) **no** es lo mismo que confirmar que el pago ya ocurrió: es solo reservar de qué
tanque va a salir la plata. Antes de este cambio, asignar creaba una transacción real y
avanzaba `nextDueDate` en el acto — por lo que el gasto desaparecía de la pestaña Confirmar
aunque el usuario nunca hubiese confirmado el pago ahí.

### Planificación (`plannedTankRuleId`)
- Columna nueva en `recurring_rules`: `plannedTankRuleId` (nullable, referencia a otra fila
  de `recurring_rules`). Solo aplica a reglas `kind = 'expense'`.
- Al asignar (`assignExpenseToTank` en [transactions.ts](src/db/queries/transactions.ts))
  solo se setea esta columna. No se crea `transaction`, no se toca `nextDueDate`.
- `computePendingExpenses` ([tanks.ts](src/db/queries/tanks.ts)) deja de mostrar como
  burbuja flotante a las reglas con `plannedTankRuleId` seteado (ya están "adentro" de un
  tanque). `computePlannedExpenses` es la nueva fuente del Bolsillo (`PocketWidget`) en
  `asignar-gastos.tsx`: gastos vencidos con tanque planificado pero sin confirmar.
- El gasto **sigue** apareciendo en Confirmar (`computePendingConfirmations` no cambia su
  condición de `nextDueDate < ahora`) hasta que el usuario lo confirma ahí.

### Nivel del tanque reserva lo planificado
- `computeIncomeTanks` resta del `level` disponible, además de lo ya gastado
  (transacciones reales), el `estimatedAmount` de los gastos planificados-pero-no-
  confirmados de ese tanque (`nextDueDate < ahora && plannedTankRuleId === tank.ruleId`).
- No hay doble descuento: al confirmarse, `nextDueDate` avanza y la regla sale de ese
  filtro; el descuento pasa a salir de la transacción real recién creada.

### Confirmar ya sabe qué tanque usar
- `confirmRecurringOccurrences` crea la(s) transacción(es) reales y, si se usó un tanque,
  además persiste `plannedTankRuleId` en la regla — así el próximo ciclo ya vuelve a
  aparecer con el mismo tanque preseleccionado en Confirmar, sin tener que reasignar a
  mano en `asignar-gastos`.
- `findRememberedTankId` (búsqueda en el historial de transacciones) queda solo como
  *fallback* para reglas asignadas antes de esta migración, sin `plannedTankRuleId`.

### Sacar del tanque
- Como asignar nunca creó una transacción, `unassignExpenseFromTank` solo limpia
  `plannedTankRuleId`. Ya no hace falta revertir `nextDueDate` ni manejar el caso de
  "período ya pagado" (`unassignTransactionFromIncomeTank`, eliminada) — esa complejidad
  desaparece junto con la transacción prematura que la causaba.

### Archivos
- [src/db/schema.ts](src/db/schema.ts) — columna `plannedTankRuleId` en `recurringRules`,
  migración `0009_nappy_eternals.sql`.
- [src/db/queries/recurring-rules.ts](src/db/queries/recurring-rules.ts) —
  `updatePlannedTankRuleId`.
- [src/db/queries/tanks.ts](src/db/queries/tanks.ts) — `computePlannedExpenses`,
  reserva en `computeIncomeTanks`, `plannedTankRuleId` en `PendingConfirmation`.
- [src/db/queries/transactions.ts](src/db/queries/transactions.ts) —
  `assignExpenseToTank`, `splitAndAssignExpenseToTank`, `unassignExpenseFromTank`.
- [src/app/asignar-gastos.tsx](src/app/asignar-gastos.tsx), [src/app/(tabs)/index.tsx](src/app/(tabs)/index.tsx),
  [src/app/(tabs)/confirmar.tsx](src/app/(tabs)/confirmar.tsx).

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

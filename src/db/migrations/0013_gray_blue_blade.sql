-- SQLite prohibe un DEFAULT no constante (ej. unixepoch()) en ALTER TABLE ADD COLUMN
-- cuando la tabla ya tiene filas, aunque el mismo default sí vale en CREATE TABLE. Por
-- eso se agrega sin default (nullable) y se rellena con un UPDATE aparte; el código de
-- la app (createRecurringRule/createSpecialTank) ya setea updatedAt explícitamente en
-- cada insert, así que nunca depende de un default a nivel de columna.
ALTER TABLE `recurring_rules` ADD `updated_at` integer;
--> statement-breakpoint
UPDATE `recurring_rules` SET `updated_at` = unixepoch();
--> statement-breakpoint
-- Backfill: next_due_date antes de este fix podía arrastrar la hora exacta de creación
-- (ej. 14:32) en vez de medianoche, corriendo el "vencimiento" real a esa hora del día
-- en vez de al inicio del día. Se normaliza a medianoche hora local (start of day) para
-- que la unidad mínima de ciclo vuelva a ser el día, sin depender de la hora en que se
-- haya creado/editado la regla.
UPDATE `recurring_rules`
SET `next_due_date` = CAST(strftime('%s', `next_due_date`, 'unixepoch', 'localtime', 'start of day', 'utc') AS INTEGER);
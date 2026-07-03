-- ============================================================================
-- 0023 — Dimensiones adicionales del stock: Mundo y Embarque
--
-- Para los reportes de rotación por Mundo (MUNDO_LK) y Embarque (EXTRA1_LK),
-- que vienen en el archivo de stock. Se agregan a stock_snapshots (fuente de
-- atributos por variante). Requiere re-subir la foto de stock para poblarlas.
-- ============================================================================

alter table stock_snapshots add column if not exists mundo    text;
alter table stock_snapshots add column if not exists embarque text;

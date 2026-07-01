-- ============================================================================
-- 0017 — Nuevo rol: reponedor (usa Rack One - Repo)
--
-- ALTER TYPE ... ADD VALUE no puede usarse en la misma transacción que otra
-- sentencia que referencie el nuevo valor, por eso va en su propia migración.
-- ============================================================================

alter type user_role add value if not exists 'reponedor';

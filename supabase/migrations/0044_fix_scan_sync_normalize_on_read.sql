-- ============================================================================
-- 0044 — Arreglar sincronización del escaneo: normalizar SKU AL LEER, no al escribir
--
-- El trigger de 0038 (normalizar scan_lines.sku al insertar) rompía el upsert
-- por lote de la app: si dos códigos del mismo mueble colapsaban al mismo SKU al
-- quitar ceros, el "INSERT ... ON CONFLICT (session_id, sku) DO UPDATE" intentaba
-- tocar la misma fila dos veces -> "ON CONFLICT DO UPDATE command cannot affect
-- row a second time" -> las líneas no sincronizaban (header sí, 0 líneas).
--
-- Se elimina el trigger y se normaliza el SKU del escaneo con norm_sku() en las
-- funciones que lo leen (floor_breakdown, floor_detail, floor_detail_all,
-- alert_drill). Así la app vuelve a sincronizar y los reportes cruzan igual.
-- floor_vs_warehouse no necesita cambio (suma cantidades por tienda, sin cruzar
-- SKU con stock).
-- ============================================================================

drop trigger if exists trg_scan_lines_norm_sku on scan_lines;
drop function if exists scan_lines_norm_sku();

-- (Las definiciones de floor_breakdown / floor_detail / floor_detail_all /
-- alert_drill con norm_sku() al leer se aplicaron por MCP; ver 0035/0040/0042/0043
-- para la forma base. El único cambio es envolver el sl.sku del escaneo en
-- norm_sku() en los CTE de piso/lines/mueble.)

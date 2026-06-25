# Rack — Gestión de rotación y venta por mueble (multi-tienda)

Solución para medir la **rotación** y el **rendimiento por mueble** (exhibidor) en una cadena
multi-tienda. El personal de tienda escanea semanalmente cada mueble (que tiene su propio código de
barras) y cuenta las unidades por SKU. Las ventas de la semana se **adjudican a cada mueble por SKU**
y se calculan métricas de venta por mueble, rotación y comparativas semana a semana, visualizadas
sobre el **plano de la tienda** (mapa de calor).

## Componentes

| Carpeta      | Qué es | Tecnología |
|--------------|--------|------------|
| `supabase/`  | Base de datos, RLS, lógica de negocio (atribución y métricas) | PostgreSQL + Supabase |
| `web/`       | Web de administración (config, import Excel, reportes, plano) | Next.js + TypeScript |
| `mobile/`    | App Android para equipos Honeywell con scanner (offline-first) | Kotlin + Room |
| `docs/`      | Documentación funcional y de despliegue | Markdown |

## Conceptos clave

- **Mueble (fixture):** exhibidor físico con su propio código de barras y una posición (pin) en el plano.
- **Sesión de escaneo:** "foto" semanal del contenido de un mueble (SKU + cantidad).
- **Atribución por SKU:** una venta se asigna al mueble donde se escaneó ese SKU esa semana; si está en
  varios, al **primer mueble escaneado** (cronológicamente).
- **Almacén deducido:** stock de trastienda = stock total de la tienda − unidades escaneadas en piso.

## Roles

| Rol | Acceso |
|-----|--------|
| **Visual** | Configura muebles en el plano, asigna su código de barras y mantiene el layout. |
| **Operario de tienda** | App Android: escaneo semanal de su tienda. |
| **Encargado de tienda** | Reportes y gestión de su tienda. |
| **Administrador central** | Acceso total: todas las tiendas, catálogo, import, usuarios. |
| **Analista** | Solo lectura, todas las tiendas. |

## Estado

Fase 0/1 en curso. Ver `docs/ARCHITECTURE.md` y `docs/ROADMAP.md`.

# Guía de usuario (por rol)

Cómo usar Rack según tu rol. Glosario al final.

## Visual (merchandiser)
Configura el piso de venta.
1. **Plano** → elegí tu tienda → **Subir plano** (foto o imagen del layout).
2. Creá los **muebles** en *Muebles* (cada uno con su **código de barras** físico).
3. En *Plano*, seleccioná un mueble y **hacé clic en su ubicación** sobre la imagen (queda un pin).
4. Si un mueble se mueve, volvé a *Plano* y reubicá el pin. Si se da de baja, desactivalo en *Muebles*.

## Operario de tienda (app Android)
Hace el relevamiento semanal.
1. Ingresá con tu usuario en la app del equipo Honeywell.
2. **Escaneá el código del mueble** → se abre la sesión de ese mueble.
3. **Escaneá cada producto** del mueble; repetí el escaneo o usá +/− para ajustar la cantidad.
4. Tocá **Guardar sesión**. Repetí con el siguiente mueble.
5. La app funciona **sin internet**; cuando hay red sincroniza sola. Podés forzarla con **Sincronizar**.
   El contador *Pend.* muestra cuántas sesiones faltan subir.

## Encargado de tienda
Controla el avance y el rendimiento de su tienda.
- **Cobertura**: qué muebles ya se escanearon esta semana y cuáles faltan.
- **Reportes**: venta por mueble, comparativa semana a semana, heatmap y ventas "sin mueble".

## Administrador central
Configura todo y carga los datos.
1. **Importar** → *Catálogo* (una vez / cuando cambie).
2. Crear **Tiendas** y **Usuarios** (asignando rol y tienda).
3. Cada semana: **Importar** → *Ventas* y *Stock total* (elegí tienda y semana).
   Al importar ventas se calcula automáticamente la **atribución por mueble**.
4. Revisar **Reportes** y **Dashboard** (cobertura por tienda).

## Analista
Solo lectura de **Reportes** y **Dashboard** de todas las tiendas.

---

## Glosario
- **Mueble (fixture):** exhibidor físico con código de barras y posición (pin) en el plano.
- **Sesión de escaneo:** relevamiento de un mueble en una semana (SKU + cantidad).
- **Atribución:** asignación de una venta al mueble donde se escaneó ese SKU; si está en varios, al
  **primer mueble escaneado** de la semana.
- **Rotación:** unidades vendidas / stock expuesto (lo escaneado en el mueble).
- **Almacén (deducido):** stock total de la tienda − unidades en piso.
- **Semana:** semana ISO (ej. `2026-W26`).
- **Ventas sin mueble:** SKUs vendidos que no se escanearon en ningún mueble esa semana.

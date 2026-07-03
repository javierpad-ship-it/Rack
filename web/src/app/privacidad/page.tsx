// Página pública de Política de Privacidad (requerida por Google Play).
// Fuera del grupo (dashboard): no pasa por el layout con sesión y el
// middleware la excluye para que sea accesible sin login.
export const metadata = {
  title: 'Política de privacidad · Rack One',
  description: 'Política de privacidad de las apps Rack One (Inventario y Repo).',
};

const UPDATED = '3 de julio de 2026';

export default function PrivacidadPage() {
  return (
    <main
      style={{
        maxWidth: 760,
        margin: '0 auto',
        padding: '48px 20px 80px',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        lineHeight: 1.6,
        color: '#1a2233',
      }}
    >
      <h1 style={{ fontSize: '1.9rem', marginBottom: 4 }}>Política de privacidad — Rack One</h1>
      <p style={{ color: '#5b6b8c', marginTop: 0 }}>Última actualización: {UPDATED}</p>

      <p>
        Esta política aplica a las aplicaciones móviles <strong>Rack One – Inventario</strong> y{' '}
        <strong>Rack One – Repo</strong> (en adelante, “la app”) y a la plataforma web asociada,
        operadas por <strong>Geeksapp</strong>. La app es una herramienta de uso interno para el
        personal de tiendas, orientada a medir la rotación y el desempeño de la mercadería por mueble.
      </p>

      <h2>Qué datos tratamos</h2>
      <ul>
        <li>
          <strong>Datos de cuenta:</strong> correo electrónico y nombre del usuario, usados solo para
          autenticación y para asignar el usuario a su tienda y rol.
        </li>
        <li>
          <strong>Datos operativos que genera el usuario:</strong> códigos de mueble escaneados,
          códigos/SKU de productos y cantidades contadas, con fecha y hora de la sesión de escaneo.
        </li>
        <li>
          <strong>Datos técnicos mínimos:</strong> identificador de sesión local y estado de
          sincronización, necesarios para el funcionamiento sin conexión (offline).
        </li>
      </ul>
      <p>
        La app <strong>no</strong> recopila ubicación GPS, contactos, fotos, micrófono ni
        identificadores publicitarios, y <strong>no</strong> muestra publicidad.
      </p>

      <h2>Cómo se usan y almacenan</h2>
      <p>
        Los datos se usan únicamente para prestar el servicio: registrar los conteos de piso, calcular
        métricas de rotación y venta por mueble, y sincronizar la información de la tienda. Se almacenan
        de forma segura en <strong>Supabase</strong> (base de datos gestionada) con control de acceso por
        filas (RLS), de modo que cada usuario solo accede a la información de su tienda según su rol.
      </p>

      <h2>Compartición con terceros</h2>
      <p>
        No vendemos ni cedemos datos personales. Solo se usan proveedores de infraestructura necesarios
        para operar el servicio (alojamiento de base de datos y hosting web), que tratan los datos por
        cuenta nuestra y bajo sus propias medidas de seguridad.
      </p>

      <h2>Conservación</h2>
      <p>
        Los datos operativos se conservan mientras sean útiles para el análisis histórico (de forma
        predeterminada, hasta 24 meses) y las cuentas se conservan mientras el usuario esté activo.
        A solicitud del administrador de la cuenta, los datos pueden eliminarse.
      </p>

      <h2>Seguridad</h2>
      <p>
        El acceso requiere autenticación. Las comunicaciones viajan cifradas (HTTPS) y el acceso a los
        datos está restringido por rol y por tienda.
      </p>

      <h2>Derechos y contacto</h2>
      <p>
        Para consultar, corregir o eliminar datos, o para cualquier duda sobre esta política, escribe a{' '}
        <a href="mailto:javier.pad@gmail.com">javier.pad@gmail.com</a>. Atenderemos la solicitud a la
        brevedad razonable.
      </p>

      <h2>Cambios</h2>
      <p>
        Podemos actualizar esta política; publicaremos la nueva versión en esta misma página con su
        fecha de actualización.
      </p>
    </main>
  );
}

'use client';

import { useState } from 'react';

// Muestra el logo de Rack One (web/public/brand/rack-one-logo.png).
// Si el archivo no está disponible, cae a un lockup tipográfico (glifo 1E + texto),
// para que la UI nunca quede rota por una imagen faltante.
export default function BrandLogo({ variant }: { variant: 'login' | 'sidebar' }) {
  const [failed, setFailed] = useState(false);

  if (!failed) {
    return (
      <img
        className="logo"
        src="/brand/rack-one-logo.png"
        alt="Rack One"
        onError={() => setFailed(true)}
      />
    );
  }

  if (variant === 'login') {
    return (
      <>
        <span className="glyph">1E</span>
        <span className="mark">
          Rack<span className="on">One</span>
        </span>
      </>
    );
  }
  return (
    <>
      <span className="glyph">1E</span>
      <span className="brand-name">Rack One</span>
    </>
  );
}

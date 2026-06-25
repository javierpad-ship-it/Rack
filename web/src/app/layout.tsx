import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Rack — Administración',
  description: 'Gestión de rotación y venta por mueble',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

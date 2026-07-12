import type { Metadata, Viewport } from 'next';
import './globals.css';
import RegisterSW from '@/components/RegisterSW';

export const metadata: Metadata = {
  title: 'Prisma — Rack One',
  description: 'Consulta de producto y propuesta de precios en tienda.',
  manifest: '/manifest.webmanifest',
  // Safari (Add to Home Screen) no soporta SVG en apple-touch-icon: necesita PNG.
  // Chrome/Edge exigen al menos un ícono PNG (192/512) en el manifest para
  // ofrecer el prompt automático de instalación; el SVG solo no alcanza.
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: { capable: true, title: 'Prisma', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: '#0A1B4D',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}

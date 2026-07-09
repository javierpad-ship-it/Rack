import type { Metadata, Viewport } from 'next';
import './globals.css';
import RegisterSW from '@/components/RegisterSW';

export const metadata: Metadata = {
  title: 'Prisma — Rack One',
  description: 'Consulta de producto y propuesta de precios en tienda.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
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

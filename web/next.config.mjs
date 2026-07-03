/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Las cargas (ventas/stock) suben en lotes; damos holgura al límite de
    // tamaño de los Server Actions (por defecto 1 MB) por si algún lote crece.
    serverActions: {
      bodySizeLimit: '6mb',
    },
  },
};

export default nextConfig;

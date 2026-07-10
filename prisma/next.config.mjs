/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // El mockup estático vive en prisma/mockup y no forma parte de la app Next.
  // Encabezados para el service worker de la PWA.
  async headers() {
    return [
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
    ];
  },
};

export default nextConfig;

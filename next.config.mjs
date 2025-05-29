/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  images: {
    unoptimized: true,
  },
  distDir: 'out',
  // Disable API routes for the static export
  trailingSlash: true,
}

export default nextConfig;

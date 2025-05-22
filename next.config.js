/** @type {import('next').NextConfig} */
const nextConfig = {
<<<<<<< HEAD
  output: 'export',
=======
>>>>>>> main
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.cache = false;
    }
    return config;
  },
};

<<<<<<< HEAD
module.exports = nextConfig;
=======
module.exports = nextConfig;
>>>>>>> main

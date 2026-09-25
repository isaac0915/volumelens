/** @type {import('next').NextConfig} */
const nextConfig = {
  // Hide the dev-mode route indicator (it shows up in screenshots); errors still surface
  devIndicators: false,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/api/:path*',
      },
    ]
  },
};

export default nextConfig;

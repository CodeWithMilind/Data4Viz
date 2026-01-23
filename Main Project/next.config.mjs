/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      // IMPORTANT: Next.js API routes take precedence over rewrites
      // Routes in app/api/ are handled by Next.js, not proxied to backend
      // Only proxy routes that don't have Next.js API route handlers
      // 
      // Next.js API routes automatically take precedence over rewrites.
      // The following routes are proxied to backend only if no Next.js route exists:
      // - /api/workspaces/[workspaceId]/column-intelligence -> handled by Next.js
      // - /api/workspaces/[workspaceId]/dataset-intelligence -> handled by Next.js
      // - Other /api/* routes -> proxied to backend if no Next.js handler exists
      
      {
        // Proxy /api/overview and other backend API routes
        // Next.js routes in app/api/ will take precedence automatically
        source: '/api/overview',
        destination: 'http://localhost:3001/api/overview',
      },
      {
        source: '/workspaces/:path*',
        destination: 'http://localhost:3001/workspaces/:path*',
      },
      {
        source: '/dataset/:path*',
        destination: 'http://localhost:3001/dataset/:path*',
      },
      {
        source: '/cleaning/:path*',
        destination: 'http://localhost:3001/cleaning/:path*',
      },
    ];
  },
}

export default nextConfig

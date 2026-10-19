/** @type {import('next').NextConfig} */
const nextConfig = {
  // SEO: pin URL canonicalization so buildCanonical / sitemap / robots all
  // agree with what Next.js actually serves. trailingSlash=false matches
  // src/lib/seo/canonical.ts which strips trailing slashes, and resolves
  // the GSC "duplicate, user didn't select canonical" warning.
  trailingSlash: false,
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'submitmanager.com' },
      // Future OJS host — images from both origins are proxied through
      // /api/image-proxy, so this entry is a belt-and-suspenders guard for
      // any next/image references that may be added in future.
      { protocol: 'https', hostname: 'journals.digitopub.com' },
    ],
  },
  // Hostinger's build container caps threads/processes far below the 56 CPUs
  // Next detects; 56 page-data workers fail with EAGAIN (os error 11).
  experimental: { cpus: 2 },
  transpilePackages: ['@splinetool/react-spline', '@splinetool/runtime'],
  webpack: (config, { dev, isServer }) => {
    // Suppress source map warnings in development
    if (dev && !isServer) {
      config.devtool = 'cheap-module-source-map'
    }
    // @splinetool/react-spline exports only ESM ("import" condition) with
    // no "default"/"require" fallback. Ensure Webpack tries the "import"
    // condition when resolving package exports.
    if (!config.resolve.conditionNames?.includes('import')) {
      config.resolve.conditionNames = [
        ...(config.resolve.conditionNames || []),
        'import',
      ]
    }
    return config
  },
}

export default nextConfig

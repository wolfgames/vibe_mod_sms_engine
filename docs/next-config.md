# Next.js Configuration for Development vs Production

## Problem
Need to handle different Next.js configurations for development and production without using environment variables:
- **Development**: No `basePath`, no `assetPrefix`, no `output: 'export'`
- **Production**: Include `basePath`, `assetPrefix`, and `output: 'export'` for GitHub Pages deployment

## Solution: Separate Config Files with Package.json Scripts

### Approach
1. Create two separate config files:
   - `next.config.dev.js` - Development configuration
   - `next.config.prod.js` - Production configuration

2. Modify package.json scripts to automatically copy the correct config file to `next.config.js` before running commands

### Implementation Details

#### Development Config (`next.config.dev.js`)
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  experimental: {
    esmExternals: false,
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };
    return config;
  },
};

export default nextConfig;
```

#### Production Config (`next.config.prod.js`)
```javascript
/** @type {import('next').NextConfig} */
const repoName = 'vibe-mod-explore-location-map';

const nextConfig = {
  basePath: `/${repoName}`,
  assetPrefix: `/${repoName}/`,
  output: 'export',
  images: {
    unoptimized: true,
  },
  experimental: {
    esmExternals: false,
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };
    return config;
  },
};

export default nextConfig;
```

#### Updated Package.json Scripts
```json
{
  "scripts": {
    "dev": "cp next.config.dev.js next.config.js && next dev",
    "build": "cp next.config.prod.js next.config.js && next build",
    "start": "next start",
    "lint": "next lint"
  }
}
```

### Benefits
- ✅ No environment variables required
- ✅ No manual intervention needed
- ✅ Automatic switching based on npm script
- ✅ Clean separation of development and production configs
- ✅ Works on all platforms (uses `cp` command)

### Usage
- **Development**: `npm run dev` (automatically uses dev config)
- **Production Build**: `npm run build` (automatically uses prod config)
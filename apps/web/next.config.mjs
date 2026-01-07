/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    transpilePackages: ["@maiyuri/ui", "@maiyuri/shared", "@maiyuri/api"],
};

export default nextConfig;

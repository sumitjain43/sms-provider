/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@sms-gateway/shared', '@sms-gateway/api-client'],
};

export default nextConfig;

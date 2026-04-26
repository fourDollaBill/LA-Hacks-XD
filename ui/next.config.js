/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  compiler: {
    styledJsx: true,
  },
  webpack: (config) => {
    config.resolve.alias['@'] = path.resolve(__dirname);
    return config;
  },
};

module.exports = nextConfig;

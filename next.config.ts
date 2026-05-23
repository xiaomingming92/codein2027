import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 开发环境允许跨域请求
  // allowedDevOrigins: ["192.168.2.188", "192.168.0.104", "192.168.0.101", "localhost", "127.0.0.1", "192.168.0.247", "192.168.0.100", "*"],
  allowedDevOrigins: ["192.168.*.*"]
};

export default nextConfig;

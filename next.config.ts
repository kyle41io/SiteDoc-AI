import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Static export. The app is served from S3 behind CloudFront with no compute
   * in the page path, which is the entire point of the AWS migration: no cold
   * start on first paint. The API, PDF renderer and scan worker are Lambdas.
   *
   * Consequences, all deliberate: no route handlers, no dynamic segments
   * without `generateStaticParams`, no server-side data fetching.
   */
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;

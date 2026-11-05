// Paths that only scanners request. Each is rewritten to the honeypot handler (src/app/api/trap/route.ts).
const TRAPS = ["/.env", "/.env.:ext*", "/.git/:path*", "/.aws/:path*", "/.ssh/:path*", "/wp-admin/:path*", "/wp-login.php", "/wp-content/:path*", "/xmlrpc.php", "/phpmyadmin/:path*", "/pma/:path*",
  "/admin.php", "/administrator/:path*", "/server-status", "/actuator/:path*", "/cgi-bin/:path*", "/vendor/phpunit/:path*", "/backup.sql", "/db.sql", "/dump.sql", "/config.json", "/id_rsa", "/boaform/:path*", "/solr/:path*"];

// Static headers for everything; the nonce-based Content-Security-Policy is added per request in src/middleware.ts.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), interest-cohort=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  serverExternalPackages: ["mongoose", "nodemailer", "@aws-sdk/client-s3"],
  // Server Actions verify Origin against Host; behind a proxy, list the public host explicitly.
  experimental: { serverActions: { bodySizeLimit: "1mb", allowedOrigins: process.env.APP_URL ? [new URL(process.env.APP_URL).host] : undefined } },
  async rewrites() {
    return TRAPS.map((source) => ({ source, destination: `/api/trap?t=${encodeURIComponent(source.replace(/[:*].*$/, ""))}` }));
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;

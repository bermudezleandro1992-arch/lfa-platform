/** @type {import('next').NextConfig} */

const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Scripts: propios + Firebase Auth + Google login + reCAPTCHA + Facebook + GTM
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com https://www.google.com https://www.gstatic.com https://connect.facebook.net https://www.googletagmanager.com",
      // Estilos: propios + Google Fonts
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // Fuentes: Google Fonts
      "font-src 'self' https://fonts.gstatic.com",
      // Imágenes: propios + blobs + Google/Facebook avatars + Firebase Storage
      "img-src 'self' blob: data: https://*.googleusercontent.com https://*.facebook.com https://*.fbcdn.net https://firebasestorage.googleapis.com https://www.gstatic.com",
      // Conexiones: Firebase + Binance + Google Analytics + Twitch/YouTube API
      "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://firebasestorage.googleapis.com https://*.cloudfunctions.net https://*.run.app https://*.binance.com https://bpay.binanceapi.com https://accounts.google.com https://www.google-analytics.com https://www.googletagmanager.com https://api.twitch.tv https://*.twitch.tv wss://*.twitch.tv https://*.kick.com https://www.youtube.com https://utas.s2.ea.com https://utas.s3.ea.com https://utas.s4.ea.com https://utas.s5.ea.com https://utas.s6.ea.com https://utas.s7.ea.com https://utas.s8.ea.com https://utas.s9.ea.com https://utas.s10.ea.com https://utas.s11.ea.com https://we-pes-mobile.konami.net https://pes.konami.net https://pes-gameserver.konami.net",
      // Frames: Google login + Firebase Auth + Facebook + reCAPTCHA + YouTube + Twitch + Kick (LFA TV)
      "frame-src https://accounts.google.com https://www.google.com https://lfaofficial.firebaseapp.com https://www.facebook.com https://www.youtube.com https://www.youtube-nocookie.com https://player.twitch.tv https://clips.twitch.tv https://player.kick.com https://kick.com",
      // Workers: Service Worker
      "worker-src 'self' blob:",
    ].join('; '),
  },
];

// Cache para assets estáticos (imágenes, fuentes, JS, CSS)
const staticCacheHeaders = [
  { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
];

const nextConfig = {
  poweredByHeader: false,

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'graph.facebook.com' },
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
    ],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 86400,
  },

  async headers() {
    return [
      // Security headers en todas las rutas
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      // Cache agresivo para assets estáticos de Next.js (_next/static)
      {
        source: '/_next/static/(.*)',
        headers: staticCacheHeaders,
      },
      // Cache para archivos públicos (favicon, manifest, sw.js excepto)
      {
        source: '/assets/(.*)',
        headers: staticCacheHeaders,
      },
      // Service Worker: sin cache para que siempre se actualice
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ];
  },

  async rewrites() {
    return [
      {
        source: '/__/auth/:path*',
        destination: 'https://lfaofficial.firebaseapp.com/__/auth/:path*',
      },
    ];
  },
};

export default nextConfig;

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
    // CSP ajustado para el stack real de LFA:
    // Firebase Auth, Firestore, Firebase Storage, Google Fonts,
    // Google/Facebook login, Binance Pay, Fixie proxy
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Scripts: propios + Firebase Auth UI + Google/Facebook login
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com https://connect.facebook.net https://www.googletagmanager.com",
      // Estilos: propios + Google Fonts
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // Fuentes: Google Fonts
      "font-src 'self' https://fonts.gstatic.com",
      // Imágenes: propios + blobs + Google/Facebook avatars + Firebase Storage
      "img-src 'self' blob: data: https://*.googleusercontent.com https://*.facebook.com https://*.fbcdn.net https://firebasestorage.googleapis.com",
      // Conexiones: Firebase (Auth/Firestore/Storage/Functions) + Binance + Google Analytics
      "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://firebasestorage.googleapis.com https://*.cloudfunctions.net https://*.run.app https://*.binance.com https://bpay.binanceapi.com https://accounts.google.com https://www.google-analytics.com https://www.googletagmanager.com",
      // Frames: Google login popup + Facebook login
      "frame-src https://accounts.google.com https://lfaofficial.firebaseapp.com https://www.facebook.com",
      // Workers: solo propios (Service Worker)
      "worker-src 'self' blob:",
    ].join('; '),
  },
];

const nextConfig = {
  poweredByHeader: false, // No revelar que usamos Next.js

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'graph.facebook.com' },
    ],
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

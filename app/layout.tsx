import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    template: '%s | SomosLFA',
    default:  'SomosLFA — Torneos de FC 26 y eFootball',
  },
  description:
    'La plataforma de torneos de eSports más competitiva de LATAM. FC 26, eFootball, 1vs1, 2vs2, Clubes Pro.',
  keywords: ['torneos FC 26', 'eFootball', 'eSports LATAM', 'SomosLFA', 'torneos online'],
  authors: [{ name: 'Gestión SM' }],
  metadataBase: new URL('https://somoslfa.com'),
  openGraph: {
    title:       'SomosLFA — Torneos de FC 26 y eFootball',
    description: 'Competí en los mejores torneos de eSports de LATAM.',
    url:         'https://somoslfa.com',
    siteName:    'SomosLFA',
    locale:      'es_AR',
    type:        'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#00ff88',
  width:      'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es-AR">
      <body className="bg-lfa-bg text-lfa-light antialiased">
        {children}
      </body>
    </html>
  );
}

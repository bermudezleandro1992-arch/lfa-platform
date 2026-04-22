'use client';

import { useEffect } from 'react';
import { initAppCheck } from '@/lib/firebase';

/**
 * Inicializa Firebase App Check (reCAPTCHA v3) una sola vez en el browser.
 * Debe montarse lo más alto posible en el árbol — en el RootLayout.
 * No renderiza nada visible.
 */
export default function AppCheckProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initAppCheck();
  }, []);

  return <>{children}</>;
}

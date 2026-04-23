/**
 * lib/fingerprint.ts
 * Wrapper sobre @fingerprintjs/fingerprintjs.
 * Se llama UNA SOLA VEZ por sesión (resultado cacheado en módulo).
 * Solo corre en el browser (typeof window !== 'undefined').
 */

import FingerprintJS from '@fingerprintjs/fingerprintjs';

let cachedVisitorId: string | null = null;

/**
 * Devuelve el visitorId de FingerprintJS para este dispositivo/browser.
 * En el primer llamado inicializa el agente (~50ms).
 * Los llamados siguientes devuelven el valor cacheado instantáneamente.
 */
export async function getVisitorId(): Promise<string> {
  if (typeof window === 'undefined') return '';
  if (cachedVisitorId) return cachedVisitorId;

  try {
    const fp = await FingerprintJS.load();
    const result = await fp.get();
    cachedVisitorId = result.visitorId;
    return cachedVisitorId;
  } catch {
    // Si falla (bloqueado por extensión, etc.) devuelve cadena vacía
    return '';
  }
}

/**
 * lib/binance.ts
 * Cliente seguro para la API de retiros de Binance (solo server-side).
 * NUNCA importar este archivo desde componentes cliente.
 *
 * Documentación: https://developers.binance.com/docs/wallet/capital/withdraw
 *
 * Seguridad implementada:
 *  - Firma HMAC-SHA256 en cada request
 *  - Keys leídas exclusivamente desde variables de entorno
 *  - Timeout de 10 s en cada llamada
 *  - recvWindow de 5 000 ms para prevenir replay attacks
 *  - Proxy Fixie (IP estática) para cumplir whitelist de Binance
 */

import crypto from 'crypto';
import { ProxyAgent } from 'undici';

const BASE_URL   = 'https://api.binance.com';
const RECV_WINDOW = 5_000;   // ms — ventana anti-replay
const TIMEOUT_MS  = 10_000;  // ms

/* ─── Redes soportadas ─────────────────────────────── */
export type BinanceNetwork = 'TRX' | 'BSC';

/* ─── Resultado de retiro ─────────────────────────── */
export interface BinanceWithdrawResult {
  ok:      boolean;
  id?:     string;   // Binance withdrawal ID
  error?:  string;
  raw?:    unknown;
}

/* ─── Firma HMAC-SHA256 ─────────────────────────────── */
function sign(queryString: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(queryString)
    .digest('hex');
}

/* ─── Solicitar retiro en Binance ───────────────────── */
export async function binanceWithdraw(params: {
  address:  string;
  amount:   number;    // en USDT, ej: 12.50
  network:  BinanceNetwork;
  clientId: string;    // ID único interno (evita duplicados)
}): Promise<BinanceWithdrawResult> {
  const apiKey    = process.env.BINANCE_API_KEY;
  const apiSecret = process.env.BINANCE_API_SECRET;

  if (!apiKey || !apiSecret) {
    return { ok: false, error: 'Binance API no configurada.' };
  }

  // Validar dirección: solo caracteres alfanuméricos (sin injection)
  if (!/^[A-Za-z0-9]{15,100}$/.test(params.address)) {
    return { ok: false, error: 'Dirección de billetera inválida.' };
  }

  // Limitar decimales a 4 para evitar errores de precisión
  const amount = parseFloat(params.amount.toFixed(4));

  const queryParams: Record<string, string | number> = {
    coin:            'USDT',
    address:         params.address,
    amount,
    network:         params.network,
    withdrawOrderId: params.clientId,   // idempotency key
    timestamp:       Date.now(),
    recvWindow:      RECV_WINDOW,
  };

  // Construir query string determinístico
  const queryString = Object.entries(queryParams)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');

  const signature = sign(queryString, apiSecret);
  const fullQuery = `${queryString}&signature=${signature}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  // Proxy con IP estática (Fixie) — requerido por Binance whitelist
  const dispatcher = process.env.FIXIE_URL
    ? new ProxyAgent(process.env.FIXIE_URL)
    : undefined;

  try {
    const res = await fetch(`${BASE_URL}/sapi/v1/capital/withdraw/apply?${fullQuery}`, {
      method:  'POST',
      headers: {
        'X-MBX-APIKEY': apiKey,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      // @ts-expect-error — undici dispatcher compatible con Node.js fetch
      dispatcher,
    });

    const data = await res.json() as { id?: string; code?: number; msg?: string };

    if (!res.ok || !data.id) {
      return {
        ok:    false,
        error: data.msg ?? `HTTP ${res.status}`,
        raw:   data,
      };
    }

    return { ok: true, id: data.id, raw: data };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error de red';
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

/* ─── Verificar estado de un retiro ─────────────────── */
export async function binanceWithdrawStatus(withdrawId: string): Promise<{
  status?: number;  // 0=Email sent, 2=Awaiting approval, 3=Rejected, 4=Processing, 5=Failure, 6=Completed
  txId?:   string;
  error?:  string;
}> {
  const apiKey    = process.env.BINANCE_API_KEY;
  const apiSecret = process.env.BINANCE_API_SECRET;
  if (!apiKey || !apiSecret) return { error: 'Binance API no configurada.' };

  const queryParams: Record<string, string | number> = {
    withdrawOrderId: withdrawId,
    timestamp:       Date.now(),
    recvWindow:      RECV_WINDOW,
  };
  const queryString = Object.entries(queryParams)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  const signature = sign(queryString, apiSecret);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const dispatcher = process.env.FIXIE_URL
    ? new ProxyAgent(process.env.FIXIE_URL)
    : undefined;

  try {
    const res = await fetch(
      `${BASE_URL}/sapi/v1/capital/withdraw/history?${queryString}&signature=${signature}`,
      {
        headers: { 'X-MBX-APIKEY': apiKey },
        signal:  controller.signal,
        // @ts-expect-error — undici dispatcher compatible con Node.js fetch
        dispatcher,
      },
    );
    const data = await res.json() as Array<{ status?: number; txId?: string }>;
    if (Array.isArray(data) && data.length > 0) {
      return { status: data[0].status, txId: data[0].txId };
    }
    return { error: 'No encontrado' };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Error de red' };
  } finally {
    clearTimeout(timer);
  }
}

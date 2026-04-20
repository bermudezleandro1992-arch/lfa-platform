import { NextRequest, NextResponse } from 'next/server';
import type { RegionDetectionResult } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Mapas de regiones — basado en ISO 3166-1 alpha-2
// ─────────────────────────────────────────────────────────────────────────────
const LATAM_SUR = new Set([
  'AR', 'UY', 'CL', 'BO', 'PY', 'PE', 'BR', 'CO', 'EC', 'VE', 'GY', 'SR', 'FK',
]);

const LATAM_NORTE = new Set([
  'MX', 'GT', 'HN', 'SV', 'NI', 'CR', 'PA', 'CU', 'DO', 'PR', 'HT', 'JM',
  'TT', 'BB', 'LC', 'VC', 'GD', 'AG', 'DM', 'KN', 'BZ',
]);

const AMERICA = new Set(['US', 'CA']);

type Region = 'LATAM_SUR' | 'LATAM_NORTE' | 'AMERICA' | 'GLOBAL';

function getRegion(countryCode: string | undefined): Region {
  if (!countryCode) return 'GLOBAL';
  if (LATAM_SUR.has(countryCode))   return 'LATAM_SUR';
  if (LATAM_NORTE.has(countryCode)) return 'LATAM_NORTE';
  if (AMERICA.has(countryCode))     return 'AMERICA';
  return 'GLOBAL';
}

// ─────────────────────────────────────────────────────────────────────────────
// Detección de VPN/Proxy por ASN/Org name (heurística, sin pago)
// Para producción de alto riesgo: usar ipqualityscore.com o proxycheck.io
// ─────────────────────────────────────────────────────────────────────────────
const VPN_KEYWORDS = [
  'vpn', 'proxy', 'tor', 'anonymiz', 'datacenter', 'hosting',
  'cloud', 'server', 'digitalocean', 'linode', 'vultr',
  'amazon', 'google cloud', 'microsoft azure', 'ovh', 'hetzner',
];

function detectVpnByOrg(org: string | undefined): boolean {
  if (!org) return false;
  const lower = org.toLowerCase();
  return VPN_KEYWORDS.some((keyword) => lower.includes(keyword));
}

// ─────────────────────────────────────────────────────────────────────────────
// Extrae la IP real del request (funciona con proxies/CDNs)
// ─────────────────────────────────────────────────────────────────────────────
function extractClientIp(request: NextRequest): string {
  const xForwardedFor = request.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    // El primer IP en la cadena es el cliente real
    const ip = xForwardedFor.split(',')[0].trim();
    if (isValidIp(ip)) return ip;
  }

  const xRealIp = request.headers.get('x-real-ip');
  if (xRealIp && isValidIp(xRealIp)) return xRealIp;

  // Fallback: Vercel/Cloudflare headers
  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  if (cfConnectingIp && isValidIp(cfConnectingIp)) return cfConnectingIp;

  return '0.0.0.0';
}

function isValidIp(ip: string): boolean {
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6 = /^[0-9a-fA-F:]+$/;
  return ipv4.test(ip) || ipv6.test(ip);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipo de respuesta de ipapi.co
// ─────────────────────────────────────────────────────────────────────────────
interface IpapiResponse {
  country_code?: string;
  country_name?: string;
  city?:         string;
  region?:       string;
  org?:          string;
  error?:        boolean;
  reason?:       string;
}

// RegionDetectionResult está definido en lib/types.ts (compartido cliente/servidor)

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/detect-region
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const ip = extractClientIp(request);

  // En localhost/desarrollo, ipapi.co devuelve error — usamos fallback
  if (ip === '0.0.0.0' || ip === '127.0.0.1' || ip === '::1') {
    const fallback: RegionDetectionResult = {
      region:      'LATAM_SUR',
      country:     'AR',
      countryName: 'Argentina (local dev)',
      city:        'Local',
      isVpn:       false,
      ip:          ip,
    };
    return NextResponse.json(fallback);
  }

  try {
    const apiBase = process.env.IP_API_BASE_URL ?? 'https://ipapi.co';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(`${apiBase}/${ip}/json/`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'SomosLFA-Server/1.0' },
    });
    clearTimeout(timeout);

    if (!response.ok) throw new Error(`ipapi.co HTTP ${response.status}`);

    const data: IpapiResponse = await response.json();

    if (data.error) {
      throw new Error(data.reason ?? 'ipapi error');
    }

    const detectedRegion = getRegion(data.country_code);
    const isVpn = detectVpnByOrg(data.org);

    const result: RegionDetectionResult = {
      region:      detectedRegion,
      country:     data.country_code     ?? 'XX',
      countryName: data.country_name     ?? 'Unknown',
      city:        data.city             ?? 'Unknown',
      isVpn,
      ...(process.env.NODE_ENV === 'development' && { ip }),
    };

    return NextResponse.json(result, {
      headers: {
        // Cache corto — la IP puede cambiar entre sesiones
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch (err) {
    console.error('[detect-region] Error:', err);

    // Fallback seguro — no bloqueamos al usuario por error del servicio externo
    const fallback: RegionDetectionResult = {
      region:      'GLOBAL',
      country:     'XX',
      countryName: 'Unknown',
      city:        'Unknown',
      isVpn:       false,
    };

    return NextResponse.json(fallback, { status: 200 });
  }
}

// Tipos compartidos para detección de región — seguros en cliente y servidor
export interface RegionDetectionResult {
  region: 'LATAM_SUR' | 'LATAM_NORTE' | 'AMERICA' | 'GLOBAL' | 'EUROPA';
  country: string;
  countryName: string;
  city: string;
  isVpn: boolean;
  ip?: string;
  isBanned?: boolean;
}

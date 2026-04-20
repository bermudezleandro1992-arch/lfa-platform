'use client';
import { useRouter } from 'next/navigation';

interface LegalLayoutProps {
  title: string;
  emoji: string;
  accentColor: string;
  h2Color: string;
  date?: string;
  children: React.ReactNode;
}

export default function LegalLayout({ title, emoji, accentColor, h2Color, date, children }: LegalLayoutProps) {
  const router = useRouter();
  return (
    <div style={{ margin: 0, fontFamily: "'Roboto', sans-serif", background: '#0b0e14', color: 'white', minHeight: '100vh', lineHeight: 1.6 }}>
      <header style={{
        background: 'rgba(7,9,13,0.95)',
        padding: '15px 5%',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: `2px solid ${accentColor}`,
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '1.5rem', fontWeight: 700, color: 'white', letterSpacing: 2 }}>
          SOMOS<span style={{ color: accentColor }}>LFA</span>
        </span>
        <button onClick={() => router.back()} style={{
          background: 'transparent',
          border: '1px solid #8b949e',
          color: 'white',
          padding: '8px 15px',
          borderRadius: 8,
          fontFamily: "'Orbitron', sans-serif",
          fontSize: '0.8rem',
          transition: '0.3s',
          cursor: 'pointer',
        }}>
          ← VOLVER
        </button>
      </header>

      <div style={{ padding: '30px 16px 60px' }}>
        <div style={{
          maxWidth: 800,
          margin: '0 auto',
          background: '#161b22',
          border: `1px solid ${accentColor}`,
          borderRadius: 15,
          padding: 'clamp(20px, 5vw, 40px)',
          boxShadow: `0 10px 30px rgba(0,0,0,0.5), 0 0 20px ${accentColor}18`,
        }}>
          <h1 style={{
            fontFamily: "'Orbitron', sans-serif",
            color: accentColor,
            textAlign: 'center',
            fontSize: 'clamp(1.4rem, 4vw, 2.2rem)',
            marginTop: 0,
            lineHeight: 1.3,
            borderBottom: '1px solid #30363d',
            paddingBottom: 16,
          }}>
            {emoji} {title}
          </h1>
          {date && <p style={{ fontSize: '0.85rem', color: '#8b949e', marginTop: 0 }}>Última actualización: {date}</p>}

          <style>{`.legal-h2{font-family:Orbitron,sans-serif;color:${h2Color};font-size:clamp(0.9rem,2.5vw,1.1rem);margin-top:35px;border-bottom:1px solid #30363d;padding-bottom:8px;}.legal-p,.legal-ul li{color:#c9d1d9;font-size:1rem;margin-bottom:10px;}.legal-ul{padding-left:20px;}.legal-ul li{margin-bottom:10px;}.warning-box{background:rgba(255,71,87,0.08);border-left:4px solid #ff4757;padding:15px;margin:20px 0;border-radius:5px;}`}</style>
          {children}
        </div>
      </div>
    </div>
  );
}

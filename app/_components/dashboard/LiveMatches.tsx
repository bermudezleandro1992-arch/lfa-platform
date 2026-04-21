'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface LiveTournament {
  id: string;
  game: string;
  mode: string;
  region: string;
  tier: string;
  entry_fee: number;
  prize_pool: number;
  capacity: number;
  players: string[];
  status: string;
  created_at: any;
  champion_name?: string;
}

const TIER_COLOR: Record<string, string> = {
  FREE:        '#8b949e',
  RECREATIVO:  '#3fb950',
  COMPETITIVO: '#58a6ff',
  ELITE:       '#ffd700',
};

const GAME_LABEL: Record<string, string> = {
  FC26:      '⚽ FC 26',
  EFOOTBALL: '🟡 eFootball',
};

const MODE_LABEL: Record<string, string> = {
  GENERAL_95: 'General 95',
  ULTIMATE:   'Ultimate Team',
  DREAM_TEAM: 'Dream Team',
  GENUINOS:   'Genuinos',
};

const REGION_LABEL: Record<string, string> = {
  LATAM_SUR:   '🇦🇷 LATAM SUR',
  LATAM_NORTE: '🇲🇽 LATAM NORTE',
  AMERICA:     '🌎 AMERICA',
};

export default function LiveMatches() {
  const [matches, setMatches]   = useState<LiveTournament[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'tournaments'),
      where('status', '==', 'ACTIVE'),
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() })) as LiveTournament[];
      list.sort((a, b) => (b.created_at?.toMillis?.() ?? 0) - (a.created_at?.toMillis?.() ?? 0));
      setMatches(list);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid #1c2028', borderTop: '2px solid #ff4757', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: '#8b949e' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🎮</div>
        <p style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '0.85rem', letterSpacing: 1 }}>
          No hay partidas en curso ahora mismo.
        </p>
        <p style={{ fontSize: '0.78rem', marginTop: 8 }}>Volvé en unos minutos.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#ff4757', boxShadow: '0 0 8px #ff4757', animation: 'pulse 1.5s ease-in-out infinite' }} />
        <h2 style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '0.9rem', color: '#ff4757', margin: 0, letterSpacing: 2, fontWeight: 900 }}>
          EN JUEGO — {matches.length} partida{matches.length !== 1 ? 's' : ''} activa{matches.length !== 1 ? 's' : ''}
        </h2>
      </div>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
        {matches.map(m => (
          <div key={m.id} style={{
            background: '#161b22',
            border: '1px solid #21262d',
            borderRadius: 10,
            padding: '14px 16px',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* EN VIVO badge */}
            <div style={{
              position: 'absolute', top: 10, right: 10,
              background: '#ff4757', color: '#fff',
              fontSize: '0.58rem', fontFamily: "'Orbitron', sans-serif",
              fontWeight: 900, padding: '2px 7px', borderRadius: 4,
              letterSpacing: 1.5, animation: 'pulse 1.5s ease-in-out infinite',
            }}>
              EN VIVO
            </div>

            {/* Game + mode */}
            <div style={{ color: '#e6edf3', fontWeight: 700, fontSize: '0.82rem', marginBottom: 4 }}>
              {GAME_LABEL[m.game] ?? m.game}
            </div>
            <div style={{ color: '#8b949e', fontSize: '0.72rem', marginBottom: 10 }}>
              {MODE_LABEL[m.mode] ?? m.mode}
            </div>

            {/* Stats row */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <span style={{
                background: '#0d1117', border: `1px solid ${TIER_COLOR[m.tier] ?? '#30363d'}`,
                color: TIER_COLOR[m.tier] ?? '#8b949e',
                fontSize: '0.65rem', padding: '2px 8px', borderRadius: 4,
                fontFamily: "'Orbitron', sans-serif", fontWeight: 700,
              }}>
                {m.tier}
              </span>
              <span style={{ background: '#0d1117', border: '1px solid #21262d', color: '#8b949e', fontSize: '0.65rem', padding: '2px 8px', borderRadius: 4 }}>
                {REGION_LABEL[m.region] ?? m.region}
              </span>
            </div>

            {/* Players & prize */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              <span style={{ color: '#58a6ff', fontSize: '0.72rem' }}>
                👥 {m.players?.length ?? 0}/{m.capacity} jugadores
              </span>
              {m.entry_fee > 0 && (
                <span style={{ color: '#ffd700', fontSize: '0.72rem' }}>
                  🏆 {m.prize_pool.toLocaleString()} LFA
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes spin  { to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}

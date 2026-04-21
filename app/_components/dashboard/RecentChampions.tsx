'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface FinishedTournament {
  id: string;
  game: string;
  mode: string;
  region: string;
  tier: string;
  entry_fee: number;
  prize_pool: number;
  capacity: number;
  champion_name?: string;
  champion_uid?: string;
  winner?: string;
  winner_name?: string;
  finished_at?: any;
  updated_at?: any;
  created_at?: any;
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

function getChampionName(t: FinishedTournament): string | null {
  return t.champion_name ?? t.winner_name ?? t.winner ?? null;
}

function timeAgo(ts: any): string {
  if (!ts) return '';
  const ms = ts?.toMillis?.() ?? (typeof ts === 'number' ? ts : null);
  if (!ms) return '';
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'Hace un momento';
  if (m < 60) return `Hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Hace ${h}h`;
  return `Hace ${Math.floor(h / 24)}d`;
}

export default function RecentChampions() {
  const [champs,  setChamps]  = useState<FinishedTournament[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const q = query(
          collection(db, 'tournaments'),
          where('status', '==', 'FINISHED'),
          limit(30),
        );
        const snap = await getDocs(q);
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() })) as FinishedTournament[];
        // Sort by most recent finished_at / updated_at / created_at
        list.sort((a, b) => {
          const ta = (a.finished_at ?? a.updated_at ?? a.created_at)?.toMillis?.() ?? 0;
          const tb = (b.finished_at ?? b.updated_at ?? b.created_at)?.toMillis?.() ?? 0;
          return tb - ta;
        });
        setChamps(list);
      } catch { /* silencioso */ } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid #1c2028', borderTop: '2px solid #ffd700', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  if (champs.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: '#8b949e' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🏆</div>
        <p style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '0.85rem', letterSpacing: 1 }}>
          Todavía no hay campeones registrados.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px', maxWidth: 960, margin: '0 auto' }}>
      <h2 style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '0.9rem', color: '#ffd700', margin: '0 0 20px', letterSpacing: 2, fontWeight: 900 }}>
        🏆 ÚLTIMOS CAMPEONES
      </h2>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
        {champs.map(t => {
          const name = getChampionName(t);
          const ts   = t.finished_at ?? t.updated_at ?? t.created_at;
          return (
            <div key={t.id} style={{
              background: '#161b22',
              border: '1px solid #21262d',
              borderRadius: 10,
              padding: '14px 16px',
            }}>
              {/* Champion header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: '1.4rem' }}>🥇</span>
                <div>
                  <div style={{ color: '#ffd700', fontWeight: 700, fontSize: '0.88rem' }}>
                    {name ?? 'Campeón desconocido'}
                  </div>
                  {ts && (
                    <div style={{ color: '#8b949e', fontSize: '0.65rem' }}>{timeAgo(ts)}</div>
                  )}
                </div>
              </div>

              {/* Game + mode */}
              <div style={{ color: '#e6edf3', fontSize: '0.78rem', marginBottom: 4 }}>
                {GAME_LABEL[t.game] ?? t.game} — {MODE_LABEL[t.mode] ?? t.mode}
              </div>

              {/* Tags */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                <span style={{
                  background: '#0d1117', border: `1px solid ${TIER_COLOR[t.tier] ?? '#30363d'}`,
                  color: TIER_COLOR[t.tier] ?? '#8b949e',
                  fontSize: '0.62rem', padding: '2px 7px', borderRadius: 4,
                  fontFamily: "'Orbitron', sans-serif", fontWeight: 700,
                }}>
                  {t.tier}
                </span>
                <span style={{ background: '#0d1117', border: '1px solid #21262d', color: '#8b949e', fontSize: '0.62rem', padding: '2px 7px', borderRadius: 4 }}>
                  {REGION_LABEL[t.region] ?? t.region}
                </span>
                {t.entry_fee > 0 && (
                  <span style={{ background: '#0d1117', border: '1px solid #ffd700', color: '#ffd700', fontSize: '0.62rem', padding: '2px 7px', borderRadius: 4 }}>
                    🏆 {t.prize_pool.toLocaleString()} LFA
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <style>{`@keyframes spin { to{transform:rotate(360deg)} }`}</style>
    </div>
  );
}

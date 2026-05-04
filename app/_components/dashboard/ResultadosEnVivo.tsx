'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface BotMsg {
  id:           string;
  matchId?:     string;
  tournamentId?: string;
  texto:        string;
  verdict?:     string;
  timestamp?:   { toMillis: () => number };
}

function timeStr(ts?: { toMillis: () => number }) {
  if (!ts) return '';
  return new Date(ts.toMillis()).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}

function verdictColor(verdict?: string) {
  if (verdict === 'OK')         return '#00ff88';
  if (verdict === 'SUSPICIOUS') return '#ff4757';
  return '#ffd700';
}

function verdictIcon(verdict?: string) {
  if (verdict === 'OK')         return '✅';
  if (verdict === 'SUSPICIOUS') return '🚨';
  return '🔍';
}

export default function ResultadosEnVivo() {
  const [msgs, setMsgs] = useState<BotMsg[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Trae los últimos 40 mensajes de bot de resultados de matches
    const q = query(
      collection(db, 'match_chat'),
      where('uid', '==', 'BOT_LFA'),
      where('is_bot_result', '==', true),
      limit(40),
    );

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as BotMsg));
      // Ordenar por timestamp desc (JS sort, sin orderBy compuesto)
      list.sort((a, b) => (b.timestamp?.toMillis() ?? 0) - (a.timestamp?.toMillis() ?? 0));
      setMsgs(list);
      setLoading(false);
    }, () => setLoading(false));

    return () => unsub();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid #1c2028', borderTop: '2px solid #00ff88', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <span style={{ fontSize: '1.4rem' }}>⚡</span>
        <h2 style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '0.85rem', fontWeight: 900, color: '#fff', letterSpacing: 2, margin: 0 }}>
          RESULTADOS EN VIVO
        </h2>
        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#8b949e', fontFamily: "'Orbitron', sans-serif" }}>
          BOT LFA · EN TIEMPO REAL
        </span>
      </div>

      {msgs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#8b949e' }}>
          <div style={{ fontSize: '2rem', marginBottom: 12 }}>🤖</div>
          <p style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '0.8rem', letterSpacing: 1 }}>
            Sin resultados recientes
          </p>
          <p style={{ fontSize: '0.75rem', marginTop: 8 }}>
            Los resultados verificados por el BOT aparecerán aquí.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {msgs.map(m => (
            <div
              key={m.id}
              style={{
                background: '#0d1117',
                border: `1px solid ${verdictColor(m.verdict)}22`,
                borderLeft: `3px solid ${verdictColor(m.verdict)}`,
                borderRadius: 10,
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '0.85rem' }}>{verdictIcon(m.verdict)}</span>
                <span style={{
                  fontFamily: "'Orbitron', sans-serif",
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  color: verdictColor(m.verdict),
                  letterSpacing: 1,
                }}>
                  {m.verdict === 'OK' ? 'VERIFICADO' : m.verdict === 'SUSPICIOUS' ? 'SOSPECHOSO' : 'REVISIÓN'}
                </span>
                {m.tournamentId && (
                  <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: '#8b949e', fontFamily: 'monospace' }}>
                    Sala #{m.tournamentId.slice(-5).toUpperCase()}
                  </span>
                )}
                {m.timestamp && (
                  <span style={{ fontSize: '0.65rem', color: '#444', marginLeft: m.tournamentId ? 8 : 'auto' }}>
                    {timeStr(m.timestamp)}
                  </span>
                )}
              </div>
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#c9d1d9', lineHeight: 1.5 }}>
                {m.texto.replace(/\*\*/g, '')}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

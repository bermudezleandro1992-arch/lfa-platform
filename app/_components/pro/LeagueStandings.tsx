'use client';

import type { LeagueParticipant } from '@/lib/types';

interface Props {
  participants: LeagueParticipant[];
  myUid: string;
}

export default function LeagueStandings({ participants, myUid }: Props) {
  const sorted = [...participants].sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    const gdA = a.gf - a.gc;
    const gdB = b.gf - b.gc;
    if (gdB !== gdA) return gdB - gdA;
    return b.gf - a.gf;
  });

  if (sorted.length === 0) return (
    <div style={{ textAlign:'center', padding:'60px 20px', color:'#8b949e' }}>
      <div style={{ fontSize:'3rem', marginBottom:12 }}>📊</div>
      <div style={{ fontFamily:"'Orbitron',sans-serif", fontWeight:700 }}>Sin datos de tabla</div>
      <div style={{ fontSize:'0.82rem', marginTop:8 }}>Aparecerá cuando empiecen los partidos</div>
    </div>
  );

  const cols = ['#', 'EQUIPO', 'PJ', 'PG', 'PE', 'PP', 'GF', 'GC', 'DG', 'PTS'];

  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', minWidth:480 }}>
        <thead>
          <tr>
            {cols.map(c => (
              <th key={c} style={{
                padding:'10px 10px', textAlign: c==='EQUIPO' ? 'left' : 'center',
                fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'0.6rem',
                color:'#8b949e', letterSpacing:1, borderBottom:'1px solid #30363d',
                whiteSpace:'nowrap',
              }}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => {
            const isMe = p.uid === myUid;
            const isTop3 = i < 3;
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
            const dg = p.gf - p.gc;
            return (
              <tr key={p.uid} style={{
                background: isMe ? '#00ff8808' : 'transparent',
                borderBottom:'1px solid #21262d',
                transition:'background 0.15s',
              }}>
                {/* # */}
                <td style={{
                  padding:'12px 10px', textAlign:'center',
                  fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'0.72rem',
                  color: isTop3 ? '#ffd700' : '#8b949e',
                }}>
                  {medal ?? i + 1}
                </td>
                {/* Equipo */}
                <td style={{ padding:'12px 10px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontSize:'1.3rem' }}>{p.logo_url || '⚽'}</span>
                    <div>
                      <div style={{
                        fontWeight:600, fontSize:'0.82rem',
                        color: isMe ? '#00ff88' : '#e6edf3',
                        whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:140,
                      }}>
                        {p.team_name}
                      </div>
                      <div style={{ color:'#8b949e', fontSize:'0.65rem' }}>{p.display_name}</div>
                    </div>
                    {isMe && <span style={{ fontSize:'0.55rem', color:'#00ff88', fontWeight:700, letterSpacing:1 }}>TÚ</span>}
                  </div>
                </td>
                {/* Stats */}
                {[p.pj, p.pg, p.pe, p.pp, p.gf, p.gc,
                  dg > 0 ? `+${dg}` : dg.toString()
                ].map((v, vi) => (
                  <td key={vi} style={{
                    padding:'12px 10px', textAlign:'center',
                    fontSize:'0.78rem', color:'#c9d1d9',
                  }}>
                    {v ?? 0}
                  </td>
                ))}
                {/* PTS */}
                <td style={{ padding:'12px 10px', textAlign:'center' }}>
                  <span style={{
                    fontFamily:"'Orbitron',sans-serif", fontWeight:900, fontSize:'0.88rem',
                    color: isTop3 ? '#ffd700' : (isMe ? '#00ff88' : '#e6edf3'),
                  }}>
                    {p.pts ?? 0}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

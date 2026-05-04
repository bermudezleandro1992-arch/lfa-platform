'use client';

/* ─── Types ───────────────────────────────────────────────── */
export interface BracketMatch {
  id:           string;
  p1:           string;
  p2:           string;
  winner:       string | null;
  status:       string;
  score:        string;
  round:        string;
  p1_username?: string;
  p2_username?: string;
}

interface Props {
  brackets:       BracketMatch[];
  currentMatchId: string;
  myUid:          string;
}

/* ─── Helpers ─────────────────────────────────────────────── */
const ROUND_LABELS: Record<string, string> = {
  round_1: 'RONDA 1',
  round_2: 'RONDA 2',
  round_3: 'CUARTOS',
  round_4: 'SEMIS',
  round_5: 'SEMIS',
  round_6: 'SEMIS',
  final:   '🏆 FINAL',
};

function pname(m: BracketMatch, side: 'p1' | 'p2'): string {
  const name = side === 'p1' ? m.p1_username : m.p2_username;
  if (name && name !== 'TBD') return name.length > 14 ? name.slice(0, 13) + '…' : name;
  return 'TBD';
}

function sortRounds(rounds: string[]): string[] {
  return [...rounds].sort((a, b) => {
    if (a === 'final') return 1;
    if (b === 'final') return -1;
    return parseInt(a.replace(/\D/g, '') || '0') - parseInt(b.replace(/\D/g, '') || '0');
  });
}

function sortMatches(ms: BracketMatch[]): BracketMatch[] {
  return [...ms].sort((a, b) => {
    const na = parseInt(a.id.match(/\d+$/)?.[0] ?? '0');
    const nb = parseInt(b.id.match(/\d+$/)?.[0] ?? '0');
    return na - nb;
  });
}

/* ─── Constants ───────────────────────────────────────────── */
const HDR_H  = 34;  // header row height in px
const SLOT_H = 82;  // height per match slot in px

/* ══════════════════════════════════════════════════════════ */
export default function BracketView({ brackets, currentMatchId, myUid }: Props) {
  if (!brackets.length) return null;

  const rounds = sortRounds(Array.from(new Set(brackets.map(m => m.round))));
  const round1 = brackets.filter(m => m.round === rounds[0]);
  const N      = round1.length; // always a power of 2

  const containerH = N * SLOT_H + HDR_H;
  const isComplete = brackets.every(m => m.status === 'FINISHED');
  const finalMatch = brackets.find(m => m.round === rounds[rounds.length - 1]);
  const champion   = (() => {
    if (!isComplete || !finalMatch?.winner) return null;
    return finalMatch.winner === finalMatch.p1
      ? pname(finalMatch, 'p1')
      : pname(finalMatch, 'p2');
  })();

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
      {/* ── Styles ── */}
      <style>{`
        /* Bracket shell */
        .brkv          { display:flex; align-items:stretch; }
        /* Round column */
        .brkv-col      { display:flex; flex-direction:column; width:156px; min-width:140px; flex-shrink:0; }
        .brkv-hdr      { height:${HDR_H}px; display:flex; align-items:center; justify-content:center;
                         font-family:'Orbitron',sans-serif; font-size:.57rem; font-weight:900;
                         letter-spacing:1.8px; color:#8b949e; }
        .brkv-hdr.fin  { color:#ffd700; }
        .brkv-slots    { flex:1; display:flex; flex-direction:column; }
        .brkv-slot     { flex:1; display:flex; align-items:center; padding:4px 0; }

        /* Match card */
        .brkv-card               { width:100%; border-radius:9px; overflow:hidden;
                                   border:1px solid #21262d; background:#0d1117;
                                   transition:border-color .2s, box-shadow .2s; }
        .brkv-card.c-curr        { border-color:rgba(255,215,0,.85);
                                   box-shadow:0 0 14px rgba(255,215,0,.18); }
        .brkv-card.c-mine        { border-color:rgba(0,212,255,.45); }
        .brkv-card.c-done        { border-color:#21262d; }
        /* Player rows */
        .brkv-row                { display:flex; align-items:center; gap:5px;
                                   padding:5px 9px; font-size:.68rem; min-height:30px; }
        .brkv-row + .brkv-row   { border-top:1px solid #161b22; }
        .brkv-row.r-win          { background:rgba(0,255,136,.09); }
        .brkv-row.r-lose         { opacity:.4; }
        .brkv-name               { flex:1; white-space:nowrap; overflow:hidden;
                                   text-overflow:ellipsis; font-weight:700; color:#c9d1d9; }
        .brkv-name.tbd           { color:#444; font-weight:400; font-style:italic; }
        .brkv-sc                 { font-family:monospace; font-size:.8rem; font-weight:900;
                                   color:#ffd700; }
        .brkv-tag                { font-size:.6rem; line-height:1; }

        /* Connector column */
        .brkv-conn     { width:22px; flex-shrink:0; display:flex; flex-direction:column; }
        .brkv-cspc     { height:${HDR_H}px; flex-shrink:0; }
        .brkv-cgrps    { flex:1; display:flex; flex-direction:column; }
        .brkv-cg       { flex:1; display:flex; flex-direction:column; }
        .brkv-ct       { flex:1; border-right:1px solid #2d333b; border-bottom:1px solid #2d333b; }
        .brkv-cb       { flex:1; border-right:1px solid #2d333b; border-top:1px solid #2d333b; }

        /* Champion banner */
        .brkv-champ    { margin:10px 0 4px; padding:10px 14px; background:rgba(255,215,0,.07);
                         border:1px solid rgba(255,215,0,.35); border-radius:10px;
                         text-align:center; }
      `}</style>

      {/* Champion banner */}
      {champion && (
        <div className="brkv-champ">
          <div style={{ fontSize: '1.6rem', marginBottom: 4 }}>🏆</div>
          <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '.7rem', color: '#ffd700', fontWeight: 900, letterSpacing: 2 }}>
            CAMPEÓN
          </div>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: '.9rem', marginTop: 2 }}>{champion}</div>
        </div>
      )}

      {/* Bracket tree */}
      <div className="brkv" style={{ height: containerH }}>
        {rounds.map((round, ri) => {
          const isFinal    = ri === rounds.length - 1;
          const roundMs    = sortMatches(brackets.filter(m => m.round === round));
          const connGroups = Math.ceil(roundMs.length / 2);

          return (
            <div key={round} style={{ display: 'contents' }}>
              {/* ── Round column ── */}
              <div className="brkv-col">
                <div className={`brkv-hdr${isFinal ? ' fin' : ''}`}>
                  {ROUND_LABELS[round] ?? round.toUpperCase()}
                </div>
                <div className="brkv-slots">
                  {roundMs.map(m => {
                    const isCurr = m.id === currentMatchId;
                    const isDone = m.status === 'FINISHED';
                    const isMine = m.p1 === myUid || m.p2 === myUid;
                    const p1Win  = isDone && m.winner === m.p1;
                    const p2Win  = isDone && m.winner === m.p2;
                    const parts  = (m.score ?? '').split('-');
                    const sA     = parts[0]?.trim();
                    const sB     = parts[1]?.trim();
                    const nP1    = pname(m, 'p1');
                    const nP2    = pname(m, 'p2');

                    const cardCls = isCurr ? 'c-curr' : isMine ? 'c-mine' : isDone ? 'c-done' : '';

                    return (
                      <div key={m.id} className="brkv-slot">
                        <div className={`brkv-card ${cardCls}`}>
                          {/* P1 */}
                          <div className={`brkv-row${p1Win ? ' r-win' : p2Win ? ' r-lose' : ''}`}>
                            {p1Win && <span className="brkv-tag">🏆</span>}
                            {isMine && m.p1 === myUid && <span className="brkv-tag" style={{ color: '#ffd700' }}>◆</span>}
                            <span className={`brkv-name${nP1 === 'TBD' ? ' tbd' : ''}`}>{nP1}</span>
                            {isDone && sA !== undefined && <span className="brkv-sc">{sA}</span>}
                          </div>
                          {/* P2 */}
                          <div className={`brkv-row${p2Win ? ' r-win' : p1Win ? ' r-lose' : ''}`}>
                            {p2Win && <span className="brkv-tag">🏆</span>}
                            {isMine && m.p2 === myUid && <span className="brkv-tag" style={{ color: '#ffd700' }}>◆</span>}
                            <span className={`brkv-name${nP2 === 'TBD' ? ' tbd' : ''}`}>{nP2}</span>
                            {isDone && sB !== undefined && <span className="brkv-sc">{sB}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Connector column (not after last round) ── */}
              {ri < rounds.length - 1 && (
                <div key={`conn-${round}`} className="brkv-conn">
                  <div className="brkv-cspc" />
                  <div className="brkv-cgrps">
                    {Array.from({ length: connGroups }).map((_, gi) => (
                      <div key={gi} className="brkv-cg">
                        <div className="brkv-ct" />
                        <div className="brkv-cb" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

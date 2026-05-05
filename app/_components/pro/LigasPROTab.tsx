'use client';

import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { ProLeague } from '@/lib/types';

const card: React.CSSProperties = {
  background: '#161b22', border: '1px solid #30363d', borderRadius: 14, padding: 18,
};
const inp: React.CSSProperties = {
  width: '100%', padding: '10px 12px', background: '#0b0e14',
  border: '1px solid #30363d', borderRadius: 8, color: '#e6edf3',
  fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box',
};
const btn = (bg: string, color = '#000'): React.CSSProperties => ({
  padding: '9px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
  background: bg, color, fontFamily: "'Orbitron',sans-serif",
  fontWeight: 700, fontSize: '0.68rem', letterSpacing: 0.5,
});

// Modos disponibles por juego
const MODES_BY_GAME: Record<string, { value: string; label: string }[]> = {
  efootball: [
    { value: 'dream_team',    label: 'Dream Team' },
    { value: 'ultimate_team', label: 'Ultimate Team' },
  ],
  fc26: [
    { value: 'ultimate_team', label: 'Ultimate Team' },
    { value: 'general_95',   label: 'General 95' },
    { value: 'seleccion',    label: 'Selección' },
    { value: 'equipos',      label: 'Equipos' },
  ],
  mobile: [
    { value: 'dream_team',    label: 'Dream Team' },
    { value: 'ultimate_team', label: 'Ultimate Team' },
  ],
};

const GAME_OPTIONS = [
  { value: 'efootball', label: 'eFootball' },
  { value: 'fc26',      label: 'FC 26' },
  { value: 'mobile',    label: 'Mobile' },
];

const PLATFORM_OPTIONS = [
  { value: 'Crossplay', label: 'Crossplay (PC+PS5+Xbox)' },
  { value: 'PS5',       label: 'PS5' },
  { value: 'Xbox',      label: 'Xbox' },
  { value: 'PC',        label: 'PC' },
  { value: 'Mobile',    label: 'Mobile' },
];

const REGION_OPTIONS = ['LATAM_SUR', 'LATAM_NORTE', 'GLOBAL'];
const MAX_PLAYERS_OPTIONS = ['4', '6', '8', '10', '12', '16', '18', '20', '24', '30'];
const DIVISION_OPTIONS = [
  { value: 'GLOBAL', label: '🌐 Sin división (Global)' },
  { value: 'A', label: '🥇 División A — Elite' },
  { value: 'B', label: '🥈 División B — Competitiva' },
  { value: 'C', label: '🥉 División C — Amateur' },
  { value: 'D', label: '🎮 División D — Principiantes' },
];
const COUNTRY_RESTRICTION_OPTIONS = [
  { value: 'GLOBAL', label: '🌍 Abierta — todos los países' },
  { value: 'Argentina', label: '🇦🇷 Argentina' },
  { value: 'Brasil', label: '🇧🇷 Brasil' },
  { value: 'Colombia', label: '🇨🇴 Colombia' },
  { value: 'Chile', label: '🇨🇱 Chile' },
  { value: 'México', label: '🇲🇽 México' },
  { value: 'Perú', label: '🇵🇪 Perú' },
  { value: 'Uruguay', label: '🇺🇾 Uruguay' },
  { value: 'Paraguay', label: '🇵🇾 Paraguay' },
  { value: 'Ecuador', label: '🇪🇨 Ecuador' },
  { value: 'Bolivia', label: '🇧🇴 Bolivia' },
  { value: 'Venezuela', label: '🇻🇪 Venezuela' },
];

const INITIAL_FORM = {
  name: '', game: 'efootball', mode: 'dream_team', platform: 'Crossplay',
  region: 'LATAM_SUR', max_players: '8', entry_fee: '0',
  rules: '', prize_info: '', division: 'GLOBAL', country_restriction: 'GLOBAL',
};

export default function LigasPROTab() {
  const [leagues, setLeagues] = useState<ProLeague[]>([]);
  const [form, setForm] = useState(INITIAL_FORM);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState('');
  const [genLoading, setGenLoading] = useState<string | null>(null);
  const [playoffLoading, setPlayoffLoading] = useState<string | null>(null);
  const [clearLoading, setClearLoading] = useState<string | null>(null);
  const [seedLoading, setSeedLoading] = useState<string | null>(null);
  const [disputes, setDisputes] = useState<Array<Record<string, string | number | null>>>([]);
  const [resolveLoading, setResolveLoading] = useState<string | null>(null);

  // Load leagues in real-time
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'leagues'), snap => {
      setLeagues(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProLeague)));
    });
    return unsub;
  }, []);

  // Load disputes
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'league_matches'),
      snap => {
        const raw = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter((m) => (m as Record<string,unknown>).status === 'dispute');
        setDisputes(raw as Array<Record<string, string | number | null>>);
      }
    );
    return unsub;
  }, []);

  async function createLeague() {
    if (!form.name.trim()) { setMsg('Nombre requerido.'); return; }
    setCreating(true); setMsg('');
    try {
      await addDoc(collection(db, 'leagues'), {
        name: form.name.trim().slice(0, 60),
        game: form.game,
        mode: form.mode,
        platform: form.platform,
        region: form.region,
        status: 'inscripcion',
        max_players: parseInt(form.max_players) || 8,
        current_players: 0,
        current_round: 0,
        total_rounds: 0,
        rules: form.rules.trim().slice(0, 1000),
        prize_info: form.prize_info.trim().slice(0, 200),
        entry_fee: parseFloat(form.entry_fee) || 0,
        banner_url: null,
        division: form.division || 'GLOBAL',
        country_restriction: form.country_restriction || 'GLOBAL',
        promotion_relegation: parseInt(form.max_players) >= 12,
        created_at: serverTimestamp(),
        start_date: null,
      });
      setMsg('✅ Liga creada correctamente.');
      setForm(INITIAL_FORM);
    } catch { setMsg('❌ Error al crear liga.'); }
    finally { setCreating(false); }
  }

  async function generateFixture(leagueId: string) {
    setGenLoading(leagueId);
    try {
      const functions = getFunctions(undefined, 'us-central1');
      const fn = httpsCallable(functions, 'generateLeagueFixture');
      const result = await fn({ leagueId });
      const data = result.data as { rounds: number; matches: number };
      setMsg(`✅ Fixture generado: ${data.rounds} jornadas, ${data.matches} partidos.`);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setMsg(`❌ ${err.message ?? 'Error generando fixture.'}`);
    } finally { setGenLoading(null); }
  }

  async function startPlayoffs(leagueId: string, topN: number) {
    setPlayoffLoading(leagueId);
    try {
      const token = await auth.currentUser!.getIdToken();
      const res = await fetch('/api/pro/startPlayoffs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ league_id: leagueId, top_n: topN }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(`❌ ${data.error}`); return; }
      setMsg(`✅ Playoffs iniciados: ${data.matches} partidos — ${data.round}`);
    } catch { setMsg('❌ Error iniciando playoffs.'); }
    finally { setPlayoffLoading(null); }
  }

  async function seedBots(leagueId: string) {
    setSeedLoading(leagueId);
    try {
      const token = await auth.currentUser!.getIdToken();
      const res = await fetch('/api/pro/seedBots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ league_id: leagueId }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(`❌ ${data.error}`); return; }
      setMsg(`✅ ${data.added} bots agregados: ${(data.bots as string[]).join(', ')}`);
    } catch { setMsg('❌ Error agregando bots.'); }
    finally { setSeedLoading(null); }
  }

  async function clearLeague(leagueId: string, leagueName: string) {
    if (!confirm(`⚠️ ¿Eliminar la liga "${leagueName}" y todos sus datos? Esta acción no se puede deshacer.`)) return;
    setClearLoading(leagueId);
    try {
      const token = await auth.currentUser!.getIdToken();
      const res = await fetch('/api/pro/clearLeague', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ league_id: leagueId }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(`❌ ${data.error}`); return; }
      setMsg(`✅ Liga eliminada. ${data.deleted.matches} partidos borrados.`);
    } catch { setMsg('❌ Error eliminando liga.'); }
    finally { setClearLoading(null); }
  }

  async function resolveDispute(matchId: string, resolution: 'p1' | 'p2' | 'draw' | 'annul') {
    setResolveLoading(matchId);
    try {
      const token = await auth.currentUser!.getIdToken();
      await fetch('/api/pro/resolveDispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ match_id: matchId, resolution }),
      });
      setMsg('✅ Disputa resuelta.');
    } catch { setMsg('❌ Error resolviendo disputa.'); }
    finally { setResolveLoading(null); }
  }

  const SEL: React.CSSProperties = { ...inp, width: 'auto', flex: 1 };
  const currentModes = MODES_BY_GAME[form.game] ?? MODES_BY_GAME.efootball;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <h2 style={{ fontFamily: "'Orbitron',sans-serif", color: '#ffd700', margin: '0 0 4px', fontSize: '0.9rem' }}>
        🏅 LIGAS PRO — GESTIÓN
      </h2>

      {msg && (
        <div style={{
          padding: '10px 14px', borderRadius: 8,
          background: msg.startsWith('✅') ? '#00ff8818' : '#ff444422',
          border: `1px solid ${msg.startsWith('✅') ? '#00ff8833' : '#ff444444'}`,
          color: msg.startsWith('✅') ? '#00ff88' : '#ff6b6b', fontSize: '0.82rem',
        }}>{msg}</div>
      )}

      {/* ── CREAR LIGA ── */}
      <div style={card}>
        <h3 style={{ fontFamily: "'Orbitron',sans-serif", color: '#00ff88', margin: '0 0 14px', fontSize: '0.8rem' }}>
          ➕ CREAR NUEVA LIGA
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div style={{ gridColumn: '1/-1' }}>
            <input style={inp} placeholder="Nombre de la liga" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>

          {/* Juego */}
          <select style={SEL} value={form.game} onChange={e => {
            const g = e.target.value;
            const firstMode = (MODES_BY_GAME[g] ?? MODES_BY_GAME.efootball)[0].value;
            setForm(f => ({ ...f, game: g, mode: firstMode }));
          }}>
            {GAME_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>

          {/* Modo — dinámico por juego */}
          <select style={SEL} value={form.mode} onChange={e => setForm(f => ({ ...f, mode: e.target.value }))}>
            {currentModes.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>

          {/* Plataforma */}
          <select style={SEL} value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}>
            {PLATFORM_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>

          {/* Región */}
          <select style={SEL} value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))}>
            {REGION_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>

          {/* Max jugadores */}
          <select style={SEL} value={form.max_players} onChange={e => setForm(f => ({ ...f, max_players: e.target.value }))}>
            {MAX_PLAYERS_OPTIONS.map(n => <option key={n} value={n}>{n} jugadores</option>)}
          </select>

          {/* División */}
          <select style={SEL} value={form.division} onChange={e => setForm(f => ({ ...f, division: e.target.value }))}>
            {DIVISION_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>

          {/* Restricción de país */}
          <select style={SEL} value={form.country_restriction} onChange={e => setForm(f => ({ ...f, country_restriction: e.target.value }))}>
            {COUNTRY_RESTRICTION_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>

          {/* Entry fee — 0 = gratuita */}
          <div style={{ gridColumn:'1/-1' }}>
            <input style={inp} type="number" min={0} step={1}
              placeholder="0 = Gratuita  |  Liga Premium: N° de LFA Coins"
              value={form.entry_fee}
              onChange={e => setForm(f => ({ ...f, entry_fee: e.target.value }))} />
          </div>

          {/* Info ascensos/descensos */}
          {parseInt(form.max_players) >= 12 && form.division !== 'GLOBAL' && (
            <div style={{ gridColumn:'1/-1', background:'#ffd70011', border:'1px solid #ffd70033', borderRadius:8, padding:'10px 14px', fontSize:'0.72rem', color:'#ffd700' }}>
              ⬆️ Ascensos/Descensos activos: los 4 primeros suben a Div {String.fromCharCode(form.division.charCodeAt(0)-1) || 'S/A'} · los 4 últimos bajan a Div {String.fromCharCode(form.division.charCodeAt(0)+1) || 'S/A'}
            </div>
          )}

          {/* VPN warning */}
          {form.country_restriction !== 'GLOBAL' && (
            <div style={{ gridColumn:'1/-1', background:'#ff444411', border:'1px solid #ff444433', borderRadius:8, padding:'10px 14px', fontSize:'0.72rem', color:'#ff6b6b' }}>
              🔒 Liga por país: solo jugadores con país «{form.country_restriction}» en su perfil podrán inscribirse. Detección anti-VPN activa.
            </div>
          )}

          {/* Premio */}
          <div style={{ gridColumn: '1/-1' }}>
            <input style={inp} placeholder="Premio (ej: 500 LFA Coins al campeón — dejar vacío si es gratuita)" value={form.prize_info} onChange={e => setForm(f => ({ ...f, prize_info: e.target.value }))} />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <textarea style={{ ...inp, resize: 'vertical', minHeight: 60 }} placeholder="Reglamento de la liga..." value={form.rules} onChange={e => setForm(f => ({ ...f, rules: e.target.value }))} />
          </div>
        </div>

        <button onClick={createLeague} disabled={creating} style={btn(creating ? '#30363d' : '#00ff88', '#000')}>
          {creating ? '⏳ CREANDO...' : '✅ CREAR LIGA'}
        </button>
      </div>

      {/* ── LISTA DE LIGAS ── */}
      <div style={card}>
        <h3 style={{ fontFamily: "'Orbitron',sans-serif", color: '#009ee3', margin: '0 0 14px', fontSize: '0.8rem' }}>
          📋 LIGAS ACTIVAS ({leagues.length})
        </h3>
        {leagues.length === 0 ? (
          <div style={{ color: '#8b949e', fontSize: '0.8rem' }}>No hay ligas creadas aún.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {leagues.map(lg => (
              <div key={lg.id} style={{
                background: '#0d1117', borderRadius: 10, padding: '12px 14px',
                border: '1px solid #21262d', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: '#e6edf3', fontSize: '0.82rem' }}>{lg.name}</div>
                  <div style={{ color: '#8b949e', fontSize: '0.68rem' }}>
                    {lg.game === 'efootball' ? 'eFootball' : lg.game === 'fc26' ? 'FC 26' : 'Mobile'} · {lg.platform} · {lg.region} · {lg.current_players}/{lg.max_players} jugadores
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    {[
                      { label: lg.status.toUpperCase(), color: lg.status === 'inscripcion' ? '#ffd700' : lg.status === 'activa' ? '#00ff88' : '#8b949e' },
                      { label: `Jornada ${lg.current_round}/${lg.total_rounds}`, color: '#8b949e' },
                    ].map(b => (
                      <span key={b.label} style={{ fontSize: '0.62rem', color: b.color, background: b.color + '18', border: `1px solid ${b.color}33`, borderRadius: 4, padding: '1px 6px' }}>{b.label}</span>
                    ))}
                    {lg.division && lg.division !== 'GLOBAL' && (
                      <span style={{ fontSize: '0.62rem', color: '#ffd700', background: '#ffd70018', border: '1px solid #ffd70033', borderRadius: 4, padding: '1px 6px' }}>
                        DIV {lg.division}
                      </span>
                    )}
                    {lg.country_restriction && lg.country_restriction !== 'GLOBAL' && (
                      <span style={{ fontSize: '0.62rem', color: '#ff6b00', background: '#ff6b0018', border: '1px solid #ff6b0033', borderRadius: 4, padding: '1px 6px' }}>
                        🌎 {lg.country_restriction}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {lg.status === 'inscripcion' && (
                    <button
                      onClick={() => generateFixture(lg.id)}
                      disabled={genLoading === lg.id || lg.current_players < 2}
                      style={btn(genLoading === lg.id ? '#30363d' : '#00c3ff22', '#00c3ff')}
                    >
                      {genLoading === lg.id ? '⏳...' : '⚡ GENERAR FIXTURE'}
                    </button>
                  )}
                  {lg.status === 'inscripcion' && lg.current_players < lg.max_players && (
                    <button
                      onClick={() => seedBots(lg.id)}
                      disabled={seedLoading === lg.id}
                      style={btn(seedLoading === lg.id ? '#30363d' : '#7c3aed22', '#a78bfa')}
                      title="Llenar con bots para testear"
                    >
                      {seedLoading === lg.id ? '⏳...' : '🤖 BOTS'}
                    </button>
                  )}
                  {lg.status === 'activa' && (
                    <>
                      <button
                        onClick={() => startPlayoffs(lg.id, 4)}
                        disabled={playoffLoading === lg.id}
                        style={btn(playoffLoading === lg.id ? '#30363d' : '#ffd70022', '#ffd700')}
                        title="Top 4 clasificados — Semifinales"
                      >
                        {playoffLoading === lg.id ? '⏳...' : '🏆 PLAYOFFS TOP 4'}
                      </button>
                      <button
                        onClick={() => startPlayoffs(lg.id, 8)}
                        disabled={playoffLoading === lg.id}
                        style={btn(playoffLoading === lg.id ? '#30363d' : '#ff6b0022', '#ff6b00')}
                        title="Top 8 clasificados — Cuartos de final"
                      >
                        {playoffLoading === lg.id ? '⏳...' : '🏆 PLAYOFFS TOP 8'}
                      </button>
                    </>
                  )}
                  <a href={`/pro/liga/${lg.id}`} target="_blank" rel="noreferrer"
                    style={{ ...btn('#30363d', '#c9d1d9'), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                    👁️ VER
                  </a>
                  <button
                    onClick={() => clearLeague(lg.id, lg.name)}
                    disabled={clearLoading === lg.id}
                    style={btn(clearLoading === lg.id ? '#30363d' : '#ff000022', '#ff6b6b')}
                    title="Eliminar liga y todos sus datos"
                  >
                    {clearLoading === lg.id ? '⏳...' : '🗑️ BORRAR'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── DISPUTAS ── */}
      {disputes.length > 0 && (
        <div style={{ ...card, borderColor: '#ff444444' }}>
          <h3 style={{ fontFamily: "'Orbitron',sans-serif", color: '#ff4757', margin: '0 0 14px', fontSize: '0.8rem' }}>
            🚨 DISPUTAS PENDIENTES ({disputes.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {disputes.map((m) => {
              const disputeReason = m.dispute_reason ? String(m.dispute_reason) : null;
              const photoUrl      = m.photo_url      ? String(m.photo_url)      : null;
              return (
              <div key={String(m.id)} style={{
                background: '#ff444411', borderRadius: 10, padding: '12px 14px',
                border: '1px solid #ff444433',
              }}>
                <div style={{ marginBottom: 6 }}>
                  <span style={{ color: '#e6edf3', fontWeight: 700, fontSize: '0.82rem' }}>
                    {String(m.player1_team)} vs {String(m.player2_team)}
                  </span>
                  <span style={{ color: '#8b949e', fontSize: '0.68rem', marginLeft: 8 }}>
                    Jornada {String(m.round)} · Liga {String(m.league_id).slice(0, 8)}...
                  </span>
                </div>
                {disputeReason && (
                  <div style={{ color: '#ff6b6b', fontSize: '0.75rem', marginBottom: 8 }}>
                    Motivo: {disputeReason}
                  </div>
                )}
                {photoUrl && (
                  <div style={{ marginBottom: 8 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoUrl} alt="captura"
                      style={{ maxWidth: 200, borderRadius: 6, cursor: 'pointer' }}
                      onClick={() => window.open(photoUrl, '_blank')}
                    />
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => resolveDispute(String(m.id), 'p1')} disabled={resolveLoading === String(m.id)} style={btn('#00ff8822', '#00ff88')}>
                    🏆 Gana {String(m.player1_team)}
                  </button>
                  <button onClick={() => resolveDispute(String(m.id), 'p2')} disabled={resolveLoading === String(m.id)} style={btn('#00c3ff22', '#00c3ff')}>
                    🏆 Gana {String(m.player2_team)}
                  </button>
                  <button onClick={() => resolveDispute(String(m.id), 'draw')} disabled={resolveLoading === m.id} style={btn('#ffd70022', '#ffd700')}>
                    🤝 Empate
                  </button>
                  <button onClick={() => resolveDispute(String(m.id), 'annul')} disabled={resolveLoading === String(m.id)} style={btn('#ff444422', '#ff6b6b')}>
                    🗑️ Anular
                  </button>
                </div>
              </div>
            );})}
          </div>
        </div>
      )}
    </div>
  );
}

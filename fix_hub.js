const fs = require('fs');
let c = fs.readFileSync('C:/Users/Leandro/Desktop/LFA-FINAL/app/hub/page_clean.tsx', 'utf8');

// 1. Fix imports
c = c.replace(
  "import { doc, getDoc, updateDoc } from 'firebase/firestore';",
  "import { doc, getDoc, updateDoc, collection, onSnapshot, orderBy, limit, query, serverTimestamp } from 'firebase/firestore';"
);

// 2. Rename CEO_UID constant (already named DUEÑO_UID in clean, rename to CEO_UID)
c = c.replace(/DUEÑO_UID/g, 'CEO_UID');
c = c.replace("const CEO_UID = '2bOrFxTAcPgFPoHKJHQfYxoQJpw1';", "const CEO_UID = '2bOrFxTAcPgFPoHKJHQfYxoQJpw1';");

// 3. Add FeedbackItem interface before FB_TIPOS
c = c.replace(
  "type FbTipo = 'sugerencia' | 'bug' | 'valoracion' | 'otro';",
  `interface FeedbackItem {
  id: string; nombre: string; tipo: string; mensaje: string;
  estrellas?: number | null; estado: string;
  creado_en?: { toDate?: () => Date } | null;
  ceo_respuesta?: string | null;
  ceo_respondido_en?: { toDate?: () => Date } | null;
}

type FbTipo = 'sugerencia' | 'bug' | 'valoracion' | 'otro';`
);

// 4. Replace profile state with feedback board state
c = c.replace(
  `  /* ─── Estado juego + región ──────────────────────────── */
  const [userGames,    setUserGames]    = useState({ fc26: false, efb: false });
  const [userRegion,   setUserRegion]   = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg,   setProfileMsg]   = useState('');`,
  `  /* ─── Feedback board state ──────────────────────────── */
  const [feedbackList,   setFeedbackList]   = useState<FeedbackItem[]>([]);
  const [ceoReplyTarget, setCeoReplyTarget] = useState<string | null>(null);
  const [ceoReplyText,   setCeoReplyText]   = useState('');
  const [ceoReplying,    setCeoReplying]    = useState(false);`
);

// 5. Remove setUserGames/setUserRegion from auth effect
c = c.replace(
  `          setFbNombre(d.nombre || '');
          // Cargar preferencias de juego y región
          setUserGames({ fc26: !!d.juego_fc26, efb: !!d.juego_efb });
          setUserRegion(d.region || '');`,
  `          setFbNombre(d.nombre || '');`
);

// 6. Remove saveProfile function
c = c.replace(
  `  /* ── Guardar perfil de juego ─────────────────────── */
  async function saveProfile() {
    if (!uid) return;
    setSavingProfile(true);
    try {
      await updateDoc(doc(db, 'usuarios', uid), {
        juego_fc26: userGames.fc26,
        juego_efb:  userGames.efb,
        region:     userRegion || null,
      });
      setProfileMsg('✅ ¡Perfil de juego guardado!');
    } catch {
      setProfileMsg('⚠️ Error al guardar. Intentá de nuevo.');
    }
    setSavingProfile(false);
    setTimeout(() => setProfileMsg(''), 3500);
  }

  /* ── Logout ─────────────────────────────────────────── */`,
  `  /* ── Logout ─────────────────────────────────────────── */`
);

// 7. Add feedback listener + ceoResponder after logout function (before acceso a modos)
c = c.replace(
  `  /* ── Acceso a modos ─────────────────────────────────── */`,
  `  /* ── Listener feedback board ─────────────────────────── */
  useEffect(() => {
    const q = query(collection(db, 'feedback'), orderBy('creado_en', 'desc'), limit(50));
    return onSnapshot(q, snap => {
      setFeedbackList(snap.docs.map(d => ({ id: d.id, ...d.data() } as FeedbackItem)));
    });
  }, []);

  /* ── CEO responder feedback ───────────────────────────── */
  async function ceoResponder(feedbackId: string) {
    if (!ceoReplyText.trim() || uid !== CEO_UID) return;
    setCeoReplying(true);
    try {
      await updateDoc(doc(db, 'feedback', feedbackId), {
        ceo_respuesta: ceoReplyText.trim(),
        ceo_respondido_en: serverTimestamp(),
        estado: 'respondido',
      });
      setCeoReplyTarget(null); setCeoReplyText('');
    } catch { /* ok */ }
    setCeoReplying(false);
  }

  /* ── Acceso a modos ─────────────────────────────────── */`
);

// 8. Remove hidden feedback widget (display: 'none' wrapper div)
// Find and remove the block from "FEEDBACK WIDGET (compacto al final)" to before "LFA TV embebida"
const hiddenWidgetStart = c.indexOf("          {/* ── FEEDBACK WIDGET (compacto al final) ─────── */}");
const lfaTVStart = c.indexOf("          {/* ── LFA TV embebida ──────────────────────────── */}");
if (hiddenWidgetStart !== -1 && lfaTVStart !== -1) {
  c = c.slice(0, hiddenWidgetStart) + c.slice(lfaTVStart);
  console.log('Removed hidden feedback widget');
} else {
  console.log('WARNING: hidden widget markers not found');
}

// 9. Remove "PERFIL DE JUEGO + REGIÓN" section from JSX
const perfilStart = c.indexOf("          {/* ── PERFIL DE JUEGO + REGIÓN ─────────────────── */}");
// This section ends before the "── FEEDBACK ──" section
const feedbackOldStart = c.indexOf("          {/* ── FEEDBACK ─────────────────────────────────── */}");
if (perfilStart !== -1 && feedbackOldStart !== -1) {
  c = c.slice(0, perfilStart) + c.slice(feedbackOldStart);
  console.log('Removed PERFIL section');
} else {
  console.log('WARNING: perfil section markers not found');
}

// 10. Replace old feedback section with new public feedback board
const oldFeedbackStart = c.indexOf("          {/* ── FEEDBACK ─────────────────────────────────── */}");
const oldFeedbackEnd = c.indexOf("\n        </div>\n      </div>\n\n      <style>");
if (oldFeedbackStart !== -1 && oldFeedbackEnd !== -1) {
  const newFeedbackSection = `          {/* ── FEEDBACK PÚBLICO ─────────────────────────── */}
          <div style={{ marginTop: 40, borderTop: '1px solid #1c2028', paddingTop: 28 }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <span style={{ fontSize: '1.1rem' }}>💬</span>
              <div>
                <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.72rem', fontWeight: 900, color: '#009ee3', letterSpacing: 1 }}>OPINIONES DE LA COMUNIDAD</div>
                <div style={{ fontSize: '0.68rem', color: '#4a5568', marginTop: 1 }}>Sugerencias, bugs e ideas · Lo que piensa la comunidad LFA</div>
              </div>
            </div>

            {/* ── Formulario envío ──────────────────────── */}
            {fbExito ? (
              <div style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid #00ff8830', borderRadius: 12, padding: '20px', textAlign: 'center', marginBottom: 28 }}>
                <div style={{ fontSize: '2rem', marginBottom: 8 }}>🎉</div>
                <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#00ff88', fontSize: '0.85rem', fontWeight: 900, marginBottom: 4 }}>¡GRACIAS POR TU FEEDBACK!</div>
                <div style={{ color: '#8b949e', fontSize: '0.75rem' }}>Lo revisaremos y usaremos para mejorar la plataforma. 🙌</div>
              </div>
            ) : (
              <div style={{ background: '#0d1117', border: '1px solid #1c2028', borderRadius: 14, padding: 'clamp(14px,3vw,20px)', marginBottom: 28 }}>
                <div style={{ fontSize: '0.65rem', color: '#8b949e', fontFamily: "'Orbitron',sans-serif", letterSpacing: 1, marginBottom: 12 }}>DEJAR TU OPINIÓN</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                  {FB_TIPOS.map(({ key, icon, label }) => (
                    <button key={key} onClick={() => setFbTipo(key)} style={{ padding: '5px 12px', borderRadius: 30, fontSize: '0.72rem', cursor: 'pointer', border: \`1px solid \${fbTipo === key ? '#009ee3' : '#30363d'}\`, background: fbTipo === key ? 'rgba(0,158,227,0.15)' : 'transparent', color: fbTipo === key ? '#009ee3' : '#8b949e', fontWeight: fbTipo === key ? 700 : 400, transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 4 }}>{icon} {label}</button>
                  ))}
                </div>
                {fbTipo === 'valoracion' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
                    {[1,2,3,4,5].map(n => (
                      <button key={n} onMouseEnter={() => setFbHover(n)} onMouseLeave={() => setFbHover(0)} onClick={() => setFbEstrellas(n)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.5rem', padding: 0, transition: 'transform 0.15s', transform: n <= (fbHover || fbEstrellas) ? 'scale(1.25)' : 'scale(1)', filter: n <= (fbHover || fbEstrellas) ? 'none' : 'grayscale(1) opacity(0.3)' }}>⭐</button>
                    ))}
                    <span style={{ color: '#8b949e', fontSize: '0.72rem', marginLeft: 6 }}>{['','Muy malo','Malo','Regular','Bueno','Excelente'][fbHover || fbEstrellas]}</span>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(110px,180px) 1fr', gap: 10, alignItems: 'flex-start' }}>
                  <input value={fbNombre} onChange={e => setFbNombre(e.target.value)} maxLength={60} placeholder="Nick / nombre" style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: '9px 12px', color: 'white', fontSize: '0.8rem', outline: 'none', width: '100%', boxSizing: 'border-box' as const, fontFamily: "'Roboto',sans-serif" }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ position: 'relative' }}>
                      <textarea value={fbMensaje} onChange={e => setFbMensaje(e.target.value)} maxLength={600} rows={3}
                        placeholder={fbTipo === 'bug' ? 'Describí qué pasó y en qué sección...' : fbTipo === 'sugerencia' ? '¿Qué mejoraría la plataforma?' : fbTipo === 'valoracion' ? '¿Qué te parece LFA hasta ahora?' : 'Tu mensaje para el equipo LFA...'}
                        style={{ width: '100%', background: '#161b22', border: \`1px solid \${fbError ? '#ff475760' : '#30363d'}\`, borderRadius: 8, padding: '9px 12px 20px', color: 'white', fontSize: '0.8rem', outline: 'none', resize: 'none', fontFamily: "'Roboto',sans-serif", lineHeight: 1.5, boxSizing: 'border-box' as const }} />
                      <span style={{ position: 'absolute', bottom: 6, right: 10, fontSize: '0.62rem', color: fbMensaje.length > 550 ? '#ff4757' : '#4a5568', pointerEvents: 'none' }}>{fbMensaje.length}/600</span>
                    </div>
                    {fbError && <div style={{ color: '#ff4757', fontSize: '0.72rem' }}>⚠️ {fbError}</div>}
                    <button onClick={enviarFeedback} disabled={fbEnviando || fbMensaje.trim().length < 10} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', cursor: fbEnviando || fbMensaje.trim().length < 10 ? 'not-allowed' : 'pointer', background: fbEnviando ? '#1c2028' : 'linear-gradient(135deg,#009ee3,#0077b6)', color: 'white', fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.72rem', letterSpacing: 1, opacity: fbMensaje.trim().length < 10 ? 0.5 : 1, boxShadow: fbEnviando || fbMensaje.trim().length < 10 ? 'none' : '0 0 14px rgba(0,158,227,0.3)', transition: 'all 0.2s', alignSelf: 'flex-end' as const }}>
                      {fbEnviando ? '⏳ ENVIANDO...' : '📨 ENVIAR →'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Historial público ─────────────────────── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {feedbackList.length === 0 && (
                <div style={{ textAlign: 'center', padding: '30px', color: '#4a5568', fontSize: '0.72rem', fontFamily: "'Orbitron',sans-serif" }}>
                  SIN OPINIONES AÚN · SÉ EL PRIMERO
                </div>
              )}
              {feedbackList.map(item => {
                const TIPO_CLR: Record<string,string> = { sugerencia:'#009ee3', bug:'#ff4757', valoracion:'#ffd700', otro:'#8b949e' };
                const TIPO_ICO: Record<string,string> = { sugerencia:'💡', bug:'🐛', valoracion:'⭐', otro:'💬' };
                const color = TIPO_CLR[item.tipo] ?? '#8b949e';
                const ico   = TIPO_ICO[item.tipo] ?? '💬';
                const isRespondido  = !!item.ceo_respuesta;
                const isCeoOpen     = ceoReplyTarget === item.id;
                const fechaStr      = item.creado_en?.toDate?.()
                  ? item.creado_en.toDate!().toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
                  : '';
                return (
                  <div key={item.id} style={{ background: '#0d1117', border: \`1px solid \${isRespondido ? 'rgba(0,255,136,0.2)' : '#1c2028'}\`, borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                      <span style={{ background: \`\${color}18\`, color, border: \`1px solid \${color}40\`, borderRadius: 20, padding: '2px 10px', fontSize: '0.62rem', fontFamily: "'Orbitron',sans-serif", fontWeight: 700 }}>
                        {ico} {item.tipo.toUpperCase()}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: '0.8rem', color: 'white' }}>{item.nombre}</span>
                      {item.tipo === 'valoracion' && item.estrellas && (
                        <span style={{ color: '#ffd700', fontSize: '0.75rem' }}>{'⭐'.repeat(item.estrellas)}</span>
                      )}
                      <span style={{ marginLeft: 'auto', color: '#4a5568', fontSize: '0.65rem' }}>{fechaStr}</span>
                    </div>
                    <div style={{ color: '#cdd9e5', fontSize: '0.82rem', lineHeight: 1.55 }}>{item.mensaje}</div>

                    {/* Respuesta CEO */}
                    {isRespondido && (
                      <div style={{ marginTop: 10, background: 'rgba(255,215,0,0.05)', border: '1px solid rgba(255,215,0,0.2)', borderRadius: 8, padding: '10px 12px' }}>
                        <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.58rem', color: '#ffd700', fontWeight: 900, marginBottom: 4 }}>⭐ CEO LFA</div>
                        <div style={{ color: '#cdd9e5', fontSize: '0.8rem', lineHeight: 1.5 }}>{item.ceo_respuesta}</div>
                      </div>
                    )}

                    {/* CEO: botón responder */}
                    {esAdmin && !isRespondido && (
                      <div style={{ marginTop: 10 }}>
                        {!isCeoOpen ? (
                          <button onClick={() => { setCeoReplyTarget(item.id); setCeoReplyText(''); }} style={{ background: 'rgba(255,215,0,0.07)', border: '1px solid #ffd70030', color: '#ffd700', borderRadius: 8, padding: '4px 14px', fontSize: '0.63rem', cursor: 'pointer', fontFamily: "'Orbitron',sans-serif", fontWeight: 700 }}>
                            ✏️ RESPONDER
                          </button>
                        ) : (
                          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                            <textarea value={ceoReplyText} onChange={e => setCeoReplyText(e.target.value)} maxLength={400} rows={2} placeholder="Tu respuesta como CEO..." style={{ flex: 1, background: '#161b22', border: '1px solid #ffd70030', borderRadius: 8, padding: '8px 10px', color: 'white', fontSize: '0.78rem', resize: 'none', fontFamily: "'Roboto',sans-serif", outline: 'none' }} />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <button onClick={() => ceoResponder(item.id)} disabled={ceoReplying || !ceoReplyText.trim()} style={{ background: 'linear-gradient(135deg,#ffd700,#f0a500)', border: 'none', color: '#0b0e14', borderRadius: 8, padding: '6px 14px', fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.63rem', cursor: 'pointer', opacity: !ceoReplyText.trim() ? 0.5 : 1 }}>
                                {ceoReplying ? '...' : '✅ OK'}
                              </button>
                              <button onClick={() => setCeoReplyTarget(null)} style={{ background: 'transparent', border: '1px solid #30363d', color: '#8b949e', borderRadius: 8, padding: '4px 10px', fontSize: '0.62rem', cursor: 'pointer' }}>
                                Cancelar
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

          </div>`;

  c = c.slice(0, oldFeedbackStart) + newFeedbackSection + c.slice(oldFeedbackEnd);
  console.log('Replaced feedback section');
} else {
  console.log('WARNING: old feedback section not found. Start:', oldFeedbackStart, 'End:', oldFeedbackEnd);
}

// Write final file
fs.writeFileSync('C:/Users/Leandro/Desktop/LFA-FINAL/app/hub/page.tsx', c, 'utf8');
// Delete temp
fs.unlinkSync('C:/Users/Leandro/Desktop/LFA-FINAL/app/hub/page_clean.tsx');

// Verify no corruption
const result = fs.readFileSync('C:/Users/Leandro/Desktop/LFA-FINAL/app/hub/page.tsx', 'utf8');
const lines = result.split('\n');
const bad = lines.filter(l => /[\u00c0-\u00ff][\u0080-\u00bf]/.test(l));
console.log('Final file: lines=' + lines.length + ' corrupted=' + bad.length);

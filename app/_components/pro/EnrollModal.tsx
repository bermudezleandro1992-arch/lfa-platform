'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { ProLeague } from '@/lib/types';
import { flagEmojiToCode } from './LogoImg';

const LOGOS_ESCUDOS = ['⚽','🦁','🐺','🦅','🔥','⚡','💎','🛡️','🗡️','🏴‍☠️','🐉','🦊','🐯','🦈','🚀','💀','🏆','⭐','🌊','🎯','🏹','⚔️','🌟','💫','🔱','🦋','🐍','🦂','🦏','🐻'];
const LOGOS_FLAGS   = ['🇦🇷','🇧🇷','🇨🇱','🇨🇴','🇲🇽','🇵🇪','🇺🇾','🇵🇾','🇪🇨','🇧🇴','🇻🇪','🇪🇸','🇵🇹','🇺🇸','🇫🇷','🇮🇹','🇩🇪','🇯🇵','🇰🇷','🇸🇦','🇦🇺','🇳🇱','🇧🇪','🇵🇱','🇬🇧'];
const LOGOS_CLUBS   = ['🔵','🔴','⚪','⚫','🟡','🟠','🟢','🟣','🟤','🔶','🔷','🔸','🔹','❤️','💙','💛','💚','🖤','🤍','💜'];

type LogoTab = 'escudos' | 'banderas' | 'colores' | 'url';

interface Props {
  league: ProLeague;
  uid: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EnrollModal({ league, uid, onClose, onSuccess }: Props) {
  const [step,       setStep]       = useState<'form'|'done'>('form');
  const [teamName,   setTeamName]   = useState('');
  const [logo,       setLogo]       = useState('⚽');
  const [logoTab,    setLogoTab]    = useState<LogoTab>('escudos');
  const [customUrl,  setCustomUrl]  = useState('');
  const [platformId, setPlatformId] = useState('');
  const [whatsapp,   setWhatsapp]   = useState('');
  const [country,    setCountry]    = useState('');
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');

  const displayLogo = logoTab === 'url' && customUrl.trim() ? customUrl.trim() : logo;

  // Pre-fill from user data
  useEffect(() => {
    getDoc(doc(db, 'usuarios', uid)).then(snap => {
      if (!snap.exists()) return;
      const d = snap.data();
      if (d.whatsapp)                               setWhatsapp(d.whatsapp);
      if (d.pais || d.country)                      setCountry(d.pais || d.country);
      if (d.nombre)                                 setTeamName(d.nombre + ' FC');
      // Prefill platform ID by game
      if (league.game === 'efootball' && d.konami_id)  setPlatformId(d.konami_id);
      if (league.game === 'fc26'      && d.ea_id)      setPlatformId(d.ea_id);
      if (league.game === 'mobile'    && d.konami_id)  setPlatformId(d.konami_id);
    });
  }, [uid, league.game]);

  const platformLabel =
    league.game === 'efootball' ? 'Konami ID (eFootball)' :
    league.game === 'mobile'    ? 'Konami ID (Mobile)' :
    'EA ID / Gamertag (FC 26)';

  const platformPlaceholder =
    league.game === 'fc26' ? 'Ej: UserFC26' : 'Ej: 123-456-789';

  async function handleEnroll() {
    if (!teamName.trim() || !platformId.trim() || !whatsapp.trim()) {
      setError('Completá todos los campos.'); return;
    }
    if (whatsapp.replace(/\D/g,'').length < 8) {
      setError('WhatsApp inválido.'); return;
    }
    setSaving(true); setError('');
    try {
      const token = await auth.currentUser!.getIdToken();
      const res = await fetch('/api/pro/enroll', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body: JSON.stringify({
          league_id: league.id,
          team_name: teamName.trim(),
          logo_url: displayLogo,
          platform_id: platformId.trim(),
          whatsapp: whatsapp.trim(),
          country: country.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Error al inscribirse.'); return; }
      setStep('done');
      setTimeout(onSuccess, 1800);
    } catch { setError('Error de conexión.'); }
    finally { setSaving(false); }
  }

  const inp: React.CSSProperties = {
    width:'100%', padding:'11px 14px', background:'#0b0e14',
    border:'1px solid #30363d', borderRadius:8, color:'#e6edf3',
    fontSize:'0.85rem', outline:'none', boxSizing:'border-box',
  };

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', backdropFilter:'blur(6px)',
        display:'flex', alignItems:'center', justifyContent:'center',
        zIndex:1000, padding:20,
      }}
    >
      <div style={{
        background:'#161b22', borderRadius:20, width:'100%', maxWidth:480,
        border:'1px solid #30363d', overflow:'hidden',
        boxShadow:'0 24px 80px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{ padding:'20px 24px 16px', borderBottom:'1px solid #30363d' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'0.9rem', color:'#e6edf3' }}>
              INSCRIPCIÓN
            </div>
            <button onClick={onClose}
              style={{ background:'none', border:'none', color:'#8b949e', fontSize:'1.2rem', cursor:'pointer' }}>✕</button>
          </div>
          <div style={{ color:'#8b949e', fontSize:'0.78rem', marginTop:4 }}>{league.name}</div>
        </div>

        {step === 'done' ? (
          <div style={{ padding:'48px 24px', textAlign:'center' }}>
            <div style={{ fontSize:'4rem', marginBottom:16 }}>🎉</div>
            <div style={{ fontFamily:"'Orbitron',sans-serif", fontWeight:700, color:'#00ff88', fontSize:'1rem' }}>
              ¡Inscripto!
            </div>
            <div style={{ color:'#8b949e', fontSize:'0.82rem', marginTop:8 }}>
              El fixture se generará cuando se completen los cupos
            </div>
          </div>
        ) : (
          <div style={{ padding:'24px' }}>
            {/* Logo selector */}
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:'0.72rem', color:'#8b949e', marginBottom:8, letterSpacing:1 }}>ESCUDO DEL EQUIPO</div>

              {/* Tab selector */}
              <div style={{ display:'flex', gap:4, marginBottom:10, flexWrap:'wrap' }}>
                {(['escudos','banderas','colores','url'] as LogoTab[]).map(t => (
                  <button key={t} onClick={() => setLogoTab(t)} style={{
                    padding:'4px 10px', borderRadius:6, cursor:'pointer',
                    background: logoTab===t ? '#00ff8822' : '#21262d',
                    border: `1px solid ${logoTab===t ? '#00ff8844' : '#30363d'}`,
                    color: logoTab===t ? '#00ff88' : '#8b949e',
                    fontSize:'0.65rem', fontFamily:"'Orbitron',sans-serif", fontWeight:700, letterSpacing:0.5,
                  } as React.CSSProperties}>
                    {t === 'escudos' ? '🛡️ ESCUDOS' : t === 'banderas' ? '🌎 BANDERAS' : t === 'colores' ? '🎨 COLORES' : '🔗 URL'}
                  </button>
                ))}
              </div>

              {logoTab !== 'url' && (
                <div style={{ display:'flex', flexWrap:'wrap', gap:6, maxHeight:120, overflowY:'auto', padding:'4px 0' }}>
                  {(logoTab === 'escudos' ? LOGOS_ESCUDOS : logoTab === 'banderas' ? LOGOS_FLAGS : LOGOS_CLUBS).map(l => {
                    const flagCode = logoTab === 'banderas' ? flagEmojiToCode(l) : null;
                    return (
                      <button key={l} onClick={() => setLogo(l)}
                        style={{
                          width:38, height:38, borderRadius:8,
                          fontSize: flagCode ? 'unset' : '1.3rem',
                          background: logo===l ? '#00ff8822' : '#21262d',
                          border: logo===l ? '2px solid #00ff88' : '1px solid #30363d',
                          cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
                          transition:'all 0.12s', flexShrink:0, padding:0, overflow:'hidden',
                        }}
                      >
                        {flagCode
                          ? <img src={`https://flagcdn.com/40x30/${flagCode}.png`} alt={flagCode.toUpperCase()} style={{ width:34, height:'auto', display:'block' }} />
                          : l
                        }
                      </button>
                    );
                  })}
                </div>
              )}

              {logoTab === 'url' && (
                <div>
                  <input style={inp} value={customUrl} onChange={e => setCustomUrl(e.target.value)}
                    placeholder="https://... URL de tu logo (imagen cuadrada recomendada)"
                    maxLength={300}
                  />
                  <div style={{ fontSize:'0.68rem', color:'#555', marginTop:4 }}>
                    Usá un link de imagen (.png / .jpg / .webp). Se verá como tu escudo en el fixture.
                  </div>
                  {customUrl.trim() && (
                    <div style={{ marginTop:8, textAlign:'center' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={customUrl.trim()} alt="logo preview"
                        style={{ width:60, height:60, borderRadius:12, objectFit:'cover', border:'1px solid #30363d' }}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                  )}
                </div>
              )}

              <div style={{ textAlign:'center', fontSize:'2.5rem', marginTop:10 }}>
                {(() => {
                  const src = logoTab === 'url' && customUrl.trim() ? customUrl.trim() : null;
                  if (src) return <img src={src} alt="logo" style={{ width:50, height:50, borderRadius:10, objectFit:'cover', display:'inline-block' }} onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />;
                  const code = flagEmojiToCode(logo);
                  if (code) return <img src={`https://flagcdn.com/48x36/${code}.png`} alt={code.toUpperCase()} style={{ borderRadius:4, display:'inline-block' }} />;
                  return logo;
                })()}
              </div>
            </div>

            {/* Form */}
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div>
                <label style={{ fontSize:'0.72rem', color:'#8b949e', display:'block', marginBottom:5 }}>NOMBRE DE EQUIPO *</label>
                <input style={inp} value={teamName} onChange={e => setTeamName(e.target.value)} placeholder="Mi Equipo FC" maxLength={30} />
              </div>
              <div>
                <label style={{ fontSize:'0.72rem', color:'#8b949e', display:'block', marginBottom:5 }}>{platformLabel.toUpperCase()} *</label>
                <input style={inp} value={platformId} onChange={e => setPlatformId(e.target.value)} placeholder={platformPlaceholder} maxLength={50} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div>
                  <label style={{ fontSize:'0.72rem', color:'#8b949e', display:'block', marginBottom:5 }}>WHATSAPP (con cód. país) *</label>
                  <input style={inp} value={whatsapp} type="tel" onChange={e => setWhatsapp(e.target.value)} placeholder="+54 9 11 1234-5678" maxLength={20} />
                </div>
                <div>
                  <label style={{ fontSize:'0.72rem', color:'#8b949e', display:'block', marginBottom:5 }}>PAÍS</label>
                  <input style={inp} value={country} onChange={e => setCountry(e.target.value)} placeholder="Ej: Argentina" maxLength={30} />
                </div>
              </div>
            </div>

            {error && (
              <div style={{ marginTop:12, padding:'10px 14px', background:'#ff444422', borderRadius:8, color:'#ff6b6b', fontSize:'0.8rem' }}>
                {error}
              </div>
            )}

            <button
              onClick={handleEnroll}
              disabled={saving}
              style={{
                marginTop:20, width:'100%', padding:'14px', borderRadius:10, border:'none',
                background: saving ? '#30363d' : 'linear-gradient(135deg,#00ff88,#00cc6a)',
                color: saving ? '#8b949e' : '#000',
                fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'0.82rem',
                cursor: saving ? 'not-allowed' : 'pointer', letterSpacing:1,
                transition:'all 0.2s',
              }}
            >
              {saving ? 'INSCRIBIENDO...' : '⚡ CONFIRMAR INSCRIPCIÓN'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { ProLeague } from '@/lib/types';

const LOGOS = ['⚽','🦁','🐺','🦅','🔥','⚡','💎','🛡️','🗡️','🏴‍☠️','🐉','🦊','🐯','🦈','🚀','💀','🏆','⭐','🌊','🎯'];

interface Props {
  league: ProLeague;
  uid: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EnrollModal({ league, uid, onClose, onSuccess }: Props) {
  const [step,       setStep]       = useState<'form'|'confirm'|'done'>('form');
  const [teamName,   setTeamName]   = useState('');
  const [logo,       setLogo]       = useState('⚽');
  const [platformId, setPlatformId] = useState('');
  const [whatsapp,   setWhatsapp]   = useState('');
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');

  // Pre-fill from user data
  useEffect(() => {
    getDoc(doc(db, 'usuarios', uid)).then(snap => {
      if (!snap.exists()) return;
      const d = snap.data();
      if (d.whatsapp)   setWhatsapp(d.whatsapp);
      if (d.konami_id)  setPlatformId(d.konami_id);
      if (d.nombre)     setTeamName(d.nombre + ' FC');
    });
  }, [uid]);

  const platformLabel = league.game === 'efootball' ? 'Konami ID' : 'EA ID / Gamertag';

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
          logo_url: logo,
          platform_id: platformId.trim(),
          whatsapp: whatsapp.trim(),
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
              <div style={{ fontSize:'0.75rem', color:'#8b949e', marginBottom:8 }}>Elegí tu escudo</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {LOGOS.map(l => (
                  <button key={l} onClick={() => setLogo(l)}
                    style={{
                      width:40, height:40, borderRadius:10, fontSize:'1.4rem',
                      background: logo===l ? '#00ff8822' : '#21262d',
                      border: logo===l ? '2px solid #00ff88' : '1px solid #30363d',
                      cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
                      transition:'all 0.15s',
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <div style={{ textAlign:'center', fontSize:'2.5rem', marginTop:8 }}>{logo}</div>
            </div>

            {/* Form */}
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div>
                <label style={{ fontSize:'0.72rem', color:'#8b949e', display:'block', marginBottom:5 }}>
                  NOMBRE DE EQUIPO *
                </label>
                <input style={inp} value={teamName}
                  onChange={e => setTeamName(e.target.value)}
                  placeholder="Mi Equipo FC" maxLength={30}
                />
              </div>
              <div>
                <label style={{ fontSize:'0.72rem', color:'#8b949e', display:'block', marginBottom:5 }}>
                  {platformLabel.toUpperCase()} *
                </label>
                <input style={inp} value={platformId}
                  onChange={e => setPlatformId(e.target.value)}
                  placeholder={league.game === 'efootball' ? 'Ej: 123-456-789' : 'Ej: UserFC26'}
                  maxLength={50}
                />
              </div>
              <div>
                <label style={{ fontSize:'0.72rem', color:'#8b949e', display:'block', marginBottom:5 }}>
                  WHATSAPP (con código de país) *
                </label>
                <input style={inp} value={whatsapp} type="tel"
                  onChange={e => setWhatsapp(e.target.value)}
                  placeholder="+54 9 11 1234-5678"
                  maxLength={20}
                />
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

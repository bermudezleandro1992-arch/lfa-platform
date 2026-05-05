'use client';

import { useState, useRef } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage, auth } from '@/lib/firebase';
import type { LeagueMatch } from '@/lib/types';

interface Props {
  match: LeagueMatch;
  uid: string;
  onClose: () => void;
  onReported: () => void;
}

type Phase = 'upload' | 'scanning' | 'confirm' | 'sent';

export default function ReportModal({ match, uid, onClose, onReported }: Props) {
  const [phase,       setPhase]       = useState<Phase>('upload');
  const [file,        setFile]        = useState<File | null>(null);
  const [preview,     setPreview]     = useState('');
  const [ocrResult,   setOcrResult]   = useState<{ home: number; away: number } | null>(null);
  const [myScore,     setMyScore]     = useState('');
  const [rivalScore,  setRivalScore]  = useState('');
  const [error,       setError]       = useState('');
  const [uploading,   setUploading]   = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isPlayer1  = match.player1_uid === uid;
  const myTeam     = isPlayer1 ? match.player1_team : match.player2_team;
  const rivalTeam  = isPlayer1 ? match.player2_team : match.player1_team;

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) { setError('Solo se aceptan imágenes.'); return; }
    if (f.size > 8 * 1024 * 1024) { setError('Imagen máximo 8MB.'); return; }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setError('');
  }

  async function handleScan() {
    if (!file) return;
    setUploading(true);
    setPhase('scanning');
    setError('');

    try {
      const token = await auth.currentUser!.getIdToken();

      // 1. Upload to storage
      const storagePath = `league_results/${match.id}_${Date.now()}.jpg`;
      const storageRef  = ref(storage, storagePath);
      await uploadBytes(storageRef, file, { contentType: file.type });
      const photoUrl = await getDownloadURL(storageRef);

      // 2. Call OCR API
      const res = await fetch('/api/pro/reportResult', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body: JSON.stringify({ match_id: match.id, photo_url: photoUrl, storage_path: storagePath }),
      });
      const data = await res.json();

      if (!res.ok) { setError(data.error ?? 'Error al procesar.'); setPhase('upload'); return; }

      if (data.ocr_score) {
        setOcrResult(data.ocr_score);
        // Pre-fill scores based on player position
        setMyScore(String(isPlayer1 ? data.ocr_score.home : data.ocr_score.away));
        setRivalScore(String(isPlayer1 ? data.ocr_score.away : data.ocr_score.home));
      }
      setPhase('confirm');
    } catch { setError('Error de conexión.'); setPhase('upload'); }
    finally { setUploading(false); }
  }

  async function handleConfirm() {
    const ms = parseInt(myScore);
    const rs = parseInt(rivalScore);
    if (isNaN(ms) || isNaN(rs) || ms < 0 || rs < 0) {
      setError('Ingresá goles válidos.'); return;
    }
    setUploading(true);
    try {
      const token = await auth.currentUser!.getIdToken();
      const res = await fetch('/api/pro/confirmScore', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body: JSON.stringify({
          match_id: match.id,
          score: isPlayer1
            ? { [match.player1_uid]: ms, [match.player2_uid]: rs }
            : { [match.player2_uid]: ms, [match.player1_uid]: rs },
        }),
      });
      if (res.ok) { setPhase('sent'); setTimeout(onReported, 1500); }
      else { const d = await res.json(); setError(d.error ?? 'Error.'); }
    } catch { setError('Error de conexión.'); }
    finally { setUploading(false); }
  }

  const inp: React.CSSProperties = {
    width:70, padding:'8px 10px', background:'#0b0e14',
    border:'1px solid #30363d', borderRadius:8, color:'#e6edf3',
    fontSize:'1.2rem', fontFamily:"'Orbitron',sans-serif",
    fontWeight:700, textAlign:'center', outline:'none',
  };

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position:'fixed', inset:0, background:'rgba(0,0,0,0.82)', backdropFilter:'blur(8px)',
        display:'flex', alignItems:'center', justifyContent:'center',
        zIndex:1000, padding:20,
      }}
    >
      <div style={{
        background:'#161b22', borderRadius:20, width:'100%', maxWidth:440,
        border:'1px solid #ffd70033', overflow:'hidden',
        boxShadow:'0 0 60px rgba(255,215,0,0.1)',
      }}>
        {/* Header */}
        <div style={{ padding:'20px 24px 16px', borderBottom:'1px solid #30363d', background:'#0d1117' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'0.88rem', color:'#ffd700' }}>
              📸 REPORTAR RESULTADO
            </div>
            <button onClick={onClose}
              style={{ background:'none', border:'none', color:'#8b949e', fontSize:'1.1rem', cursor:'pointer' }}>✕</button>
          </div>
          <div style={{ color:'#8b949e', fontSize:'0.75rem', marginTop:3 }}>
            {myTeam} vs {rivalTeam} — Jornada {match.round}
          </div>
        </div>

        <div style={{ padding:'24px' }}>
          {/* UPLOAD phase */}
          {phase === 'upload' && (
            <>
              <div style={{ fontSize:'0.78rem', color:'#8b949e', marginBottom:16, lineHeight:1.6 }}>
                Subi una captura donde se vean <strong style={{ color:'#e6edf3' }}>ambas IDs</strong> y el <strong style={{ color:'#e6edf3' }}>resultado final</strong> del partido.
              </div>

              <input ref={fileRef} type="file" accept="image/*" capture="environment"
                onChange={onFileChange} style={{ display:'none' }} />

              {preview ? (
                <div style={{ position:'relative', marginBottom:16 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="preview"
                    style={{ width:'100%', borderRadius:10, maxHeight:220, objectFit:'cover' }}
                  />
                  <button onClick={() => { setFile(null); setPreview(''); }}
                    style={{
                      position:'absolute', top:8, right:8, background:'#000000cc',
                      border:'none', borderRadius:6, color:'white', cursor:'pointer',
                      padding:'4px 8px', fontSize:'0.75rem',
                    }}
                  >
                    Cambiar
                  </button>
                </div>
              ) : (
                <button onClick={() => fileRef.current?.click()}
                  style={{
                    width:'100%', padding:'32px', borderRadius:12, border:'2px dashed #30363d',
                    background:'#21262d', color:'#8b949e', cursor:'pointer', marginBottom:16,
                    textAlign:'center', transition:'all 0.2s',
                  }}
                >
                  <div style={{ fontSize:'2.5rem', marginBottom:8 }}>📷</div>
                  <div style={{ fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'0.72rem' }}>
                    TOCAR PARA SELECCIONAR
                  </div>
                  <div style={{ fontSize:'0.68rem', marginTop:4 }}>JPG, PNG — máx 8MB</div>
                </button>
              )}

              {error && <div style={{ marginBottom:12, padding:'10px', background:'#ff444422', borderRadius:8, color:'#ff6b6b', fontSize:'0.78rem' }}>{error}</div>}

              <button onClick={handleScan} disabled={!file || uploading}
                style={{
                  width:'100%', padding:'13px', borderRadius:10, border:'none',
                  background: (!file || uploading) ? '#30363d' : 'linear-gradient(135deg,#ffd700,#ff9900)',
                  color: (!file || uploading) ? '#8b949e' : '#000',
                  fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'0.8rem',
                  cursor: (!file || uploading) ? 'not-allowed' : 'pointer', letterSpacing:1,
                }}
              >
                ANALIZAR CON IA →
              </button>
            </>
          )}

          {/* SCANNING phase */}
          {phase === 'scanning' && (
            <div style={{ textAlign:'center', padding:'40px 20px' }}>
              <div style={{ fontSize:'3rem', marginBottom:16, animation:'pulse 1s infinite' }}>🔍</div>
              <div style={{ fontFamily:"'Orbitron',sans-serif", fontWeight:700, color:'#ffd700', fontSize:'0.9rem' }}>
                ESCANEANDO RESULTADO...
              </div>
              <div style={{ color:'#8b949e', fontSize:'0.78rem', marginTop:8 }}>La IA está leyendo la imagen</div>
            </div>
          )}

          {/* CONFIRM phase */}
          {phase === 'confirm' && (
            <>
              {ocrResult && (
                <div style={{
                  padding:'12px 16px', background:'#00ff8818', border:'1px solid #00ff8833',
                  borderRadius:10, marginBottom:20, fontSize:'0.8rem',
                }}>
                  <div style={{ color:'#00ff88', fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'0.65rem', marginBottom:6 }}>
                    ✅ IA DETECTÓ
                  </div>
                  <div style={{ color:'#e6edf3' }}>
                    Local: <strong>{ocrResult.home}</strong> — Visitante: <strong>{ocrResult.away}</strong>
                  </div>
                  <div style={{ color:'#8b949e', fontSize:'0.7rem', marginTop:4 }}>
                    Confirmá o corregí si hay error
                  </div>
                </div>
              )}

              <div style={{ fontSize:'0.75rem', color:'#8b949e', marginBottom:16 }}>Ingresá el resultado final:</div>

              <div style={{ display:'flex', alignItems:'center', gap:16, justifyContent:'center', marginBottom:20 }}>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:'0.7rem', color:'#8b949e', marginBottom:6 }}>TU EQUIPO ({myTeam})</div>
                  <input style={inp} type="number" min={0} max={99}
                    value={myScore} onChange={e => setMyScore(e.target.value)} />
                </div>
                <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:'1.5rem', color:'#555', marginTop:20 }}>—</div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:'0.7rem', color:'#8b949e', marginBottom:6 }}>{rivalTeam}</div>
                  <input style={inp} type="number" min={0} max={99}
                    value={rivalScore} onChange={e => setRivalScore(e.target.value)} />
                </div>
              </div>

              {error && <div style={{ marginBottom:12, padding:'10px', background:'#ff444422', borderRadius:8, color:'#ff6b6b', fontSize:'0.78rem' }}>{error}</div>}

              <div style={{ display:'flex', gap:10 }}>
                <button onClick={() => setPhase('upload')}
                  style={{
                    flex:1, padding:'12px', borderRadius:8, cursor:'pointer',
                    background:'transparent', border:'1px solid #30363d', color:'#8b949e', fontSize:'0.78rem',
                  }}
                >
                  ← Cambiar foto
                </button>
                <button onClick={handleConfirm} disabled={uploading}
                  style={{
                    flex:2, padding:'12px', borderRadius:8, border:'none', cursor:'pointer',
                    background: uploading ? '#30363d' : 'linear-gradient(135deg,#00ff88,#00cc6a)',
                    color: uploading ? '#8b949e' : '#000',
                    fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'0.75rem', letterSpacing:1,
                  }}
                >
                  {uploading ? '...' : '📤 ENVIAR REPORTE'}
                </button>
              </div>
            </>
          )}

          {/* SENT phase */}
          {phase === 'sent' && (
            <div style={{ textAlign:'center', padding:'40px 20px' }}>
              <div style={{ fontSize:'3.5rem', marginBottom:16 }}>⏳</div>
              <div style={{ fontFamily:"'Orbitron',sans-serif", fontWeight:700, color:'#ffd700', fontSize:'0.9rem' }}>
                RESULTADO ENVIADO
              </div>
              <div style={{ color:'#8b949e', fontSize:'0.78rem', marginTop:8 }}>
                Tu rival tiene 10 minutos para confirmar o disputar
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

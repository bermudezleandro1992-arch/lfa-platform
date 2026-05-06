'use client';

/**
 * LoginBox — Login + Registro separados por pestañas.
 * Registro requiere: confirmar contraseña, EA ID / Konami ID,
 * consola, juego preferido y scroll obligatorio del reglamento.
 */

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  type AuthError,
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { getVisitorId } from '@/lib/fingerprint';
import LfaModal, { type LfaModalHandle } from '@/app/_components/LfaModal';
import type { Translations } from '@/app/_components/LangDropdown';
import type { RegionDetectionResult } from '@/lib/types';

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

function sanitizarInput(input: string) {
  return input.trim().replace(/[<>'"`;=\\]/g, '');
}

async function analizarRed(): Promise<RegionDetectionResult> {
  try {
    const res = await fetch('/api/detect-region');
    if (!res.ok) throw new Error();
    return await res.json();
  } catch {
    return { region: 'AMERICA' as const, country: 'XX', countryName: 'Unknown', city: 'Unknown', isVpn: false };
  }
}

const TOS_TEXT = `REGLAMENTO SOMOSLFA — RESUMEN

📋 PARTICIPACIÓN
• Cada jugador debe tener una sola cuenta activa.
• Está prohibido compartir cuentas o usar IDs ajenos.
• El EA ID / Konami ID registrado debe coincidir con el usado en partidos.

⚽ PARTIDOS
• Los resultados se reportan con una captura de la pantalla final del juego.
• La IA valida el marcador automáticamente.
• En caso de disputa, el Staff revisará la evidencia y decidirá.

⏱️ TIEMPOS
• Tenés 10 minutos para confirmar el resultado luego de que tu rival lo reporte.
• Si no confirmás, el sistema cierra el partido automáticamente.

⚖️ FAIR PLAY
• Conducta antideportiva, insultos o manipulación pueden resultar en descuento de puntos o exclusión.
• El incumplimiento reiterado puede derivar en ban permanente.

🔒 PRIVACIDAD
• Tu email es privado — nunca visible para otros jugadores.
• Usamos estadísticas anónimas para análisis de rendimiento.

💰 REEMBOLSOS
• Inscripciones pagadas reembolsables solo si la liga no inicia en 7 días hábiles.
• Una vez iniciada la liga, no hay reembolso por abandono voluntario.

Al aceptar confirmás haber leído y comprendido el Reglamento completo en somoslfa.com/reglamento, los Términos de Servicio, la Política de Privacidad y la Política de Reembolsos.`;

interface LoginBoxProps {
  t: Translations;
}

export default function LoginBox({ t }: LoginBoxProps) {
  const router   = useRouter();
  const modalRef = useRef<LfaModalHandle>(null);

  const [mode, setMode] = useState<'login' | 'register'>('login');

  const [email,       setEmail]       = useState('');
  const [pass,        setPass]        = useState('');
  const [terms,       setTerms]       = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [loadingGoog, setLoadingGoog] = useState(false);

  const [confirmPass,    setConfirmPass]    = useState('');
  const [eaId,           setEaId]           = useState('');
  const [konamiId,       setKonamiId]       = useState('');
  const [consola,        setConsola]        = useState('');
  const [juegoPreferido, setJuegoPreferido] = useState('');
  const [tosScrolled,    setTosScrolled]    = useState(false);

  const [showRecuperar,   setShowRecuperar]   = useState(false);
  const [emailRecuperar,  setEmailRecuperar]  = useState('');
  const [statusRecuperar, setStatusRecuperar] = useState('');

  const alerta = useCallback(
    (titulo: string, mensaje: string, tipo: 'info' | 'error' | 'exito' = 'info') =>
      modalRef.current!.mostrarAlerta(titulo, mensaje, tipo),
    [],
  );

  const pedirDato = useCallback(
    (titulo: string, mensaje: string) => modalRef.current!.pedirDato(titulo, mensaje),
    [],
  );

  function handleTosScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) setTosScrolled(true);
  }

  function switchMode(m: 'login' | 'register') {
    setMode(m);
    setPass('');
    setConfirmPass('');
    setTerms(false);
    setTosScrolled(false);
  }

  async function verificarDivision(uid: string) {
    try {
      const snap = await getDoc(doc(db, 'usuarios', uid));
      if (snap.exists() && !(snap.data() as Record<string, unknown>).division_efootball) {
        router.push('/hub?verificar-division=1');
      } else {
        router.push('/hub');
      }
    } catch {
      router.push('/hub');
    }
  }

  const loginUser = useCallback(async () => {
    if (!terms) {
      await alerta('ATENCIÓN', 'Es obligatorio aceptar el Reglamento marcando la casilla antes de entrar.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      await alerta('CORREO INVÁLIDO', '⛔ El formato del correo electrónico no es válido.', 'error');
      return;
    }
    if (pass.length < 6) {
      await alerta('CONTRASEÑA CORTA', 'La contraseña debe tener al menos 6 caracteres.', 'error');
      return;
    }
    setLoading(true);
    const datosRed = await analizarRed();
    if (datosRed.isVpn) {
      setLoading(false);
      await alerta('ESCUDO ANTI-VPN', '🚫 VPN o Proxy detectada. Apagala para iniciar sesión.', 'error');
      return;
    }
    if (datosRed.isBanned) {
      setLoading(false);
      await alerta('ACCESO DENEGADO', '🚫 Tu IP ha sido bloqueada. Contactá soporte.', 'error');
      return;
    }
    const hw = obtenerHardware();
    const fingerprintId = await getVisitorId();
    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      if (!cred.user.emailVerified) {
        await alerta('CUENTA NO VERIFICADA', 'Tu correo aún no está verificado. Revisá tu bandeja de entrada o Spam.');
        await signOut(auth);
        setLoading(false);
        return;
      }
      await setDoc(doc(db, 'usuarios', cred.user.uid), {
        ip_conexion: datosRed.country, hw_avanzado: hw,
        ip: datosRed.ip ?? '', pais_codigo: datosRed.country,
        terminos_aceptados: true, fingerprint_id: fingerprintId,
        last_login: new Date().toISOString(),
      }, { merge: true });
      await verificarDivision(cred.user.uid);
    } catch (err) {
      const error = err as AuthError;
      if (
        error.code === 'auth/user-not-found' ||
        error.code === 'auth/invalid-credential' ||
        error.code === 'auth/invalid-login-credentials'
      ) {
        await alerta('CREDENCIALES INCORRECTAS', '⛔ Email o contraseña incorrectos. ¿Primera vez? Usá la pestaña REGISTRARSE.', 'error');
      } else {
        await alerta('ERROR', error.message, 'error');
      }
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, pass, terms, alerta]);

  const registerUser = useCallback(async () => {
    if (!terms) {
      await alerta('ATENCIÓN', 'Es obligatorio leer y aceptar el Reglamento antes de registrarte.');
      return;
    }
    if (!tosScrolled) {
      await alerta('REGLAMENTO NO LEÍDO', 'Debés hacer scroll hasta el final del Reglamento para habilitarlo.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      await alerta('CORREO INVÁLIDO', '⛔ El formato del correo electrónico no es válido.', 'error');
      return;
    }
    const regexFuerte = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
    if (!regexFuerte.test(pass)) {
      await alerta('CONTRASEÑA DÉBIL', '⛔ Mínimo 8 caracteres, 1 MAYÚSCULA, 1 número y 1 símbolo (ej: @, #, $).', 'error');
      return;
    }
    if (pass !== confirmPass) {
      await alerta('CONTRASEÑAS NO COINCIDEN', '⛔ La contraseña y su confirmación no son iguales.', 'error');
      return;
    }
    if (!eaId.trim() && !konamiId.trim()) {
      await alerta('ID REQUERIDO', '⚠️ Debés ingresar al menos tu EA ID (FC 26) o Konami ID (eFootball).', 'error');
      return;
    }
    if (!consola) {
      await alerta('CONSOLA REQUERIDA', '⚠️ Seleccioná tu plataforma de juego.', 'error');
      return;
    }
    if (!juegoPreferido) {
      await alerta('JUEGO REQUERIDO', '⚠️ Seleccioná tu juego preferido.', 'error');
      return;
    }
    setLoading(true);
    const datosRed = await analizarRed();
    if (datosRed.isVpn) {
      setLoading(false);
      await alerta('ESCUDO ANTI-VPN', '🚫 VPN detectada. Apagala para registrarte.', 'error');
      return;
    }
    if (datosRed.isBanned) {
      setLoading(false);
      await alerta('ACCESO DENEGADO', '🚫 Tu IP está bloqueada.', 'error');
      return;
    }
    const hw = obtenerHardware();
    const fingerprintId = await getVisitorId();
    try {
      const newCred = await createUserWithEmailAndPassword(auth, email, pass);
      await sendEmailVerification(newCred.user);
      const platId = sanitizarInput(eaId.trim() || konamiId.trim());
      await setDoc(doc(db, 'usuarios', newCred.user.uid), {
        nombre:             email.split('@')[0],
        email,
        number:             0,
        color_carta:        'black',
        plataforma_id:      platId,
        ea_id:              sanitizarInput(eaId),
        konami_id:          sanitizarInput(konamiId),
        consola,
        juego_preferido:    juegoPreferido,
        titulos:            0,
        ip_conexion:        datosRed.country,
        ip:                 datosRed.ip ?? '',
        hw_avanzado:        hw,
        fingerprint_id:     fingerprintId,
        pais_codigo:        datosRed.country,
        region:             datosRed.region,
        terminos_aceptados: true,
      });
      await alerta('¡CUENTA CREADA!', 'Te enviamos un link de verificación a tu correo. Hacé clic en él antes de iniciar sesión.', 'exito');
      await signOut(auth);
      switchMode('login');
    } catch (err) {
      const re = err as AuthError;
      if (re.code === 'auth/email-already-in-use') {
        await alerta('EMAIL YA REGISTRADO', '⛔ Este email ya tiene cuenta. Usá la pestaña INICIAR SESIÓN.', 'error');
      } else {
        await alerta('ERROR DE REGISTRO', re.message, 'error');
      }
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, pass, confirmPass, eaId, konamiId, consola, juegoPreferido, terms, tosScrolled, alerta]);

  const loginGoogle = useCallback(async () => {
    if (!terms) {
      await alerta('ATENCIÓN', 'Es obligatorio aceptar el Reglamento marcando la casilla antes de continuar.');
      return;
    }
    setLoadingGoog(true);
    const datosRed = await analizarRed();
    if (datosRed.isVpn) {
      setLoadingGoog(false);
      await alerta('ESCUDO ANTI-VPN', '🚫 VPN detectada. Apagala para continuar.', 'error');
      return;
    }
    if (datosRed.isBanned) {
      setLoadingGoog(false);
      await alerta('ACCESO DENEGADO', '🚫 Tu IP está bloqueada.', 'error');
      return;
    }
    const hw = obtenerHardware();
    const fingerprintId = await getVisitorId();
    try {
      const result  = await signInWithPopup(auth, googleProvider);
      const userRef = doc(db, 'usuarios', result.user.uid);
      const snap    = await getDoc(userRef);
      if (!snap.exists()) {
        const id = await pedirDato(
          'ID OBLIGATORIO',
          '⚠️ REGLAMENTO LFA: Es OBLIGATORIO ingresar tu EA ID (FC26) o Konami ID (eFootball):',
        );
        if (!id?.trim()) {
          await signOut(auth);
          await alerta('REGISTRO CANCELADO', '❌ El ID es obligatorio para competir.', 'error');
          setLoadingGoog(false);
          return;
        }
        await setDoc(userRef, {
          nombre:             sanitizarInput(result.user.displayName ?? 'Jugador'),
          email:              result.user.email,
          number:             0,
          color_carta:        'black',
          titulos:            0,
          plataforma_id:      sanitizarInput(id),
          ip_conexion:        datosRed.country,
          ip:                 datosRed.ip ?? '',
          hw_avanzado:        hw,
          fingerprint_id:     fingerprintId,
          pais_codigo:        datosRed.country,
          region:             datosRed.region,
          terminos_aceptados: true,
          last_login:         new Date().toISOString(),
        });
      } else {
        await setDoc(userRef, {
          ip_conexion: datosRed.country, hw_avanzado: hw,
          ip: datosRed.ip ?? '', pais_codigo: datosRed.country,
          terminos_aceptados: true, fingerprint_id: fingerprintId,
          last_login: new Date().toISOString(),
        }, { merge: true });
      }
      await verificarDivision(result.user.uid);
    } catch (err) {
      const e = err as AuthError;
      if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
        await alerta('ERROR', 'Error con Google: ' + e.message, 'error');
      }
    }
    setLoadingGoog(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terms, alerta, pedirDato]);

  const enviarEnlace = async () => {
    const emailSan = sanitizarInput(emailRecuperar);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailSan)) {
      setStatusRecuperar('❌ Por favor, ingresá un correo electrónico válido.');
      return;
    }
    setStatusRecuperar('⏳ Enviando solicitud...');
    try {
      await sendPasswordResetEmail(auth, emailSan);
      setStatusRecuperar('✅ ¡Enlace enviado! Revisá tu correo y Spam.');
      setEmailRecuperar('');
    } catch (err) {
      const e = err as AuthError;
      setStatusRecuperar(
        e.code === 'auth/user-not-found'
          ? '❌ Ese correo no está registrado en LFA.'
          : '❌ Error interno. Reintentá en unos minutos.',
      );
    }
  };

  const inp: React.CSSProperties = {
    width: '100%', padding: '11px 14px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(0,255,136,0.2)',
    borderRadius: 10, color: '#fff',
    fontSize: '0.86rem', outline: 'none',
    boxSizing: 'border-box', marginBottom: 9,
  };
  const sel: React.CSSProperties = { ...inp, cursor: 'pointer' };
  const passMatch    = confirmPass.length > 0 && pass === confirmPass;
  const passMismatch = confirmPass.length > 0 && pass !== confirmPass;

  return (
    <>
      <LfaModal ref={modalRef} />

      {showRecuperar && (
        <div
          className="fixed inset-0 z-[10000] flex justify-center items-center p-5"
          style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(5px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowRecuperar(false); setStatusRecuperar(''); } }}
        >
          <div className="relative bg-lfa-card rounded-2xl p-6 text-center w-full max-w-sm animate-fade-in" style={{ border: '1px solid #00ff88' }}>
            <button
              onClick={() => { setShowRecuperar(false); setStatusRecuperar(''); }}
              className="absolute top-4 right-5 text-lfa-text hover:text-white text-2xl leading-none bg-transparent border-none cursor-pointer transition-colors"
              aria-label="Cerrar"
            >&times;</button>
            <div style={{ color: '#00ff88', fontSize: '3rem', marginBottom: '12px' }}>🔓</div>
            <h3 className="title-orbitron text-white font-bold text-lg mb-2.5 mt-0 tracking-wide">RECUPERAR CONTRASEÑA</h3>
            <p className="text-[#ccc] text-sm leading-relaxed mb-5">
              Ingresá tu correo. Te enviaremos un enlace para crear una nueva contraseña.
            </p>
            <input
              type="email" value={emailRecuperar}
              onChange={(e) => setEmailRecuperar(e.target.value)}
              className="input-lfa text-center mb-4"
              placeholder="Ej: juancito@email.com"
              onKeyDown={(e) => { if (e.key === 'Enter') enviarEnlace(); }}
            />
            <button onClick={enviarEnlace} className="btn-lfa-primary">✉ ENVIAR ENLACE</button>
            {statusRecuperar && (
              <div className={`mt-4 text-sm font-bold ${statusRecuperar.startsWith('✅') ? 'text-lfa-neon' : 'text-lfa-danger'}`}>
                {statusRecuperar}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="login-box w-full" style={{ maxWidth: '360px' }}>

        {/* Tabs */}
        <div style={{ display: 'flex', marginBottom: 18, background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 4 }}>
          {(['login', 'register'] as const).map(m => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              style={{
                flex: 1, padding: '9px 6px', border: 'none', borderRadius: 9, cursor: 'pointer',
                background: mode === m ? 'linear-gradient(135deg,#00ff88,#00cc6a)' : 'transparent',
                color: mode === m ? '#000' : '#8b949e',
                fontFamily: "'Orbitron',sans-serif", fontWeight: 700,
                fontSize: '0.68rem', letterSpacing: 1, transition: 'all 0.2s',
              }}
            >
              {m === 'login' ? '🔑 INICIAR SESIÓN' : '✨ REGISTRARSE'}
            </button>
          ))}
        </div>

        {/* Email */}
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inp} placeholder="Correo electrónico" disabled={loading} />

        {/* Password */}
        <input
          type="password" value={pass} onChange={(e) => setPass(e.target.value)} style={inp} disabled={loading}
          placeholder={mode === 'register' ? 'Contraseña (mín. 8 chars, MAYÚSC, número, símbolo)' : 'Contraseña'}
        />

        {mode === 'register' && (
          <>
            {/* Confirm password */}
            <input
              type="password" value={confirmPass}
              onChange={(e) => setConfirmPass(e.target.value)}
              style={{ ...inp, borderColor: passMismatch ? '#ff4757' : passMatch ? '#00ff88' : 'rgba(0,255,136,0.2)' }}
              placeholder="Confirmar contraseña" disabled={loading}
            />
            {passMismatch && <div style={{ color: '#ff4757', fontSize: '0.7rem', marginTop: -7, marginBottom: 8 }}>⛔ Las contraseñas no coinciden</div>}
            {passMatch    && <div style={{ color: '#00ff88', fontSize: '0.7rem', marginTop: -7, marginBottom: 8 }}>✅ Contraseñas coinciden</div>}

            {/* Game IDs */}
            <div style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.15)', borderRadius: 10, padding: '12px 14px', marginBottom: 9 }}>
              <div style={{ color: '#ffd700', fontSize: '0.67rem', fontFamily: "'Orbitron',sans-serif", fontWeight: 700, marginBottom: 8 }}>
                ⚠️ ID DE JUGADOR — obligatorio al menos uno
              </div>
              <input type="text" value={eaId} onChange={(e) => setEaId(e.target.value)} style={{ ...inp, marginBottom: 6 }} placeholder="🟠 EA ID — para FC 26" disabled={loading} />
              <input type="text" value={konamiId} onChange={(e) => setKonamiId(e.target.value)} style={{ ...inp, marginBottom: 0 }} placeholder="🔵 Konami ID — para eFootball" disabled={loading} />
            </div>

            {/* Console */}
            <select value={consola} onChange={(e) => setConsola(e.target.value)} style={sel} disabled={loading}>
              <option value="">🎮 Seleccioná tu consola / plataforma</option>
              <option value="PS5">🎮 PlayStation 5 (PS5)</option>
              <option value="PS4">🎮 PlayStation 4 (PS4)</option>
              <option value="Xbox">🟢 Xbox (Series X/S / One)</option>
              <option value="PC">💻 PC</option>
              <option value="Mobile">📱 Mobile</option>
            </select>

            {/* Preferred game */}
            <select value={juegoPreferido} onChange={(e) => setJuegoPreferido(e.target.value)} style={sel} disabled={loading}>
              <option value="">⚽ Juego preferido</option>
              <option value="efootball">🔵 eFootball</option>
              <option value="fc26">🟠 EA FC 26</option>
              <option value="ambos">🎯 Ambos juegos</option>
            </select>

            {/* TOS scroll */}
            <div style={{ marginBottom: 9 }}>
              <div style={{ color: '#8b949e', fontSize: '0.65rem', marginBottom: 5, fontFamily: "'Orbitron',sans-serif" }}>
                📜 LEÉ EL REGLAMENTO — hacé scroll hasta el final para aceptar
              </div>
              <div
                onScroll={handleTosScroll}
                style={{
                  background: 'rgba(0,0,0,0.5)',
                  border: `1px solid ${tosScrolled ? 'rgba(0,255,136,0.4)' : '#30363d'}`,
                  borderRadius: 10, padding: '10px 12px',
                  height: 130, overflowY: 'auto',
                  fontSize: '0.66rem', color: '#8b949e', lineHeight: 1.7, whiteSpace: 'pre-line',
                }}
              >
                {TOS_TEXT}
              </div>
              {!tosScrolled && <div style={{ color: '#ffd700', fontSize: '0.62rem', marginTop: 3, textAlign: 'center' }}>↓ Hacé scroll hasta abajo para habilitar la aceptación</div>}
              {tosScrolled  && <div style={{ color: '#00ff88', fontSize: '0.62rem', marginTop: 3, textAlign: 'center' }}>✅ Reglamento leído — podés marcar la casilla</div>}
            </div>
          </>
        )}

        {/* Forgot password (login only) */}
        {mode === 'login' && (
          <span
            className="forgot-pass"
            onClick={() => { setEmailRecuperar(email); setStatusRecuperar(''); setShowRecuperar(true); }}
            role="button" tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && setShowRecuperar(true)}
          >
            {t.olvide_pass}
          </span>
        )}

        {/* Main button */}
        <button className="btn-main" onClick={mode === 'login' ? loginUser : registerUser} disabled={loading}>
          {loading ? '🛡️ ESCANEANDO RED...' : mode === 'login' ? t.btn_entrar : '✨ CREAR CUENTA'}
        </button>

        {/* Divider */}
        <div className="divider">{t.o_accede}</div>

        {/* Google */}
        <button className="btn-main btn-google" onClick={loginGoogle} disabled={loadingGoog}>
          <GoogleSvg />
          <span>{loadingGoog ? '🛡️ ESCANEANDO RED...' : t.btn_google}</span>
        </button>

        {/* Terms */}
        <div className="terms">
          <input type="checkbox" id="chkTerms" checked={terms} onChange={(e) => setTerms(e.target.checked)} disabled={mode === 'register' && !tosScrolled} />
          <label htmlFor="chkTerms" style={{ opacity: mode === 'register' && !tosScrolled ? 0.45 : 1 }}>
            He leído y acepto el{' '}
            <a href="/reglamento" target="_blank" rel="noopener noreferrer" className="link-reg">Reglamento</a>,{' '}
            <a href="/terminos"   target="_blank" rel="noopener noreferrer" className="link-reg">Términos</a>,{' '}
            <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="link-reg">Privacidad</a>{' '}
            y{' '}
            <a href="/reembolsos" target="_blank" rel="noopener noreferrer" className="link-reg">Reembolsos</a>.
          </label>
        </div>

        {/* Switch mode hint */}
        {mode === 'login' ? (
          <div style={{ textAlign: 'center', marginTop: 10, fontSize: '0.73rem', color: '#8b949e' }}>
            ¿Primera vez?{' '}
            <button onClick={() => switchMode('register')} style={{ background: 'none', border: 'none', color: '#00ff88', cursor: 'pointer', fontWeight: 700, fontSize: '0.73rem', padding: 0 }}>
              Registrate aquí
            </button>
          </div>
        ) : (
          <div style={{ textAlign: 'center', marginTop: 10, fontSize: '0.73rem', color: '#8b949e' }}>
            ¿Ya tenés cuenta?{' '}
            <button onClick={() => switchMode('login')} style={{ background: 'none', border: 'none', color: '#00ff88', cursor: 'pointer', fontWeight: 700, fontSize: '0.73rem', padding: 0 }}>
              Iniciá sesión aquí
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function obtenerHardware() {
  if (typeof window === 'undefined') return {};
  return {
    ua:         navigator.userAgent,
    cores:      navigator.hardwareConcurrency ?? 'N/A',
    plataforma: navigator.platform,
    idioma:     navigator.language,
    resolucion: `${screen.width}x${screen.height}`,
    timezone:   Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

function GoogleSvg() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PHBhdGggZmlsbD0iI0VBNDMzNSIgZD0iTTI0IDkuNWMzLjU0IDAgNi43MSAxLjIyIDkuMjEgMy42bDYuODUtNi44NUMzNS45IDIuMzggMzAuNDcgMCAyNCAwIDE0LjYyIDAgNi41MSA1LjM4IDIuNTYgMTMuMjJsNy45OCA2LjE5QzEyLjQzIDEzLjcwIDE3Ljc0IDkuNSAyNCA5LjV6Ii8+PHBhdGggZmlsbD0iIzQyODVGNCIgZD0iTTQ2Ljk4IDI0LjU1YzAtMS41Ny0uMTUtMy4wOS0uMzgtNC41NUgyNHY5LjAyaDEyLjk4Yy0uNTggMi45Ni0yLjI2IDUuNDgtNC43OCA3LjE4bDcuNzMgNmM0LjUxLTQuMTggNy4wOS0xMC4zNiA3LjA5LTE3LjY1eiIvPjxwYXRoIGZpbGw9IiNGQkJDMDUiIGQ9Ik0xMC41MyAyOC41OWMtLjQ4LTEuNDUtLjc2LTIuOTktLjc2LTQuNTlzLjI3LTMuMTQuNzYtNC41OWwtNy45OC02LjE5QzYuNTEgNDIuNjIgMCAyMC4xMiAwIDI0YzAgMy44OC45MiA3LjU0IDIuNTYgMTAuNzhsNy45Ny02LjE5eiIvPjxwYXRoIGZpbGw9IiMzNEE4NTMiIGQ9Ik0yNCA0OGM2LjQ4IDAgMTEuOTMtMi4xMyAxNS44OS01LjgxbC03LjczLTZjLTIuMTUgMS40NS00LjkyIDIuMzAtOC4xNiAyLjMwLTYuMjYgMC0xMS41Ny00LjIyLTEzLjQ3LTkuOTFsLTcuOTggNi4xOUM2LjUxIDQyLjYyIDE0LjYyIDQ4IDI0IDQ4eiIvPjwvc3ZnPg=="
      width={18}
      alt="Google"
    />
  );
}

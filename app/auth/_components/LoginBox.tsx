'use client';

/**
 * LoginBox — Migración exacta del index.html original.
 * Preserva el mismo flujo: login/registro combinado, Google, Facebook,
 * recuperación de contraseña, checkbox de términos, verificación de email,
 * solicitud de plataforma_id si es usuario nuevo.
 */

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithPopup,
  fetchSignInMethodsForEmail,
  GoogleAuthProvider,
  FacebookAuthProvider,
  signOut,
  type AuthError,
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { getVisitorId } from '@/lib/fingerprint';
import LfaModal, { type LfaModalHandle } from '@/app/_components/LfaModal';
import type { Translations } from '@/app/_components/LangDropdown';
import type { RegionDetectionResult } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Providers (singleton)
// ─────────────────────────────────────────────────────────────────────────────
const googleProvider   = new GoogleAuthProvider();
const facebookProvider = new FacebookAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────
interface LoginBoxProps {
  t: Translations;
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────────────────────
export default function LoginBox({ t }: LoginBoxProps) {
  const router    = useRouter();
  const modalRef  = useRef<LfaModalHandle>(null);

  const [email,       setEmail]       = useState('');
  const [pass,        setPass]        = useState('');
  const [platId,      setPlatId]      = useState('');
  const [terms,       setTerms]       = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [loadingGoog, setLoadingGoog] = useState(false);
  const [loadingFb,   setLoadingFb]   = useState(false);

  // Estado modal recuperar contraseña
  const [showRecuperar,   setShowRecuperar]   = useState(false);
  const [emailRecuperar,  setEmailRecuperar]  = useState('');
  const [statusRecuperar, setStatusRecuperar] = useState('');

  // ── Helpers ───────────────────────────────────────────────────────────────
  const alerta = useCallback(
    (titulo: string, mensaje: string, tipo: 'info' | 'error' | 'exito' = 'info') =>
      modalRef.current!.mostrarAlerta(titulo, mensaje, tipo),
    [],
  );

  const pedirDato = useCallback(
    (titulo: string, mensaje: string) => modalRef.current!.pedirDato(titulo, mensaje),
    [],
  );

  // ── INGRESAR (email+pass — login o registro automático) ───────────────────
  const ingresar = useCallback(async () => {
    if (!terms) {
      await alerta('ATENCIÓN', 'Es obligatorio aceptar el Reglamento, Términos y Políticas marcando la casilla antes de entrar.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      await alerta('CORREO INVÁLIDO', '⛔ Seguridad LFA: El formato del correo electrónico no es válido.', 'error');
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
      await alerta('ESCUDO ANTI-VPN', '🚫 Hemos detectado el uso de una VPN o Proxy. Por favor, apagala para iniciar sesión.', 'error');
      return;
    }
    if (datosRed.isBanned) {
      setLoading(false);
      await alerta('ACCESO DENEGADO', '🚫 Tu IP ha sido bloqueada por violaciones al reglamento LFA. Contactá soporte si crees que es un error.', 'error');
      return;
    }

    const hw = obtenerHardware();
    const fingerprintId = await getVisitorId();

    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);

      if (!cred.user.emailVerified) {
        await alerta('CUENTA NO VERIFICADA', 'Tu correo aún no está verificado. Revisá tu bandeja de entrada o la carpeta de Spam.');
        await signOut(auth);
        setLoading(false);
        return;
      }

      let updateData: Record<string, unknown> = {
        ip_conexion: datosRed.country, hw_avanzado: hw,
        ip: datosRed.ip ?? '', pais_codigo: datosRed.country, terminos_aceptados: true,
        fingerprint_id: fingerprintId, last_login: new Date().toISOString(),
      };
      if (platId.trim()) updateData.plataforma_id = sanitizarInput(platId);
      await setDoc(doc(db, 'usuarios', cred.user.uid), updateData, { merge: true });

      await verificarDivision(cred.user.uid);

    } catch (err) {
      const error = err as AuthError;

      if (
        error.code === 'auth/user-not-found' ||
        error.code === 'auth/invalid-credential' ||
        error.code === 'auth/invalid-login-credentials'
      ) {
        // Usuario no existe → intentar registrar
        const regexFuerte = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
        if (!regexFuerte.test(pass)) {
          setLoading(false);
          await alerta(
            'CONTRASEÑA DÉBIL',
            '⛔ SEGURIDAD LFA: Para registrarte, tu contraseña debe tener mínimo 8 caracteres, incluir al menos 1 MAYÚSCULA, 1 número y 1 símbolo (ej: @, #, $).',
            'error',
          );
          return;
        }

        let id = sanitizarInput(platId);
        if (!id) {
          const result = await pedirDato(
            'ID OBLIGATORIO',
            '⚠️ REGLAMENTO LFA: Es <b>OBLIGATORIO</b> ingresar tu <b>EA ID</b> (FC26) o <b>Konami ID</b> (eFootball) para crear una cuenta nueva:',
          );
          if (!result?.trim()) {
            await alerta('REGISTRO CANCELADO', '❌ El ID es obligatorio para competir.', 'error');
            setLoading(false);
            return;
          }
          id = sanitizarInput(result);
          setPlatId(id);
        }

        try {
          const newCred = await createUserWithEmailAndPassword(auth, email, pass);
          await sendEmailVerification(newCred.user);
          await setDoc(doc(db, 'usuarios', newCred.user.uid), {
            nombre:             email.split('@')[0],
            email,
            number:             0,
            color_carta:        'black',
            plataforma_id:      id,
            titulos:            0,
            ip_conexion:        datosRed.country,
            ip:                 datosRed.ip ?? '',
            hw_avanzado:        hw,
            pais_codigo:        datosRed.country,
            region:             datosRed.region,
            terminos_aceptados: true,
          });
          await alerta(
            '¡CUENTA CREADA!',
            'Te enviamos un link a tu correo para verificarla. Hacé clic ahí antes de entrar.',
            'exito',
          );
          await signOut(auth);
        } catch (regErr) {
          const re = regErr as AuthError;
          if (re.code === 'auth/email-already-in-use') {
            await alerta('ERROR DE LOGIN', '⛔ Esta cuenta ya existe, pero la contraseña es incorrecta.', 'error');
          } else {
            await alerta('ERROR DE REGISTRO', re.message, 'error');
          }
        }
      } else {
        await alerta('ERROR', error.message, 'error');
      }
    }

    setLoading(false);
  }, [email, pass, platId, terms, alerta, pedirDato]); // eslint-disable-line

  // ── LOGIN GOOGLE ───────────────────────────────────────────────────────────
  const loginGoogle = useCallback(async () => {
    if (!terms) {
      await alerta('ATENCIÓN', 'Es obligatorio aceptar el Reglamento, Términos y Políticas marcando la casilla antes de entrar.');
      return;
    }
    setLoadingGoog(true);

    const datosRed = await analizarRed();
    if (datosRed.isVpn) {
      setLoadingGoog(false);
      await alerta('ESCUDO ANTI-VPN', '🚫 Hemos detectado el uso de una VPN o Proxy. Por favor, apagala para iniciar sesión.', 'error');
      return;
    }
    if (datosRed.isBanned) {
      setLoadingGoog(false);
      await alerta('ACCESO DENEGADO', '🚫 Tu IP ha sido bloqueada por violaciones al reglamento LFA. Contactá soporte si crees que es un error.', 'error');
      return;
    }

    const hw = obtenerHardware();
    const fingerprintId = await getVisitorId();

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const userRef = doc(db, 'usuarios', result.user.uid);
      const snap    = await getDoc(userRef);

      if (!snap.exists()) {
        let id = sanitizarInput(platId);
        if (!id) {
          const res = await pedirDato(
            'ID OBLIGATORIO',
            '⚠️ REGLAMENTO LFA: Es <b>OBLIGATORIO</b> ingresar tu <b>EA ID</b> (FC26) o <b>Konami ID</b> (eFootball) para completar el registro con Google:',
          );
          if (!res?.trim()) {
            await signOut(auth);
            await alerta('REGISTRO CANCELADO', '❌ El ID es obligatorio para competir.', 'error');
            setLoadingGoog(false);
            return;
          }
          id = sanitizarInput(res);
        }
        await setDoc(userRef, {
          nombre:             sanitizarInput(result.user.displayName ?? 'Jugador'),
          email:              result.user.email,
          number:             0,
          color_carta:        'black',
          titulos:            0,
          plataforma_id:      id,
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
        const upd: Record<string, unknown> = {
          ip_conexion: datosRed.country, hw_avanzado: hw,
          ip: datosRed.ip ?? '', pais_codigo: datosRed.country, terminos_aceptados: true,
          fingerprint_id: fingerprintId, last_login: new Date().toISOString(),
        };
        if (platId.trim()) upd.plataforma_id = sanitizarInput(platId);
        await setDoc(userRef, upd, { merge: true });
      }

      await verificarDivision(result.user.uid);
    } catch (err) {
      const e = err as AuthError;
      if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
        await alerta('ERROR', 'Error con Google: ' + e.message, 'error');
      }
    }

    setLoadingGoog(false);
  }, [terms, platId, alerta, pedirDato]); // eslint-disable-line

  // ── LOGIN FACEBOOK ─────────────────────────────────────────────────────────
  const loginFacebook = useCallback(async () => {
    if (!terms) {
      await alerta('ATENCIÓN', 'Es obligatorio aceptar el Reglamento, Términos y Políticas marcando la casilla antes de entrar.');
      return;
    }
    setLoadingFb(true);

    const datosRed = await analizarRed();
    if (datosRed.isVpn) {
      setLoadingFb(false);
      await alerta('ESCUDO ANTI-VPN', '🚫 Hemos detectado el uso de una VPN o Proxy. Por favor, apagala para iniciar sesión.', 'error');
      return;
    }
    if (datosRed.isBanned) {
      setLoadingFb(false);
      await alerta('ACCESO DENEGADO', '🚫 Tu IP ha sido bloqueada por violaciones al reglamento LFA. Contactá soporte si crees que es un error.', 'error');
      return;
    }

    const hw = obtenerHardware();
    const fingerprintId = await getVisitorId();

    try {
      const result  = await signInWithPopup(auth, facebookProvider);
      const userRef = doc(db, 'usuarios', result.user.uid);
      const snap    = await getDoc(userRef);

      if (!snap.exists()) {
        let id = sanitizarInput(platId);
        if (!id) {
          const res = await pedirDato(
            'ID OBLIGATORIO',
            '⚠️ REGLAMENTO LFA: Es <b>OBLIGATORIO</b> ingresar tu <b>EA ID</b> (FC26) o <b>Konami ID</b> (eFootball) para completar el registro con Facebook:',
          );
          if (!res?.trim()) {
            await signOut(auth);
            await alerta('REGISTRO CANCELADO', '❌ El ID es obligatorio para competir.', 'error');
            setLoadingFb(false);
            return;
          }
          id = sanitizarInput(res);
        }
        await setDoc(userRef, {
          nombre:             sanitizarInput(result.user.displayName ?? 'Jugador'),
          email:              result.user.email ?? '',
          number:             0,
          color_carta:        'black',
          titulos:            0,
          plataforma_id:      id,
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
        const upd: Record<string, unknown> = {
          ip_conexion: datosRed.country, hw_avanzado: hw,
          ip: datosRed.ip ?? '', pais_codigo: datosRed.country, terminos_aceptados: true,
          fingerprint_id: fingerprintId, last_login: new Date().toISOString(),
        };
        if (platId.trim()) upd.plataforma_id = sanitizarInput(platId);
        await setDoc(userRef, upd, { merge: true });
      }

      await verificarDivision(result.user.uid);
    } catch (err) {
      const e = err as AuthError & { customData?: { email?: string } };
      if (e.code === 'auth/account-exists-with-different-credential') {
        const email = e.customData?.email ?? '';
        let methods: string[] = [];
        try { methods = email ? await fetchSignInMethodsForEmail(auth, email) : []; } catch { /* ignore */ }
        const proveedor = methods.includes('google.com') ? 'Google' : methods[0] ?? 'otro proveedor';
        await alerta(
          'CUENTA YA REGISTRADA',
          `Este email ya está registrado con ${proveedor}. Iniciá sesión con ${proveedor} primero y tu cuenta de Facebook se vinculará automáticamente.`,
          'error',
        );
      } else if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
        await alerta('ERROR', 'Error con Facebook: ' + e.message, 'error');
      }
    }

    setLoadingFb(false);
  }, [terms, platId, alerta, pedirDato]); // eslint-disable-line

  // ── Verificar división + redirigir ────────────────────────────────────────
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

  // ── Recuperar contraseña ──────────────────────────────────────────────────
  const enviarEnlace = async () => {
    const emailSan = sanitizarInput(emailRecuperar);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailSan)) {
      setStatusRecuperar('❌ Por favor, ingresá un correo electrónico válido.');
      return;
    }
    setStatusRecuperar('⏳ Enviando solicitud...');
    try {
      await sendPasswordResetEmail(auth, emailSan);
      setStatusRecuperar('✅ ¡Enlace enviado! Revisá tu correo y tu carpeta de Spam.');
      setEmailRecuperar('');
    } catch (err) {
      const e = err as AuthError;
      if (e.code === 'auth/user-not-found') {
        setStatusRecuperar('❌ Ese correo no está registrado en LFA.');
      } else {
        setStatusRecuperar('❌ Error interno. Reintentá en unos minutos.');
      }
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <LfaModal ref={modalRef} />

      {/* ── Modal recuperar contraseña ─────────────────────── */}
      {showRecuperar && (
        <div
          className="fixed inset-0 z-[10000] flex justify-center items-center p-5"
          style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(5px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowRecuperar(false); setStatusRecuperar(''); } }}
        >
          <div
            className="relative bg-lfa-card rounded-2xl p-6 text-center w-full max-w-sm animate-fade-in"
            style={{ border: '1px solid #00ff88' }}
          >
            <button
              onClick={() => { setShowRecuperar(false); setStatusRecuperar(''); }}
              className="absolute top-4 right-5 text-lfa-text hover:text-white text-2xl leading-none bg-transparent border-none cursor-pointer transition-colors"
              aria-label="Cerrar"
            >
              &times;
            </button>
            <div style={{ color: '#00ff88', fontSize: '3rem', marginBottom: '12px' }}>🔓</div>
            <h3 className="title-orbitron text-white font-bold text-lg mb-2.5 mt-0 tracking-wide">
              RECUPERAR CONTRASEÑA
            </h3>
            <p className="text-[#ccc] text-sm leading-relaxed mb-5">
              Ingresá tu correo electrónico. Te enviaremos un enlace oficial de Firebase para crear una nueva clave.
            </p>
            <input
              type="email"
              value={emailRecuperar}
              onChange={(e) => setEmailRecuperar(e.target.value)}
              className="input-lfa text-center mb-4"
              placeholder="Ej: juancito@email.com"
              onKeyDown={(e) => { if (e.key === 'Enter') enviarEnlace(); }}
            />
            <button
              onClick={enviarEnlace}
              className="btn-lfa-primary"
            >
              ✉ ENVIAR ENLACE
            </button>
            {statusRecuperar && (
              <div
                className={`mt-4 text-sm font-bold ${statusRecuperar.startsWith('✅') ? 'text-lfa-neon' : 'text-lfa-danger'}`}
              >
                {statusRecuperar}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Login box (320px — mismo ancho del HTML original) ─ */}
      <div className="login-box w-full" style={{ maxWidth: '320px' }}>

        {/* Email */}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="caja-texto"
          placeholder={t.email}
          required
          disabled={loading}
        />

        {/* Password */}
        <input
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          className="caja-texto"
          placeholder={t.pass}
          required
          disabled={loading}
        />

        {/* Plataforma ID */}
        {t.obligatorio && (
          <div style={{ fontSize: '0.7rem', color: '#ffd700', marginBottom: '5px' }}>
            {t.obligatorio}
          </div>
        )}
        <input
          type="text"
          value={platId}
          onChange={(e) => setPlatId(e.target.value)}
          className="caja-texto"
          placeholder={t.id_jugador}
          disabled={loading}
        />

        {/* ¿Olvidaste contraseña? */}
        <span
          className="forgot-pass"
          onClick={() => {
            setEmailRecuperar(email);
            setStatusRecuperar('');
            setShowRecuperar(true);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setShowRecuperar(true)}
        >
          {t.olvide_pass}
        </span>

        {/* Botón principal */}
        <button
          className="btn-main"
          onClick={ingresar}
          disabled={loading}
        >
          {loading ? '🛡️ ESCANEANDO RED...' : t.btn_entrar}
        </button>

        {/* Divider */}
        <div className="divider">{t.o_accede}</div>

        {/* Google */}
        <button
          className="btn-main btn-google"
          onClick={loginGoogle}
          disabled={loadingGoog}
        >
          <GoogleSvg />
          <span>{loadingGoog ? '🛡️ ESCANEANDO RED...' : t.btn_google}</span>
        </button>

        {/* Facebook */}
        <button
          className="btn-main"
          style={{
            background: '#1877F2', color: 'white',
            display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px',
            fontFamily: 'Roboto, sans-serif', fontWeight: 'bold', marginTop: '10px',
          }}
          onClick={loginFacebook}
          disabled={loadingFb}
        >
          <FacebookSvgSmall />
          <span>{loadingFb ? '🛡️ ESCANEANDO RED...' : t.btn_facebook}</span>
        </button>

        {/* Checkbox términos */}
        <div className="terms">
          <input
            type="checkbox"
            id="chkTerms"
            checked={terms}
            onChange={(e) => setTerms(e.target.checked)}
          />
          <label htmlFor="chkTerms">
            Acepto el{' '}
            <a href="/reglamento" target="_blank" rel="noopener noreferrer" className="link-reg">Reglamento</a>,{' '}
            <a href="/terminos"   target="_blank" rel="noopener noreferrer" className="link-reg">Términos</a>,{' '}
            <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="link-reg">Privacidad</a>{' '}
            y{' '}
            <a href="/reembolsos" target="_blank" rel="noopener noreferrer" className="link-reg">Reembolsos</a>.
          </label>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hardware fingerprint (equivalente al original)
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// Iconos SVG (igual que el original, sin dependencias)
// ─────────────────────────────────────────────────────────────────────────────
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

function FacebookSvgSmall() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="white" aria-hidden="true">
      <path d="M22.675 0H1.325C.593 0 0 .593 0 1.326V22.67C0 23.407.593 24 1.325 24H12.82v-9.294H9.692v-3.622h3.128V8.413c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12V24h6.116c.73 0 1.323-.593 1.323-1.325V1.326C24 .593 23.407 0 22.675 0z"/>
    </svg>
  );
}

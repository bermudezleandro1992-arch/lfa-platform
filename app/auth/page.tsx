'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithPopup,
  GoogleAuthProvider,
  FacebookAuthProvider,
  AuthError,
} from 'firebase/auth';
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import LfaModal, { type LfaModalHandle } from '@/app/_components/LfaModal';
import type { Translations } from '@/app/_components/LangDropdown';
import type { RegionDetectionResult } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────
type Mode = 'login' | 'register';

interface PasswordStrength {
  hasMinLength: boolean;
  hasLetter:    boolean;
  hasNumber:    boolean;
  hasSymbol:    boolean;
  isValid:      boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────────────────────────────────────
function validatePassword(password: string): PasswordStrength {
  return {
    hasMinLength: password.length >= 8,
    hasLetter:    /[a-zA-Z]/.test(password),
    hasNumber:    /\d/.test(password),
    hasSymbol:    /[!@#$%^&*()\-_=+\[\]{};':"\\|,.<>/?`~]/.test(password),
    get isValid() {
      return this.hasMinLength && this.hasLetter && this.hasNumber && this.hasSymbol;
    },
  };
}

function mapFirebaseError(error: AuthError): string {
  const messages: Record<string, string> = {
    'auth/user-not-found':       'No existe una cuenta con ese email.',
    'auth/wrong-password':       'Contraseña incorrecta.',
    'auth/invalid-credential':   'Email o contraseña incorrectos.',
    'auth/email-already-in-use': 'Ese email ya está registrado.',
    'auth/weak-password':        'La contraseña es demasiado débil.',
    'auth/invalid-email':        'El formato del email no es válido.',
    'auth/too-many-requests':    'Demasiados intentos. Esperá unos minutos.',
    'auth/popup-closed-by-user': 'Cerraste la ventana de login. Intentá de nuevo.',
    'auth/cancelled-popup-request': '',
    'auth/network-request-failed': 'Sin conexión. Verificá tu red.',
    'auth/account-exists-with-different-credential':
      'Ya existe una cuenta con ese email usando otro método de login.',
  };
  return messages[error.code] ?? `Error: ${error.message}`;
}

async function detectRegion(): Promise<RegionDetectionResult> {
  try {
    const res = await fetch('/api/detect-region');
    if (!res.ok) throw new Error('fetch failed');
    return await res.json();
  } catch {
    return { region: 'GLOBAL', country: 'XX', countryName: 'Unknown', city: 'Unknown', isVpn: false };
  }
}

async function saveUserToFirestore(
  uid:      string,
  email:    string | null,
  name:     string,
  photo:    string | null,
  provider: 'email' | 'google' | 'facebook',
  geo:      RegionDetectionResult,
) {
  await setDoc(
    doc(db, 'usuarios', uid),
    {
      uid,
      email:       email ?? '',
      displayName: name,
      photoURL:    photo ?? null,
      region:      geo.region,
      country:     geo.country,
      countryName: geo.countryName,
      isVpn:       geo.isVpn,
      rol:         'jugador',
      provider,
      createdAt:   serverTimestamp(),
      updatedAt:   serverTimestamp(),
      stats: { torneos: 0, victorias: 0, puntos: 0 },
    },
    { merge: false },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Providers
// ─────────────────────────────────────────────────────────────────────────────
const googleProvider   = new GoogleAuthProvider();
const facebookProvider = new FacebookAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────
export default function AuthPage() {
  const router = useRouter();

  // ── Estado UI ──────────────────────────────────────────────
  const [mode,          setMode]          = useState<Mode>('login');
  const [showTerms,     setShowTerms]     = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState('');
  const [success,       setSuccess]       = useState('');

  // ── Estado de formulario ───────────────────────────────────
  const [email,           setEmail]           = useState('');
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName,     setDisplayName]     = useState('');
  const [showPass,        setShowPass]        = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  const strength = validatePassword(password);

  const clearMessages = () => { setError(''); setSuccess(''); };

  // ── Cambio de modo ─────────────────────────────────────────
  const handleSetMode = useCallback(
    (newMode: Mode) => {
      clearMessages();
      if (newMode === 'register' && !termsAccepted) {
        setShowTerms(true);
        return;
      }
      setMode(newMode);
    },
    [termsAccepted],
  );

  const handleTermsAccept = () => {
    setTermsAccepted(true);
    setShowTerms(false);
    setMode('register');
  };

  // ── Registro Email/Password ────────────────────────────────
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    if (!termsAccepted) { setShowTerms(true); return; }
    if (!displayName.trim()) { setError('Ingresá tu nombre de usuario.'); return; }
    if (!strength.isValid)   { setError('La contraseña no cumple los requisitos.'); return; }
    if (password !== confirmPassword) { setError('Las contraseñas no coinciden.'); return; }

    setLoading(true);
    try {
      const geo = await detectRegion();
      const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);

      await updateProfile(user, { displayName: displayName.trim() });
      await saveUserToFirestore(
        user.uid, user.email, displayName.trim(), null, 'email', geo,
      );

      setSuccess('¡Cuenta creada! Redirigiendo...');
      setTimeout(() => router.push('/hub'), 1500);
    } catch (err) {
      setError(mapFirebaseError(err as AuthError));
    } finally {
      setLoading(false);
    }
  };

  // ── Login Email/Password ───────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.push('/hub');
    } catch (err) {
      setError(mapFirebaseError(err as AuthError));
    } finally {
      setLoading(false);
    }
  };

  // ── Login Social (Google / Facebook) ──────────────────────
  const handleSocialLogin = useCallback(
    async (provider: 'google' | 'facebook') => {
      clearMessages();
      setLoading(true);
      try {
        const firebaseProvider = provider === 'google' ? googleProvider : facebookProvider;
        const { user } = await signInWithPopup(auth, firebaseProvider);

        // Verificar si el usuario ya existe en Firestore
        const userSnap = await getDoc(doc(db, 'usuarios', user.uid));
        if (!userSnap.exists()) {
          const geo = await detectRegion();
          await saveUserToFirestore(
            user.uid,
            user.email,
            user.displayName ?? 'Jugador LFA',
            user.photoURL,
            provider,
            geo,
          );
        }

        router.push('/hub');
      } catch (err) {
        const authErr = err as AuthError;
        if (authErr.code !== 'auth/cancelled-popup-request') {
          setError(mapFirebaseError(authErr));
        }
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────
  return (
    <>
      {/* Modal de Términos */}
      {showTerms && (
        <TermsModal
          onAccept={handleTermsAccept}
          onClose={() => setShowTerms(false)}
        />
      )}

      {/* Fondo con grid */}
      <main className="min-h-screen bg-lfa-grid-pattern flex flex-col items-center justify-center px-4 py-10">

        {/* ── Logo ─────────────────────────────────────────── */}
        <a href="/" className="flex flex-col items-center mb-8 group">
          <div
            className="border-2 border-lfa-neon rounded-2xl px-8 py-4 flex flex-col items-center
                       shadow-neon group-hover:shadow-neon-lg transition-shadow duration-300"
          >
            <span className="text-lfa-gold text-lg mb-1">♛</span>
            <span
              className="title-orbitron text-white font-black text-4xl tracking-widest leading-none"
              style={{ textShadow: '0 0 20px rgba(0,255,136,0.3)' }}
            >
              LFA
            </span>
            <span className="text-lfa-neon text-xs tracking-[0.5rem] mt-1">★ ★ ★</span>
          </div>
          <p className="text-lfa-text text-xs mt-3 title-orbitron tracking-wider">
            SOMOS<span className="text-lfa-neon font-bold">LFA</span>.COM
          </p>
        </a>

        {/* ── Card principal ────────────────────────────────── */}
        <div className="card-lfa w-full max-w-md shadow-2xl">

          {/* Tab switcher */}
          <div className="flex border-b border-lfa-border">
            <TabButton
              active={mode === 'login'}
              onClick={() => handleSetMode('login')}
            >
              Iniciar Sesión
            </TabButton>
            <TabButton
              active={mode === 'register'}
              onClick={() => handleSetMode('register')}
            >
              Registrarse
            </TabButton>
          </div>

          <div className="p-6 space-y-5">

            {/* ── Botones Sociales ──────────────────────────── */}
            <div className="space-y-3">
              <SocialButton
                onClick={() => handleSocialLogin('google')}
                disabled={loading}
                icon={<GoogleIcon />}
                label="Continuar con Google"
              />
              <SocialButton
                onClick={() => handleSocialLogin('facebook')}
                disabled={loading}
                icon={<FacebookIcon />}
                label="Continuar con Facebook"
              />
            </div>

            {/* Divisor */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-lfa-border" />
              <span className="text-lfa-text text-xs">O con email</span>
              <div className="flex-1 h-px bg-lfa-border" />
            </div>

            {/* ── Formulario ────────────────────────────────── */}
            <form
              onSubmit={mode === 'login' ? handleLogin : handleRegister}
              className="space-y-4"
              noValidate
            >
              {/* Username (solo en registro) */}
              {mode === 'register' && (
                <div className="animate-fade-in">
                  <label htmlFor="displayName" className="label-lfa">
                    Nombre de usuario
                  </label>
                  <input
                    id="displayName"
                    type="text"
                    autoComplete="username"
                    placeholder="Tu nombre en LFA"
                    value={displayName}
                    onChange={(e) => { setDisplayName(e.target.value); clearMessages(); }}
                    className="input-lfa"
                    maxLength={32}
                    required
                    disabled={loading}
                  />
                </div>
              )}

              {/* Email */}
              <div>
                <label htmlFor="email" className="label-lfa">Email</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="jugador@email.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); clearMessages(); }}
                  className="input-lfa"
                  required
                  disabled={loading}
                />
              </div>

              {/* Contraseña */}
              <div>
                <label htmlFor="password" className="label-lfa">Contraseña</label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPass ? 'text' : 'password'}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    placeholder={mode === 'login' ? '••••••••' : 'Mín. 8 chars, letras, números, símbolo'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); clearMessages(); }}
                    className="input-lfa pr-11"
                    required
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-lfa-text hover:text-lfa-neon transition-colors"
                    tabIndex={-1}
                    aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPass ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>

                {/* Indicadores de fortaleza (solo registro) */}
                {mode === 'register' && password.length > 0 && (
                  <div className="mt-2 space-y-1 animate-fade-in">
                    <StrengthBar strength={strength} />
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
                      <Criterion met={strength.hasMinLength} label="Mín. 8 caracteres" />
                      <Criterion met={strength.hasLetter}    label="Al menos una letra" />
                      <Criterion met={strength.hasNumber}    label="Al menos un número" />
                      <Criterion met={strength.hasSymbol}    label="Un símbolo (!@#...)" />
                    </div>
                  </div>
                )}
              </div>

              {/* Confirmar contraseña (solo registro) */}
              {mode === 'register' && (
                <div className="animate-fade-in">
                  <label htmlFor="confirmPassword" className="label-lfa">
                    Confirmar contraseña
                  </label>
                  <div className="relative">
                    <input
                      id="confirmPassword"
                      type={showConfirmPass ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Repetí tu contraseña"
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); clearMessages(); }}
                      className={`input-lfa pr-11 ${
                        confirmPassword.length > 0
                          ? password === confirmPassword
                            ? 'border-lfa-neon/60'
                            : 'border-lfa-danger/60'
                          : ''
                      }`}
                      required
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPass(!showConfirmPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-lfa-text hover:text-lfa-neon transition-colors"
                      tabIndex={-1}
                      aria-label={showConfirmPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    >
                      {showConfirmPass ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                  {confirmPassword.length > 0 && password !== confirmPassword && (
                    <p className="text-lfa-danger text-xs mt-1">Las contraseñas no coinciden.</p>
                  )}
                </div>
              )}

              {/* Link "¿Olvidaste tu contraseña?" */}
              {mode === 'login' && (
                <div className="text-right -mt-1">
                  <a
                    href="/auth/reset-password"
                    className="text-xs text-lfa-text hover:text-lfa-neon transition-colors"
                  >
                    ¿Olvidaste tu contraseña?
                  </a>
                </div>
              )}

              {/* Mensaje de error */}
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 p-3 rounded-xl border border-lfa-danger/40 bg-lfa-danger/10 text-lfa-danger text-sm animate-fade-in"
                >
                  <span className="mt-0.5 shrink-0">⚠</span>
                  <span>{error}</span>
                </div>
              )}

              {/* Mensaje de éxito */}
              {success && (
                <div
                  role="status"
                  className="flex items-center gap-2 p-3 rounded-xl border border-lfa-neon/40 bg-lfa-neon/10 text-lfa-neon text-sm animate-fade-in"
                >
                  <span>✓</span>
                  <span>{success}</span>
                </div>
              )}

              {/* Aviso registro: términos aceptados */}
              {mode === 'register' && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-lfa-neon/5 border border-lfa-neon/20">
                  <span className="text-lfa-neon text-sm">✓</span>
                  <p className="text-xs text-lfa-text">
                    Aceptaste los{' '}
                    <button
                      type="button"
                      onClick={() => setShowTerms(true)}
                      className="text-lfa-neon hover:underline"
                    >
                      Términos y Condiciones
                    </button>
                  </p>
                </div>
              )}

              {/* Botón submit */}
              <button
                type="submit"
                disabled={loading}
                className="btn-lfa-primary relative"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Spinner />
                    {mode === 'login' ? 'Iniciando...' : 'Creando cuenta...'}
                  </span>
                ) : mode === 'login' ? (
                  'Iniciar Sesión'
                ) : (
                  'Crear Cuenta'
                )}
              </button>
            </form>

            {/* Cambio de modo desde el footer */}
            <p className="text-center text-sm text-lfa-text">
              {mode === 'login' ? (
                <>
                  ¿No tenés cuenta?{' '}
                  <button
                    onClick={() => handleSetMode('register')}
                    className="text-lfa-neon font-semibold hover:underline"
                  >
                    Registrarse
                  </button>
                </>
              ) : (
                <>
                  ¿Ya tenés cuenta?{' '}
                  <button
                    onClick={() => handleSetMode('login')}
                    className="text-lfa-neon font-semibold hover:underline"
                  >
                    Iniciar Sesión
                  </button>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-8 text-lfa-text text-xs text-center">
          © 2026 SomosLFA · Gestión SM ·{' '}
          <a href="/privacidad" className="hover:text-lfa-neon transition-colors">
            Privacidad
          </a>
        </p>
      </main>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes de UI
// ─────────────────────────────────────────────────────────────────────────────

function TabButton({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active:   boolean;
  onClick:  () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-4 text-sm font-semibold title-orbitron tracking-wide transition-all duration-200
        ${active
          ? 'text-lfa-neon border-b-2 border-lfa-neon bg-lfa-neon/5'
          : 'text-lfa-text hover:text-lfa-light border-b-2 border-transparent'
        }`}
    >
      {children}
    </button>
  );
}

function SocialButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon:     React.ReactNode;
  label:    string;
  onClick:  () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl
                 border border-lfa-border bg-lfa-bg
                 hover:border-lfa-neon/40 hover:bg-lfa-neon/5
                 text-lfa-light text-sm font-medium
                 transition-all duration-200
                 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {icon}
      {label}
    </button>
  );
}

function Criterion({ met, label }: { met: boolean; label: string }) {
  return (
    <span className={`flex items-center gap-1.5 text-xs transition-colors ${met ? 'text-lfa-neon' : 'text-lfa-text'}`}>
      <span>{met ? '✓' : '○'}</span>
      {label}
    </span>
  );
}

function StrengthBar({ strength }: { strength: PasswordStrength }) {
  const score = [strength.hasMinLength, strength.hasLetter, strength.hasNumber, strength.hasSymbol]
    .filter(Boolean).length;

  const colors = ['bg-lfa-danger', 'bg-orange-500', 'bg-yellow-500', 'bg-lfa-neon'];
  const labels = ['Muy débil', 'Débil', 'Buena', 'Fuerte'];

  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
              i < score ? colors[score - 1] : 'bg-lfa-border'
            }`}
          />
        ))}
      </div>
      {score > 0 && (
        <p className={`text-xs ${colors[score - 1].replace('bg-', 'text-')}`}>
          {labels[score - 1]}
        </p>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ── Iconos SVG inline (sin dependencias externas) ────────────────────────────

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.2 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.2 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.7-.4-4z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.2 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.3-5.1C29.4 35.6 26.8 36 24 36c-5.2 0-9.6-2.8-11.3-7l-6.5 5C9.5 40.1 16.2 44 24 44z" />
      <path fill="#1565C0" d="M43.6 20H24v8h11.3c-0.8 2.2-2.3 4.1-4.3 5.4l6.3 5.1C41.4 35.1 44 29.9 44 24c0-1.3-.1-2.7-.4-4z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect width="48" height="48" rx="8" fill="#1877F2" />
      <path
        fill="white"
        d="M33 48V31h5.7l.8-6.6H33v-4.2c0-1.9.5-3.1 3.2-3.1H40V11.1c-.7-.1-2.9-.3-5.5-.3-5.4 0-9.1 3.3-9.1 9.4v5.2h-6V32h6v16h7.6z"
      />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M1 12S5 5 12 5s11 7 11 7-4 7-11 7S1 12 1 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M17.9 17.9A10.9 10.9 0 0 1 12 19C5 19 1 12 1 12a18.5 18.5 0 0 1 5.1-6.9M9.9 4.2A9.7 9.7 0 0 1 12 5c7 0 11 7 11 7a18.5 18.5 0 0 1-2.2 3.4M3 3l18 18" />
    </svg>
  );
}

'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

interface TermsModalProps {
  onAccept: () => void;
  onClose:  () => void;
}

export default function TermsModal({ onAccept, onClose }: TermsModalProps) {
  const scrollRef                           = useRef<HTMLDivElement>(null);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [accepted,         setAccepted]         = useState(false);
  const [scrollProgress,   setScrollProgress]   = useState(0);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const progress = Math.min(100, Math.round((scrollTop / (scrollHeight - clientHeight)) * 100));
    setScrollProgress(progress);
    if (scrollTop + clientHeight >= scrollHeight - 30) {
      setScrolledToBottom(true);
    }
  }, []);

  // Cierre con ESC
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Bloquea scroll del body mientras el modal está abierto
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="card-lfa w-full max-w-lg flex flex-col animate-fade-in"
        style={{ maxHeight: 'min(85vh, 640px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ──────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-lfa-border">
          <div>
            <h2
              className="text-white font-bold text-base title-orbitron"
              style={{ letterSpacing: '0.5px' }}
            >
              Términos y Condiciones
            </h2>
            <p className="text-lfa-text text-xs mt-0.5">SomosLFA — Liga de Fútbol Amateur</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-lfa-text hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* ── Barra de progreso de scroll ──────────────────────── */}
        <div className="h-0.5 bg-lfa-border">
          <div
            className="h-full bg-lfa-neon transition-all duration-150"
            style={{ width: `${scrollProgress}%` }}
          />
        </div>

        {/* ── Contenido scrolleable ────────────────────────────── */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-sm text-lfa-light leading-relaxed"
          style={{ overscrollBehavior: 'contain' }}
        >
          <p className="text-lfa-text text-xs">
            Última actualización: 18 de abril de 2026 · Versión 2.1
          </p>

          <Section title="1. Aceptación de los Términos">
            Al registrarte en SomosLFA («la Plataforma»), aceptás estos Términos y Condiciones en su
            totalidad. Si no estás de acuerdo con alguna cláusula, no debés crear una cuenta ni
            participar en ninguna actividad de la Plataforma.
          </Section>

          <Section title="2. Elegibilidad">
            Para registrarte debés tener al menos 13 años de edad. Si tenés entre 13 y 17 años,
            necesitás el consentimiento expreso de un padre, madre o tutor legal. SomosLFA se reserva
            el derecho de solicitar documentación que acredite la edad en cualquier momento.
          </Section>

          <Section title="3. Registro y Seguridad de la Cuenta">
            Sos responsable de mantener la confidencialidad de tu contraseña y de todas las
            actividades que ocurran bajo tu cuenta. Debés notificarnos de inmediato ante cualquier
            uso no autorizado. SomosLFA no se responsabiliza por pérdidas derivadas de accesos no
            autorizados a tu cuenta.
          </Section>

          <Section title="4. Normas de Conducta">
            Queda prohibido:
            <ul className="list-disc ml-4 mt-2 space-y-1 text-lfa-text">
              <li>Usar lenguaje ofensivo, racista, xenófobo o discriminatorio.</li>
              <li>Hacer trampa, utilizar hacks, glitches explotables o cualquier ventaja ilegítima.</li>
              <li>Suplantar la identidad de otro jugador u organización.</li>
              <li>Publicar contenido sexual, violento o que viole derechos de terceros.</li>
              <li>Realizar cualquier acción que perjudique la integridad de los torneos.</li>
            </ul>
            El incumplimiento puede resultar en suspensión temporal o ban permanente sin reembolso.
          </Section>

          <Section title="5. Torneos, Inscripciones y Premios">
            Las inscripciones a torneos con premio en dinero son definitivas. No se realizan
            reembolsos una vez iniciado el torneo, salvo cancelación por parte de SomosLFA. Los
            premios son abonados dentro de los 7 días hábiles posteriores a la validación del
            resultado, a través del método de pago indicado por el ganador. SomosLFA puede retener
            premios si detecta irregularidades hasta concluir la investigación.
          </Section>

          <Section title="6. Pagos y Facturación">
            Los pagos se procesan a través de Mercado Pago y otros procesadores habilitados. Los
            precios se muestran en la moneda de tu región. SomosLFA no almacena datos de tarjetas de
            crédito/débito — estos son gestionados exclusivamente por los procesadores de pago.
          </Section>

          <Section title="7. Detección de IP y Región">
            La Plataforma detecta tu dirección IP para asignarte automáticamente una región de juego
            (LATAM_SUR, LATAM_NORTE, AMERICA, GLOBAL). El uso de VPNs o proxies para alterar tu
            región asignada está prohibido y puede resultar en la descalificación de torneos y/o
            suspensión de cuenta.
          </Section>

          <Section title="8. Privacidad y Datos Personales">
            El tratamiento de tus datos personales se rige por nuestra{' '}
            <a
              href="/privacidad"
              target="_blank"
              rel="noopener noreferrer"
              className="text-lfa-neon hover:underline"
            >
              Política de Privacidad
            </a>
            . Recopilamos datos mínimos necesarios para el funcionamiento de la Plataforma y nunca los
            vendemos a terceros.
          </Section>

          <Section title="9. Propiedad Intelectual">
            Todo el contenido de SomosLFA — incluyendo nombre, logotipo, diseño y software — es
            propiedad exclusiva de Gestión SM. Queda prohibida su reproducción o distribución sin
            autorización expresa por escrito.
          </Section>

          <Section title="10. Limitación de Responsabilidad">
            SomosLFA no se hace responsable por interrupciones de servicio, pérdida de datos o daños
            indirectos que puedan surgir del uso de la Plataforma. La responsabilidad total de
            SomosLFA nunca excederá el monto abonado por el usuario en los últimos 30 días.
          </Section>

          <Section title="11. Modificaciones">
            Nos reservamos el derecho de modificar estos Términos en cualquier momento. Te
            notificaremos por email con al menos 7 días de anticipación ante cambios sustanciales.
            El uso continuado de la Plataforma tras la notificación implica la aceptación de los
            nuevos términos.
          </Section>

          <Section title="12. Ley Aplicable">
            Estos Términos se rigen por las leyes de la República Argentina. Cualquier disputa se
            someterá a la jurisdicción de los tribunales ordinarios de la Ciudad Autónoma de Buenos
            Aires.
          </Section>

          <Section title="13. Contacto">
            Para consultas relacionadas con estos Términos, escribinos a{' '}
            <a
              href="mailto:legal@somoslfa.com"
              className="text-lfa-neon hover:underline"
            >
              legal@somoslfa.com
            </a>
            .
          </Section>

          {/* Marcador de fin */}
          <div className="pt-4 border-t border-lfa-border">
            <p className="text-center text-lfa-neon text-xs font-bold title-orbitron tracking-widest">
              ★ FIN DEL DOCUMENTO ★
            </p>
          </div>
        </div>

        {/* ── Footer: indicador + checkbox + botones ───────────── */}
        <div className="px-6 py-4 border-t border-lfa-border space-y-4">
          {!scrolledToBottom && (
            <p className="flex items-center justify-center gap-2 text-lfa-text text-xs animate-pulse">
              <span>↓</span>
              <span>Scrolleá hasta el final del documento para continuar</span>
              <span className="ml-1 text-lfa-neon font-bold">{scrollProgress}%</span>
            </p>
          )}

          <label
            className={`flex items-start gap-3 cursor-pointer rounded-xl p-3 border transition-all ${
              scrolledToBottom
                ? 'border-lfa-border hover:border-lfa-neon/50 hover:bg-lfa-neon/5'
                : 'border-transparent opacity-35 pointer-events-none'
            }`}
          >
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              disabled={!scrolledToBottom}
              className="mt-0.5 w-4 h-4 accent-[#00ff88] cursor-pointer"
            />
            <span className="text-sm text-lfa-light leading-snug">
              He leído y acepto los{' '}
              <span className="text-lfa-neon font-semibold">Términos y Condiciones</span>{' '}
              de SomosLFA
            </span>
          </label>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-lfa-border text-lfa-text text-sm font-medium hover:bg-white/5 hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => { if (accepted) onAccept(); }}
              disabled={!accepted}
              className="flex-1 py-2.5 rounded-xl bg-lfa-neon text-black font-bold text-sm title-orbitron
                         disabled:opacity-30 disabled:cursor-not-allowed
                         hover:bg-[#00cc6a] transition-colors shadow-neon"
              style={{ letterSpacing: '0.5px' }}
            >
              Aceptar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componente: sección de términos
// ─────────────────────────────────────────────────────────────────────────────
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-white font-semibold text-sm mb-2 title-orbitron" style={{ fontSize: '0.8rem' }}>
        {title}
      </h3>
      <div className="text-lfa-light text-sm leading-relaxed">{children}</div>
    </div>
  );
}

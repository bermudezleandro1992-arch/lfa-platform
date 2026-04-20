'use client';

import {
  useState,
  useCallback,
  useRef,
  useImperativeHandle,
  forwardRef,
  useEffect,
} from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos públicos
// ─────────────────────────────────────────────────────────────────────────────
export type ModalType = 'info' | 'error' | 'exito';

export interface LfaModalHandle {
  /** Muestra un alert y resuelve con `true` cuando el usuario acepta */
  mostrarAlerta: (titulo: string, mensaje: string, tipo?: ModalType) => Promise<boolean>;
  /** Muestra un prompt y resuelve con el string ingresado, o `null` si canceló */
  pedirDato: (titulo: string, mensaje: string) => Promise<string | null>;
}

interface ModalState {
  open:      boolean;
  titulo:    string;
  mensaje:   string;
  tipo:      ModalType;
  showInput: boolean;
  showCancel: boolean;
}

const INITIAL: ModalState = {
  open: false, titulo: '', mensaje: '', tipo: 'info', showInput: false, showCancel: false,
};

// ─────────────────────────────────────────────────────────────────────────────
// Icono según tipo
// ─────────────────────────────────────────────────────────────────────────────
function ModalIcon({ tipo }: { tipo: ModalType }) {
  if (tipo === 'error')  return <span style={{ color: '#ff4757', fontSize: '3rem' }}>✕</span>;
  if (tipo === 'exito')  return <span style={{ color: '#00ff88', fontSize: '3rem' }}>✓</span>;
  return <span style={{ color: '#00ff88', fontSize: '3rem' }}>⚡</span>;
}

function borderColor(tipo: ModalType) {
  if (tipo === 'error')  return '#ff4757';
  return '#00ff88';
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────────────────────
const LfaModal = forwardRef<LfaModalHandle>((_, ref) => {
  const [state, setState]   = useState<ModalState>(INITIAL);
  const inputRef            = useRef<HTMLInputElement>(null);
  const resolverRef         = useRef<((val: boolean | string | null) => void) | null>(null);

  // Cierre con ESC
  useEffect(() => {
    if (!state.open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.open]);

  // Bloquea scroll del body
  useEffect(() => {
    document.body.style.overflow = state.open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [state.open]);

  const handleOk = () => {
    if (state.showInput) {
      const val = inputRef.current?.value.trim() ?? '';
      resolverRef.current?.(val);
    } else {
      resolverRef.current?.(true);
    }
    setState(INITIAL);
  };

  const handleCancel = () => {
    resolverRef.current?.(state.showInput ? null : false);
    setState(INITIAL);
  };

  useImperativeHandle(ref, () => ({
    mostrarAlerta(titulo, mensaje, tipo = 'info') {
      setState({ open: true, titulo, mensaje, tipo, showInput: false, showCancel: false });
      return new Promise<boolean>((resolve) => {
        resolverRef.current = resolve as (v: boolean | string | null) => void;
      });
    },
    pedirDato(titulo, mensaje) {
      setState({ open: true, titulo, mensaje, tipo: 'info', showInput: true, showCancel: true });
      return new Promise<string | null>((resolve) => {
        resolverRef.current = resolve as (v: boolean | string | null) => void;
      });
    },
  }));

  if (!state.open) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] flex justify-center items-center p-5"
      style={{
        background: 'rgba(0,0,0,0.92)',
        backdropFilter: 'blur(5px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) handleCancel(); }}
    >
      <div
        className="relative bg-lfa-card rounded-2xl p-6 text-center w-full max-w-sm
                   shadow-[0_10px_40px_rgba(0,0,0,0.5)] animate-fade-in"
        style={{ border: `1px solid ${borderColor(state.tipo)}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icono */}
        <div className="mb-4">
          <ModalIcon tipo={state.tipo} />
        </div>

        {/* Título */}
        <h3
          className="title-orbitron text-white font-bold text-lg mb-2.5 tracking-wide mt-0"
        >
          {state.titulo}
        </h3>

        {/* Mensaje */}
        <div
          className="text-[#ccc] text-sm leading-relaxed mb-5"
          // El mensaje puede tener HTML básico (negritas, links)
          dangerouslySetInnerHTML={{ __html: state.mensaje }}
        />

        {/* Input (solo en pedirDato) */}
        {state.showInput && (
          <input
            ref={inputRef}
            type="text"
            className="input-lfa text-center font-bold mb-4"
            placeholder="Ingresá tu ID..."
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleOk(); }}
          />
        )}

        {/* Botones */}
        <div className={`flex gap-2.5 ${state.showCancel ? '' : 'justify-center'}`}>
          {state.showCancel && (
            <button
              onClick={handleCancel}
              className="flex-1 py-3 px-4 rounded-xl border border-lfa-border text-white font-bold
                         title-orbitron text-sm hover:bg-white/10 transition-colors"
            >
              CANCELAR
            </button>
          )}
          <button
            onClick={handleOk}
            className={`py-3 px-4 rounded-xl bg-lfa-neon text-black font-bold
                        title-orbitron text-sm hover:bg-[#00cc6a] transition-colors shadow-neon
                        ${state.showCancel ? 'flex-1' : 'w-full max-w-[200px]'}`}
          >
            ACEPTAR
          </button>
        </div>
      </div>
    </div>
  );
});

LfaModal.displayName = 'LfaModal';
export default LfaModal;

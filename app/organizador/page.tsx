'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import dynamic from 'next/dynamic';
import Link from 'next/link';

const OrganizadorPanel = dynamic(
  () => import('@/app/_components/dashboard/OrganizadorPanel'),
  { ssr: false }
);

export default function OrganizadorPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'ok' | 'denied'>('loading');
  const [nombre, setNombre] = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.replace('/'); return; }
      try {
        const snap = await getDoc(doc(db, 'usuarios', user.uid));
        if (!snap.exists()) { router.replace('/hub'); return; }
        const data = snap.data();
        const rol = data.rol ?? '';
        // CEO also has access
        if (rol !== 'organizador' && user.uid !== '2bOrFxTAcPgFPoHKJHQfYxoQJpw1') {
          setStatus('denied');
          return;
        }
        setNombre(data.nombre || 'Organizador');
        setStatus('ok');
      } catch {
        router.replace('/hub');
      }
    });
    return unsub;
  }, [router]);

  if (status === 'loading') return (
    <div style={{ background: '#0b0e14', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 44, height: 44, border: '3px solid #a371f7', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (status === 'denied') return (
    <div style={{ background: '#0b0e14', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, color: 'white' }}>
      <div style={{ fontSize: '3rem' }}>🚫</div>
      <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#ff4757', fontSize: '1rem', fontWeight: 900 }}>ACCESO DENEGADO</div>
      <div style={{ color: '#8b949e', fontSize: '0.8rem' }}>Tu cuenta no tiene rol de organizador.</div>
      <Link href="/hub" style={{ color: '#a371f7', fontSize: '0.78rem', textDecoration: 'none' }}>← Volver al Hub</Link>
    </div>
  );

  return (
    <div style={{ background: '#0b0e14', minHeight: '100vh' }}>
      {/* NAV */}
      <header style={{
        background: 'rgba(7,9,13,0.97)', borderBottom: '1px solid #30363d',
        padding: '0 5%', display: 'flex', alignItems: 'stretch', gap: 0,
        position: 'sticky', top: 0, zIndex: 100, height: 48,
      }}>
        <Link href="/hub" style={{
          color: '#8b949e', textDecoration: 'none',
          fontFamily: "'Orbitron',sans-serif", fontSize: '0.68rem',
          display: 'flex', alignItems: 'center', paddingRight: 16,
        }}>← HUB</Link>
        <span style={{ color: '#30363d', display: 'flex', alignItems: 'center', paddingRight: 16 }}>|</span>
        <span style={{
          fontFamily: "'Orbitron',sans-serif", fontSize: '0.78rem',
          color: '#a371f7', fontWeight: 900, display: 'flex', alignItems: 'center',
        }}>🎙️ PANEL ORGANIZADOR</span>
        <div style={{ flex: 1 }} />
        <Link href="/dashboard" style={{
          color: '#8b949e', textDecoration: 'none',
          fontFamily: "'Orbitron',sans-serif", fontSize: '0.65rem',
          display: 'flex', alignItems: 'center',
          borderLeft: '1px solid #1c2028', paddingLeft: 16,
        }}>⚔️ DASHBOARD</Link>
        <Link href="/perfil" style={{
          color: '#8b949e', textDecoration: 'none',
          fontFamily: "'Orbitron',sans-serif", fontSize: '0.65rem',
          display: 'flex', alignItems: 'center',
          borderLeft: '1px solid #1c2028', paddingLeft: 16, paddingRight: 8,
        }}>👤 {nombre}</Link>
      </header>

      <OrganizadorPanel />
    </div>
  );
}

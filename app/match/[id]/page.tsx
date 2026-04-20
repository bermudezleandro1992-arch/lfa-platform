'use client';

import { useEffect, useState }   from 'react';
import { useRouter, useParams }  from 'next/navigation';
import { onAuthStateChanged }    from 'firebase/auth';
import { auth }                  from '@/lib/firebase';
import MatchRoom                 from '@/app/_components/dashboard/MatchRoom';
import Link                      from 'next/link';

export default function MatchPage() {
  const router    = useRouter();
  const params    = useParams();
  const matchId   = params?.id as string;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) { router.replace('/'); return; }
      setReady(true);
    });
    return unsub;
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400" />
      </div>
    );
  }

  return (
    <>
      <div style={{ background: '#0d1117', borderBottom: '1px solid #30363d', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 30, backdropFilter: 'blur(8px)' }}>
        <a href="/dashboard" style={{ color: '#8b949e', textDecoration: 'none', fontSize: '0.75rem', fontFamily: "'Orbitron',sans-serif", fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
          ← ARENA
        </a>
        <span style={{ color: '#30363d' }}>|</span>
        <span style={{ color: '#ffd700', fontFamily: "'Orbitron',sans-serif", fontSize: '0.75rem', fontWeight: 900, letterSpacing: 2 }}>
          ⚔️ SALA DE MATCH
        </span>
      </div>
      <MatchRoom matchId={matchId} />
    </>
  );
}

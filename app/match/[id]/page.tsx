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
      <div className="bg-gray-900/80 backdrop-blur border-b border-gray-800 px-4 py-2 flex items-center gap-3 sticky top-0 z-30">
        <Link href="/dashboard"
          className="text-xs font-semibold text-gray-400 hover:text-white transition flex items-center gap-1">
          ← ARENA
        </Link>
        <span className="text-gray-700">|</span>
        <span className="text-xs text-yellow-400 font-black tracking-widest">SALA DE MATCH</span>
      </div>
      <MatchRoom matchId={matchId} />
    </>
  );
}

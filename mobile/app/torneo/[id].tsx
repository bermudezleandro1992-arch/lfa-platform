import { useEffect, useState }               from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter }   from 'expo-router';
import {
  doc, onSnapshot, collection, query,
  where, getDocs, getIdToken,
} from 'firebase/firestore';
import { onAuthStateChanged }                from 'firebase/auth';
import { SafeAreaView }                      from 'react-native-safe-area-context';
import { auth, db }                          from '@/lib/firebase';
import { CLR, GL, ML, RL, TIER_CLR, WEB_URL } from '@/lib/constants';
import type { Room, TournamentMatch }         from '@/lib/types';

export default function TorneoDetail() {
  const { id }  = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();

  const [uid,     setUid]     = useState<string | null>(null);
  const [room,    setRoom]    = useState<Room | null>(null);
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUid(u?.uid ?? null));
    return unsub;
  }, []);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, 'tournaments', id), snap => {
      if (snap.exists()) setRoom({ id: snap.id, ...snap.data() } as Room);
      setLoading(false);
    });
    return unsub;
  }, [id]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const q    = query(collection(db, 'matches'), where('tournamentId', '==', id));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }) as TournamentMatch);
      list.sort((a, b) => (a.round ?? '').localeCompare(b.round ?? ''));
      setMatches(list);
    })();
  }, [id, room]);

  async function handleJoin() {
    if (!uid || !id) return;
    setJoining(true);
    try {
      const token = await getIdToken(auth.currentUser!);
      const res   = await fetch(`${WEB_URL}/api/joinTournament`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ tournamentId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      Alert.alert('✅ ¡Inscripto!', '¡Ya estás en la sala!');
    } catch (e: unknown) { Alert.alert('Error', (e as Error).message); }
    finally { setJoining(false); }
  }

  async function handleLeave() {
    if (!uid || !id) return;
    Alert.alert('¿Abandonar sala?', 'Se realizará el reembolso de la entrada.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Abandonar',
        style: 'destructive',
        onPress: async () => {
          setLeaving(true);
          try {
            const token = await getIdToken(auth.currentUser!);
            const res   = await fetch(`${WEB_URL}/api/leaveAndRefund`, {
              method:  'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body:    JSON.stringify({ tournamentId: id }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            Alert.alert('✅ Abandonaste la sala. Reembolso procesado.');
          } catch (e: unknown) { Alert.alert('Error', (e as Error).message); }
          finally { setLeaving(false); }
        },
      },
    ]);
  }

  if (loading || !room) {
    return <View style={{ flex:1, justifyContent:'center', alignItems:'center', backgroundColor: CLR.bg }}>
      <ActivityIndicator color={CLR.neon} size="large" />
    </View>;
  }

  const isIn   = room.players?.includes(uid ?? '') ?? false;
  const isFull = (room.players?.length ?? 0) >= (room.capacity ?? 0);
  const myMatch = matches.find(m => m.p1 === uid || m.p2 === uid);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>

        <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 12 }}>
          <Text style={{ color: CLR.neon }}>← VOLVER</Text>
        </TouchableOpacity>

        {/* Header */}
        <View style={s.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Text style={[s.tier, { color: TIER_CLR[room.tier] ?? CLR.muted }]}>{room.tier}</Text>
            <Text style={s.shortId}>#{room.id.slice(-8).toUpperCase()}</Text>
          </View>
          <Text style={s.game}>{GL[room.game] ?? room.game}</Text>
          <Text style={s.mode}>{ML[room.mode] ?? room.mode}</Text>
          <Text style={s.region}>{RL[room.region] ?? room.region}</Text>
        </View>

        {/* Info grid */}
        <View style={s.grid}>
          {[
            { l: 'ESTADO',    v: room.status,                    c: room.status==='OPEN'?CLR.neon:room.status==='ACTIVE'?CLR.gold:CLR.dim },
            { l: 'JUGADORES', v: `${room.players?.length??0}/${room.capacity}`, c: CLR.text },
            { l: 'ENTRADA',   v: room.entry_fee===0?'GRATIS':`🪙${room.entry_fee}`, c: CLR.gold },
            { l: 'PREMIO',    v: room.prize_pool?`🪙${room.prize_pool}`:'—',        c: CLR.gold },
          ].map(m => (
            <View key={m.l} style={s.gridCell}>
              <Text style={s.gridLabel}>{m.l}</Text>
              <Text style={[s.gridVal, { color: m.c }]}>{m.v}</Text>
            </View>
          ))}
        </View>

        {/* Mi match */}
        {myMatch && (
          <TouchableOpacity style={s.myMatch} onPress={() => router.push(`/match/${myMatch.id}`)}>
            <View>
              <Text style={s.myMatchLabel}>TU PARTIDO ACTIVO</Text>
              <Text style={s.myMatchVs}>{myMatch.p1_username ?? 'P1'} vs {myMatch.p2_username ?? 'P2'}</Text>
              <Text style={{ color: CLR.neon, fontSize: 11, marginTop: 2 }}>{myMatch.status}</Text>
            </View>
            <Text style={{ color: CLR.neon, fontSize: 22 }}>→</Text>
          </TouchableOpacity>
        )}

        {/* Acciones */}
        {room.status === 'OPEN' && (
          <View style={{ gap: 10, marginBottom: 16 }}>
            {!isIn && !isFull && (
              <TouchableOpacity style={[s.joinBtn, joining && { opacity: 0.6 }]} onPress={handleJoin} disabled={joining}>
                {joining ? <ActivityIndicator color="#000" /> : <Text style={s.joinBtnTxt}>⚡ UNIRSE A LA SALA</Text>}
              </TouchableOpacity>
            )}
            {isIn && (
              <TouchableOpacity style={s.leaveBtn} onPress={handleLeave} disabled={leaving}>
                {leaving ? <ActivityIndicator color={CLR.red} /> : <Text style={s.leaveBtnTxt}>🚪 Abandonar sala</Text>}
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Lista de partidos */}
        {matches.length > 0 && (
          <>
            <Text style={s.sectionTitle}>⚡ PARTIDOS</Text>
            {matches.map(m => {
              const stClr = m.status === 'WAITING' ? CLR.neon : m.status === 'PENDING_RESULT' ? CLR.gold : m.status === 'DISPUTE' ? CLR.red : m.status === 'FINISHED' ? CLR.dim : CLR.muted;
              const isMine = m.p1 === uid || m.p2 === uid;
              return (
                <TouchableOpacity key={m.id} style={[s.matchRow, isMine && { borderColor: `${CLR.neon}50` }]} onPress={() => router.push(`/match/${m.id}`)}>
                  <View style={[s.matchStatus, { backgroundColor: `${stClr}15` }]}>
                    <Text style={[s.matchStatusTxt, { color: stClr }]}>{m.status}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.matchVs}>{m.p1_username ?? m.p1.slice(0,8)} vs {m.p2_username ?? m.p2.slice(0,8)}</Text>
                    <Text style={s.matchRound}>{m.round ?? ''}</Text>
                  </View>
                  {m.score && <Text style={s.matchScore}>{m.score}</Text>}
                  <Text style={{ color: CLR.neon }}>→</Text>
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: CLR.bg },
  header:         { backgroundColor: CLR.card, borderRadius: 16, borderWidth: 1, borderColor: CLR.border, padding: 18, marginBottom: 14 },
  tier:           { fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  shortId:        { color: CLR.dim, fontSize: 11, fontFamily: 'monospace' },
  game:           { color: CLR.text, fontWeight: '900', fontSize: 22, marginBottom: 2 },
  mode:           { color: CLR.muted, fontSize: 14, marginBottom: 2 },
  region:         { color: CLR.dim, fontSize: 12 },
  grid:           { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  gridCell:       { flex: 1, minWidth: '44%', backgroundColor: CLR.card, borderRadius: 12, borderWidth: 1, borderColor: CLR.border, padding: 12 },
  gridLabel:      { color: CLR.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1, marginBottom: 4 },
  gridVal:        { fontWeight: '900', fontSize: 14 },
  myMatch:        { backgroundColor: 'rgba(0,255,136,0.06)', borderWidth: 1, borderColor: 'rgba(0,255,136,0.3)', borderRadius: 14, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  myMatchLabel:   { color: CLR.neon, fontSize: 9, fontWeight: '900', letterSpacing: 2, marginBottom: 3 },
  myMatchVs:      { color: CLR.text, fontWeight: '700', fontSize: 14 },
  joinBtn:        { backgroundColor: CLR.neon, borderRadius: 14, padding: 16, alignItems: 'center' },
  joinBtnTxt:     { color: '#000', fontWeight: '900', fontSize: 14, letterSpacing: 1 },
  leaveBtn:       { backgroundColor: 'rgba(255,71,87,0.1)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,71,87,0.3)', padding: 12, alignItems: 'center' },
  leaveBtnTxt:    { color: CLR.red, fontWeight: '700', fontSize: 13 },
  sectionTitle:   { color: CLR.muted, fontSize: 10, fontWeight: '900', letterSpacing: 2, marginBottom: 10 },
  matchRow:       { flexDirection: 'row', alignItems: 'center', backgroundColor: CLR.card, borderRadius: 12, borderWidth: 1, borderColor: CLR.border, padding: 12, marginBottom: 8, gap: 10 },
  matchStatus:    { borderRadius: 6, padding: 5 },
  matchStatusTxt: { fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  matchVs:        { color: CLR.text, fontWeight: '700', fontSize: 13, marginBottom: 2 },
  matchRound:     { color: CLR.dim, fontSize: 10 },
  matchScore:     { color: CLR.gold, fontWeight: '900', fontSize: 14 },
});

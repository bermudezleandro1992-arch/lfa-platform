import { useEffect, useState }                    from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter }                              from 'expo-router';
import { collection, query, where, onSnapshot, getIdToken } from 'firebase/firestore';
import { onAuthStateChanged }                    from 'firebase/auth';
import { SafeAreaView }                          from 'react-native-safe-area-context';
import { auth, db }                              from '@/lib/firebase';
import { CLR, GL, ML, RL, TIER_CLR }            from '@/lib/constants';
import { WEB_URL }                               from '@/lib/constants';
import type { Room }                             from '@/lib/types';

const STATUS_FILTERS = ['OPEN', 'ACTIVE', 'FINISHED'] as const;

export default function TorneosScreen() {
  const router   = useRouter();
  const [uid,    setUid]    = useState<string | null>(null);
  const [rooms,  setRooms]  = useState<Room[]>([]);
  const [filter, setFilter] = useState<'OPEN' | 'ACTIVE' | 'FINISHED'>('OPEN');
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUid(u?.uid ?? null));
    return unsub;
  }, []);

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'tournaments'), where('status', '==', filter));
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }) as Room);
      list.sort((a, b) => TIER_ORDER(b.tier) - TIER_ORDER(a.tier));
      setRooms(list);
      setLoading(false);
    });
    return unsub;
  }, [filter]);

  async function handleJoin(room: Room) {
    if (!uid) return Alert.alert('Error', 'Iniciá sesión primero.');
    if (room.players?.includes(uid)) return Alert.alert('Ya inscripto', 'Ya estás en esta sala.');
    setJoining(room.id);
    try {
      const token = await getIdToken(auth.currentUser!);
      const res   = await fetch(`${WEB_URL}/api/joinTournament`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ tournamentId: room.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error al unirse');
      Alert.alert('✅ ¡Inscripto!', '¡Ya estás en la sala! El torneo arrancará cuando se complete.');
    } catch (e: unknown) {
      Alert.alert('Error', (e as Error).message);
    } finally { setJoining(null); }
  }

  return (
    <SafeAreaView style={s.safe}>
      {/* Filtros */}
      <View style={s.filterRow}>
        {STATUS_FILTERS.map(f => (
          <TouchableOpacity key={f} style={[s.filterBtn, filter === f && s.filterActive]} onPress={() => setFilter(f)}>
            <Text style={[s.filterTxt, filter === f && s.filterTxtActive]}>
              {f === 'OPEN' ? '🟢 ABIERTAS' : f === 'ACTIVE' ? '🟡 ACTIVAS' : '⬛ FINALIZADAS'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={CLR.neon} size="large" />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => {}} tintColor={CLR.neon} />}
        >
          {rooms.length === 0 ? (
            <View style={s.empty}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>🎮</Text>
              <Text style={s.emptyTxt}>Sin salas {filter === 'OPEN' ? 'abiertas' : filter === 'ACTIVE' ? 'activas' : 'finalizadas'}</Text>
            </View>
          ) : rooms.map(room => {
            const isIn   = room.players?.includes(uid ?? '') ?? false;
            const isFull = (room.players?.length ?? 0) >= (room.capacity ?? 0);
            return (
              <TouchableOpacity key={room.id} style={s.roomCard} onPress={() => router.push(`/torneo/${room.id}`)}>
                {/* Header */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <Text style={[s.tierBadge, { color: TIER_CLR[room.tier] ?? CLR.muted }]}>{room.tier}</Text>
                    <Text style={{ color: CLR.dim, fontSize: 10 }}>#{room.id.slice(-6).toUpperCase()}</Text>
                  </View>
                  <Text style={s.fee}>{room.entry_fee === 0 ? '🆓 GRATIS' : `🪙 ${room.entry_fee}`}</Text>
                </View>

                <Text style={s.gameName}>{GL[room.game] ?? room.game}</Text>
                <Text style={s.modeName}>{ML[room.mode] ?? room.mode}</Text>
                <Text style={s.region}>{RL[room.region] ?? room.region}</Text>

                {/* Footer */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                  <View style={s.playersBar}>
                    <View style={[s.playersBarFill, { width: `${Math.min(((room.players?.length ?? 0) / (room.capacity ?? 1)) * 100, 100)}%` }]} />
                    <Text style={s.playersTxt}>{room.players?.length ?? 0}/{room.capacity} jugadores</Text>
                  </View>
                  {filter === 'OPEN' && !isIn && !isFull ? (
                    <TouchableOpacity
                      style={[s.joinBtn, joining === room.id && { opacity: 0.6 }]}
                      onPress={() => handleJoin(room)}
                      disabled={joining === room.id}
                    >
                      {joining === room.id
                        ? <ActivityIndicator color="#000" size="small" />
                        : <Text style={s.joinTxt}>UNIRSE</Text>
                      }
                    </TouchableOpacity>
                  ) : isIn ? (
                    <View style={s.inscriptoBadge}><Text style={s.inscriptoTxt}>✓ INSCRIPTO</Text></View>
                  ) : isFull ? (
                    <View style={s.fullBadge}><Text style={s.fullTxt}>LLENA</Text></View>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function TIER_ORDER(t?: string): number {
  return { FREE: 0, RECREATIVO: 1, COMPETITIVO: 2, ELITE: 3 }[t ?? ''] ?? 0;
}

const s = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: CLR.bg },
  filterRow:      { flexDirection: 'row', backgroundColor: CLR.card, borderBottomWidth: 1, borderBottomColor: CLR.border },
  filterBtn:      { flex: 1, paddingVertical: 12, alignItems: 'center' },
  filterActive:   { borderBottomWidth: 2, borderBottomColor: CLR.neon },
  filterTxt:      { color: CLR.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  filterTxtActive:{ color: CLR.neon },
  empty:          { alignItems: 'center', paddingTop: 80 },
  emptyTxt:       { color: CLR.muted, fontSize: 14 },
  roomCard:       { backgroundColor: CLR.card, borderWidth: 1, borderColor: CLR.border, borderRadius: 16, padding: 16, marginBottom: 12 },
  tierBadge:      { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  fee:            { color: CLR.gold, fontWeight: '900', fontSize: 13 },
  gameName:       { color: CLR.text, fontSize: 17, fontWeight: '900', marginBottom: 2 },
  modeName:       { color: CLR.muted, fontSize: 12, marginBottom: 2 },
  region:         { color: CLR.dim, fontSize: 11 },
  playersBar:     { flex: 1, backgroundColor: CLR.border, borderRadius: 4, height: 18, overflow: 'hidden', position: 'relative', justifyContent: 'center' },
  playersBarFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,255,136,0.25)' },
  playersTxt:     { color: CLR.text, fontSize: 10, fontWeight: '700', textAlign: 'center', zIndex: 1 },
  joinBtn:        { backgroundColor: CLR.neon, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, marginLeft: 10 },
  joinTxt:        { color: '#000', fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  inscriptoBadge: { backgroundColor: 'rgba(0,255,136,0.12)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, marginLeft: 10, borderWidth: 1, borderColor: 'rgba(0,255,136,0.3)' },
  inscriptoTxt:   { color: CLR.neon, fontSize: 10, fontWeight: '900' },
  fullBadge:      { backgroundColor: CLR.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, marginLeft: 10 },
  fullTxt:        { color: CLR.muted, fontSize: 10, fontWeight: '700' },
});

import { useEffect, useState }                          from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { useRouter }                                    from 'expo-router';
import { onAuthStateChanged }                           from 'firebase/auth';
import { collection, query, where, onSnapshot, limit, orderBy } from 'firebase/firestore';
import { SafeAreaView }                                 from 'react-native-safe-area-context';
import { auth, db }                                     from '@/lib/firebase';
import { CLR, GL, ML, TIER_CLR, STATUS_CLR }           from '@/lib/constants';
import type { Room, TournamentMatch, UserProfile }      from '@/lib/types';

export default function DashboardScreen() {
  const router = useRouter();
  const [user,         setUser]         = useState<UserProfile | null>(null);
  const [activeMatch,  setActiveMatch]  = useState<TournamentMatch | null>(null);
  const [openRooms,    setOpenRooms]    = useState<Room[]>([]);
  const [refreshing,   setRefreshing]   = useState(false);
  const [loadingUser,  setLoadingUser]  = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async fireUser => {
      if (!fireUser) { setLoadingUser(false); return; }
      const { doc, getDoc } = await import('firebase/firestore');
      const snap = await getDoc(doc(db, 'usuarios', fireUser.uid));
      setUser(snap.exists() ? { uid: fireUser.uid, ...snap.data() } as UserProfile : null);
      setLoadingUser(false);
    });
    return unsub;
  }, []);

  // Escuchar match activo del usuario
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'matches'),
      where('players', 'array-contains', user.uid),
      where('status', 'in', ['WAITING', 'PENDING_RESULT', 'DISPUTE']),
      limit(1),
    );
    const unsub = onSnapshot(q, snap => {
      setActiveMatch(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() } as TournamentMatch);
    });
    return unsub;
  }, [user?.uid]);

  // Salas abiertas
  useEffect(() => {
    const q = query(collection(db, 'tournaments'), where('status', '==', 'OPEN'), limit(10));
    const unsub = onSnapshot(q, snap => {
      setOpenRooms(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Room));
    });
    return unsub;
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  if (loadingUser) {
    return <View style={{ flex:1, justifyContent:'center', alignItems:'center', backgroundColor: CLR.bg }}>
      <ActivityIndicator color={CLR.neon} size="large" />
    </View>;
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CLR.neon} />}
      >
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.greeting}>¡Hola, {user?.nombre ?? 'Jugador'}! ⚡</Text>
            <Text style={s.subtitle}>Listo para competir</Text>
          </View>
          <View style={s.balancePill}>
            <Text style={s.balanceTxt}>🪙 {(user?.balance ?? 0).toLocaleString()}</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          {[
            { label: 'VICTORIAS', val: user?.victorias ?? 0, clr: CLR.neon },
            { label: 'TÍTULOS',   val: user?.titulos   ?? 0, clr: CLR.gold },
          ].map(k => (
            <View key={k.label} style={[s.statCard, { borderLeftColor: k.clr }]}>
              <Text style={[s.statVal, { color: k.clr }]}>{k.val}</Text>
              <Text style={s.statLabel}>{k.label}</Text>
            </View>
          ))}
        </View>

        {/* Match activo */}
        {activeMatch && (
          <TouchableOpacity style={s.activeMatch} onPress={() => router.push(`/match/${activeMatch.id}`)}>
            <View style={s.activeMatchDot} />
            <View style={{ flex: 1 }}>
              <Text style={s.activeMatchLabel}>PARTIDO EN CURSO</Text>
              <Text style={s.activeMatchVs}>
                {activeMatch.p1_username ?? 'P1'} vs {activeMatch.p2_username ?? 'P2'}
              </Text>
              <Text style={[s.activeMatchStatus, { color: STATUS_CLR[activeMatch.status] ?? CLR.muted }]}>
                {activeMatch.status}
              </Text>
            </View>
            <Text style={{ color: CLR.neon, fontSize: 20 }}>→</Text>
          </TouchableOpacity>
        )}

        {/* Salas disponibles */}
        <Text style={s.sectionTitle}>🎮 SALAS DISPONIBLES</Text>
        {openRooms.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyTxt}>Sin salas abiertas por ahora</Text>
          </View>
        ) : (
          openRooms.map(r => (
            <TouchableOpacity key={r.id} style={s.roomCard} onPress={() => router.push('/torneos')}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Text style={[s.tierBadge, { color: TIER_CLR[r.tier] ?? CLR.muted }]}>{r.tier}</Text>
                  <Text style={s.roomGame}>{GL[r.game] ?? r.game}</Text>
                </View>
                <Text style={s.roomMode}>{ML[r.mode] ?? r.mode}</Text>
                <Text style={s.roomRegion}>{r.region}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={s.roomPlayers}>{r.players?.length ?? 0}/{r.capacity}</Text>
                <Text style={s.roomFee}>{r.entry_fee === 0 ? '🆓 GRATIS' : `🪙${r.entry_fee}`}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}

        {/* Accesos rápidos */}
        <Text style={s.sectionTitle}>⚡ ACCESOS RÁPIDOS</Text>
        <View style={s.quickRow}>
          {[
            { icon: '🏆', label: 'Torneos',  route: '/torneos'         },
            { icon: '📊', label: 'Ranking',  route: '/ranking'         },
            { icon: '💳', label: 'Recargar', route: '/billetera'       },
            { icon: '🎫', label: 'Soporte',  route: '/tickets'         },
          ].map(q => (
            <TouchableOpacity key={q.label} style={s.quickBtn} onPress={() => router.push(q.route as never)}>
              <Text style={{ fontSize: 26 }}>{q.icon}</Text>
              <Text style={s.quickLabel}>{q.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:              { flex: 1, backgroundColor: CLR.bg },
  scroll:            { flex: 1, padding: 16 },
  header:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  greeting:          { color: CLR.text, fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  subtitle:          { color: CLR.muted, fontSize: 12, marginTop: 2 },
  balancePill:       { backgroundColor: 'rgba(255,215,0,0.12)', borderWidth: 1, borderColor: 'rgba(255,215,0,0.3)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  balanceTxt:        { color: CLR.gold, fontWeight: '900', fontSize: 13 },
  statsRow:          { flexDirection: 'row', gap: 12, marginBottom: 20 },
  statCard:          { flex: 1, backgroundColor: CLR.card, borderRadius: 12, borderWidth: 1, borderColor: CLR.border, borderLeftWidth: 3, padding: 14 },
  statVal:           { fontSize: 28, fontWeight: '900', marginBottom: 2 },
  statLabel:         { color: CLR.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  activeMatch:       { backgroundColor: 'rgba(0,255,136,0.06)', borderWidth: 1, borderColor: 'rgba(0,255,136,0.3)', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  activeMatchDot:    { width: 10, height: 10, borderRadius: 5, backgroundColor: CLR.neon },
  activeMatchLabel:  { color: CLR.neon, fontSize: 10, fontWeight: '900', letterSpacing: 1, marginBottom: 2 },
  activeMatchVs:     { color: CLR.text, fontSize: 15, fontWeight: '700', marginBottom: 2 },
  activeMatchStatus: { fontSize: 11, fontWeight: '700' },
  sectionTitle:      { color: CLR.muted, fontSize: 11, fontWeight: '900', letterSpacing: 2, marginBottom: 10 },
  emptyCard:         { backgroundColor: CLR.card, borderRadius: 12, padding: 20, alignItems: 'center', marginBottom: 20 },
  emptyTxt:          { color: CLR.muted, fontSize: 13 },
  roomCard:          { backgroundColor: CLR.card, borderWidth: 1, borderColor: CLR.border, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  tierBadge:         { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  roomGame:          { color: CLR.text, fontSize: 13, fontWeight: '700' },
  roomMode:          { color: CLR.muted, fontSize: 11, marginBottom: 2 },
  roomRegion:        { color: CLR.dim, fontSize: 10 },
  roomPlayers:       { color: CLR.text, fontSize: 13, fontWeight: '700' },
  roomFee:           { color: CLR.gold, fontSize: 11, fontWeight: '700' },
  quickRow:          { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  quickBtn:          { flex: 1, minWidth: '44%', backgroundColor: CLR.card, borderWidth: 1, borderColor: CLR.border, borderRadius: 14, padding: 16, alignItems: 'center', gap: 6 },
  quickLabel:        { color: CLR.text, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
});

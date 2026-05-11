import { useEffect, useState }                   from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  ActivityIndicator, RefreshControl, TouchableOpacity, Linking,
} from 'react-native';
import {
  collection, query, where, onSnapshot, doc, getDoc, orderBy, limit,
} from 'firebase/firestore';
import { onAuthStateChanged }                    from 'firebase/auth';
import { SafeAreaView }                          from 'react-native-safe-area-context';
import { auth, db }                              from '@/lib/firebase';
import { CLR, WEB_URL }                          from '@/lib/constants';
import type { UserProfile, Transaction }         from '@/lib/types';

export default function BilleteraScreen() {
  const [user,    setUser]    = useState<UserProfile | null>(null);
  const [txs,     setTxs]     = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async fireUser => {
      if (!fireUser) return;
      const snap = await getDoc(doc(db, 'usuarios', fireUser.uid));
      setUser(snap.exists() ? { uid: fireUser.uid, ...snap.data() } as UserProfile : null);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'transacciones'),
      where('uid', '==', user.uid),
      orderBy('timestamp', 'desc'),
      limit(30),
    );
    const unsub = onSnapshot(q, snap => {
      setTxs(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Transaction));
      setLoading(false);
    });
    return unsub;
  }, [user?.uid]);

  const TYPE_CLR: Record<string, string> = {
    deposit:  CLR.neon,
    withdraw: CLR.red,
    win:      CLR.gold,
    fee:      CLR.red,
    refund:   CLR.blue,
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => {}} tintColor={CLR.neon} />}
      >
        {/* Balance card */}
        <View style={s.balanceCard}>
          <Text style={s.balanceLabel}>SALDO DISPONIBLE</Text>
          <Text style={s.balanceAmount}>
            🪙 {(user?.balance ?? 0).toLocaleString()}
          </Text>
          <Text style={s.balanceSubtitle}>LFA Coins</Text>
        </View>

        {/* Acciones */}
        <View style={s.actionsRow}>
          <TouchableOpacity
            style={s.actionBtn}
            onPress={() => Linking.openURL(`${WEB_URL}/recargar`)}
          >
            <Text style={{ fontSize: 28, marginBottom: 6 }}>💳</Text>
            <Text style={s.actionTxt}>RECARGAR</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.actionBtn}
            onPress={() => Linking.openURL(`${WEB_URL}/billetera`)}
          >
            <Text style={{ fontSize: 28, marginBottom: 6 }}>🏧</Text>
            <Text style={s.actionTxt}>RETIRAR</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.actionBtn}
            onPress={() => Linking.openURL(`${WEB_URL}/reembolsos`)}
          >
            <Text style={{ fontSize: 28, marginBottom: 6 }}>↩️</Text>
            <Text style={s.actionTxt}>REEMBOLSOS</Text>
          </TouchableOpacity>
        </View>

        {/* Info */}
        <View style={s.infoCard}>
          <Text style={s.infoTxt}>ℹ️ Las recargas se procesan vía Binance (USDT). Para retiros, accedé desde la web.</Text>
        </View>

        {/* Historial */}
        <Text style={s.sectionTitle}>📋 HISTORIAL</Text>
        {loading ? (
          <ActivityIndicator color={CLR.neon} style={{ marginTop: 30 }} />
        ) : txs.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyTxt}>Sin transacciones aún</Text>
          </View>
        ) : txs.map(tx => {
          const clr    = TYPE_CLR[tx.type] ?? CLR.muted;
          const isPos  = ['deposit', 'win', 'refund'].includes(tx.type);
          return (
            <View key={tx.id} style={s.txRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.txDesc}>{tx.description}</Text>
                <Text style={s.txType}>{tx.type?.toUpperCase()}</Text>
              </View>
              <Text style={[s.txAmount, { color: clr }]}>
                {isPos ? '+' : '-'}{Math.abs(tx.amount).toLocaleString()}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: CLR.bg },
  balanceCard:    { backgroundColor: 'rgba(0,255,136,0.06)', borderWidth: 1, borderColor: 'rgba(0,255,136,0.2)', borderRadius: 20, padding: 28, alignItems: 'center', marginBottom: 20 },
  balanceLabel:   { color: CLR.muted, fontSize: 10, fontWeight: '900', letterSpacing: 2, marginBottom: 8 },
  balanceAmount:  { color: CLR.text, fontSize: 40, fontWeight: '900', letterSpacing: 2, marginBottom: 4 },
  balanceSubtitle:{ color: CLR.neon, fontSize: 12, fontWeight: '700' },
  actionsRow:     { flexDirection: 'row', gap: 10, marginBottom: 16 },
  actionBtn:      { flex: 1, backgroundColor: CLR.card, borderWidth: 1, borderColor: CLR.border, borderRadius: 16, padding: 18, alignItems: 'center' },
  actionTxt:      { color: CLR.text, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  infoCard:       { backgroundColor: 'rgba(0,195,255,0.06)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,195,255,0.2)', padding: 14, marginBottom: 20 },
  infoTxt:        { color: CLR.blue, fontSize: 12, lineHeight: 18 },
  sectionTitle:   { color: CLR.muted, fontSize: 10, fontWeight: '900', letterSpacing: 2, marginBottom: 10 },
  empty:          { alignItems: 'center', paddingTop: 40 },
  emptyTxt:       { color: CLR.muted, fontSize: 13 },
  txRow:          { flexDirection: 'row', alignItems: 'center', backgroundColor: CLR.card, borderRadius: 12, borderWidth: 1, borderColor: CLR.border, padding: 14, marginBottom: 8 },
  txDesc:         { color: CLR.text, fontSize: 13, fontWeight: '600', marginBottom: 2 },
  txType:         { color: CLR.dim, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  txAmount:       { fontWeight: '900', fontSize: 16 },
});

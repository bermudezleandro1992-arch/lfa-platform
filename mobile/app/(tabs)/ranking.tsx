import { useEffect, useState }                 from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { collection, query, getDocs, orderBy, limit } from 'firebase/firestore';
import { SafeAreaView }                          from 'react-native-safe-area-context';
import { db }                                    from '@/lib/firebase';
import { CLR, RL }                               from '@/lib/constants';
import type { RankingEntry }                     from '@/lib/types';

const TABS = ['victorias', 'titulos'] as const;
type RankTab = typeof TABS[number];

export default function RankingScreen() {
  const [tab,     setTab]     = useState<RankTab>('victorias');
  const [data,    setData]    = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    (async () => {
      const q = query(collection(db, 'usuarios'), orderBy(tab, 'desc'), limit(50));
      const snap = await getDocs(q);
      setData(snap.docs.map(d => ({ uid: d.id, ...d.data() }) as RankingEntry));
      setLoading(false);
    })();
  }, [tab]);

  return (
    <SafeAreaView style={s.safe}>
      {/* Tabs */}
      <View style={s.tabs}>
        {TABS.map(t => (
          <TouchableOpacity key={t} style={[s.tab, tab === t && s.tabActive]} onPress={() => setTab(t)}>
            <Text style={[s.tabTxt, tab === t && s.tabTxtActive]}>
              {t === 'victorias' ? '⚔️ VICTORIAS' : '🏆 TÍTULOS'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={CLR.neon} size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
          {data.map((p, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
            return (
              <View key={p.uid} style={[s.row, i < 3 && s.rowTop]}>
                <Text style={[s.pos, i < 3 && { fontSize: 22 }]}>{medal ?? `#${i + 1}`}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{p.nombre ?? '—'}</Text>
                  <Text style={s.region}>{RL[p.region ?? ''] ?? p.region ?? '—'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[s.val, i === 0 && { color: CLR.gold }]}>{(p[tab] ?? 0)}</Text>
                  <Text style={s.valLabel}>{tab === 'victorias' ? 'WINS' : 'TÍTULOS'}</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: CLR.bg },
  tabs:        { flexDirection: 'row', backgroundColor: CLR.card, borderBottomWidth: 1, borderBottomColor: CLR.border },
  tab:         { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabActive:   { borderBottomWidth: 2, borderBottomColor: CLR.neon },
  tabTxt:      { color: CLR.muted, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  tabTxtActive:{ color: CLR.neon },
  row:         { flexDirection: 'row', alignItems: 'center', backgroundColor: CLR.card, borderRadius: 12, borderWidth: 1, borderColor: CLR.border, padding: 14, marginBottom: 8, gap: 12 },
  rowTop:      { borderColor: 'rgba(255,215,0,0.3)', backgroundColor: 'rgba(255,215,0,0.04)' },
  pos:         { color: CLR.muted, fontWeight: '900', fontSize: 15, width: 34, textAlign: 'center' },
  name:        { color: CLR.text, fontWeight: '700', fontSize: 14, marginBottom: 2 },
  region:      { color: CLR.dim, fontSize: 11 },
  val:         { color: CLR.neon, fontWeight: '900', fontSize: 20 },
  valLabel:    { color: CLR.dim, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
});

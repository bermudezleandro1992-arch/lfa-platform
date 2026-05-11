import { useEffect, useState }                         from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Modal, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter }                                   from 'expo-router';
import {
  collection, query, where, onSnapshot, addDoc,
  serverTimestamp, orderBy,
} from 'firebase/firestore';
import { onAuthStateChanged }                          from 'firebase/auth';
import { SafeAreaView }                                from 'react-native-safe-area-context';
import { auth, db }                                    from '@/lib/firebase';
import {
  CLR, TICKET_CATS, TICKET_STATUS_CLR,
} from '@/lib/constants';
import type { Ticket, UserProfile }                    from '@/lib/types';

export default function TicketsScreen() {
  const router  = useRouter();
  const [user,      setUser]      = useState<UserProfile | null>(null);
  const [tickets,   setTickets]   = useState<Ticket[]>([]);
  const [creating,  setCreating]  = useState(false);
  const [loading,   setLoading]   = useState(true);

  // Formulario nuevo ticket
  const [showForm,   setShowForm]   = useState(false);
  const [category,   setCategory]   = useState<string>('DISPUTA');
  const [subject,    setSubject]    = useState('');
  const [firstMsg,   setFirstMsg]   = useState('');
  const [matchId,    setMatchId]    = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async fireUser => {
      if (!fireUser) return;
      const { doc, getDoc } = await import('firebase/firestore');
      const snap = await getDoc(doc(db, 'usuarios', fireUser.uid));
      setUser(snap.exists() ? { uid: fireUser.uid, ...snap.data() } as UserProfile : { uid: fireUser.uid });
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    let q;
    // Staff y CEO ven todos; jugador ve los suyos
    const isStaff = user.rol === 'mod' || user.rol === 'soporte' || user.rol === 'ceo';
    if (isStaff) {
      q = query(collection(db, 'tickets'), orderBy('updated_at', 'desc'));
    } else {
      q = query(collection(db, 'tickets'), where('userId', '==', user.uid), orderBy('updated_at', 'desc'));
    }
    const unsub = onSnapshot(q, snap => {
      setTickets(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Ticket));
      setLoading(false);
    });
    return unsub;
  }, [user?.uid, user?.rol]);

  async function handleCreateTicket() {
    if (!subject.trim() || !firstMsg.trim()) {
      return Alert.alert('Error', 'Completá el asunto y describí tu problema.');
    }
    if (!user) return;
    setCreating(true);
    try {
      const ticketRef = await addDoc(collection(db, 'tickets'), {
        userId:      user.uid,
        username:    user.nombre ?? 'Jugador',
        category,
        subject:     subject.trim(),
        status:      'OPEN',
        priority:    category === 'DISPUTA' ? 'ALTA' : 'NORMAL',
        matchId:     matchId.trim() || null,
        created_at:  serverTimestamp(),
        updated_at:  serverTimestamp(),
        lastMsg:     firstMsg.trim().slice(0, 80),
        unreadStaff: 1,
        unreadUser:  0,
      });
      // Primer mensaje
      await addDoc(collection(db, 'ticket_chat'), {
        ticketId:  ticketRef.id,
        uid:       user.uid,
        nombre:    user.nombre ?? 'Jugador',
        texto:     firstMsg.trim(),
        isStaff:   false,
        timestamp: serverTimestamp(),
      });
      setShowForm(false);
      setSubject('');
      setFirstMsg('');
      setMatchId('');
      Alert.alert('✅ Ticket creado', 'Un miembro del staff te responderá pronto.');
      router.push(`/ticket/${ticketRef.id}`);
    } catch (e: unknown) {
      Alert.alert('Error', (e as Error).message);
    } finally { setCreating(false); }
  }

  const isStaff = user?.rol === 'mod' || user?.rol === 'soporte' || user?.rol === 'ceo';

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => {}} tintColor={CLR.neon} />}
      >
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.title}>🎫 SOPORTE</Text>
            <Text style={s.subtitle}>{isStaff ? 'Panel de Staff' : 'Mis tickets de soporte'}</Text>
          </View>
          {!isStaff && (
            <TouchableOpacity style={s.newBtn} onPress={() => setShowForm(true)}>
              <Text style={s.newBtnTxt}>+ NUEVO</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Stats staff */}
        {isStaff && (
          <View style={s.statsRow}>
            {[
              { label: 'ABIERTOS',     val: tickets.filter(t => t.status === 'OPEN').length,        clr: CLR.neon  },
              { label: 'EN PROCESO',   val: tickets.filter(t => t.status === 'IN_PROGRESS').length, clr: CLR.gold  },
              { label: 'RESUELTOS',    val: tickets.filter(t => t.status === 'RESOLVED').length,    clr: CLR.blue  },
            ].map(k => (
              <View key={k.label} style={[s.statCard, { borderLeftColor: k.clr }]}>
                <Text style={[s.statVal, { color: k.clr }]}>{k.val}</Text>
                <Text style={s.statLabel}>{k.label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Lista */}
        {loading ? (
          <ActivityIndicator color={CLR.neon} size="large" style={{ marginTop: 60 }} />
        ) : tickets.length === 0 ? (
          <View style={s.empty}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>🎫</Text>
            <Text style={s.emptyTitle}>{isStaff ? 'Sin tickets pendientes' : 'Sin tickets abiertos'}</Text>
            {!isStaff && <Text style={s.emptySubtitle}>¿Tenés un problema? Abrí un ticket y el staff te ayuda.</Text>}
            {!isStaff && (
              <TouchableOpacity style={[s.newBtn, { marginTop: 20 }]} onPress={() => setShowForm(true)}>
                <Text style={s.newBtnTxt}>+ ABRIR TICKET</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          tickets.map(t => {
            const catInfo  = TICKET_CATS.find(c => c.value === t.category);
            const stClr    = TICKET_STATUS_CLR[t.status] ?? CLR.muted;
            const hasUnread = isStaff ? (t.unreadStaff ?? 0) > 0 : (t.unreadUser ?? 0) > 0;
            return (
              <TouchableOpacity key={t.id} style={s.ticketCard} onPress={() => router.push(`/ticket/${t.id}`)}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <View style={[s.statusPill, { backgroundColor: `${stClr}15`, borderColor: `${stClr}40` }]}>
                        <Text style={[s.statusTxt, { color: stClr }]}>{t.status}</Text>
                      </View>
                      {t.priority === 'URGENTE' && (
                        <View style={s.urgentPill}><Text style={s.urgentTxt}>🚨 URGENTE</Text></View>
                      )}
                      {t.priority === 'ALTA' && (
                        <View style={s.altaPill}><Text style={s.altaTxt}>⚠️ ALTA</Text></View>
                      )}
                    </View>
                    <Text style={s.ticketSubject} numberOfLines={1}>{t.subject}</Text>
                    <Text style={s.ticketCat}>{catInfo?.label ?? t.category}</Text>
                    {isStaff && <Text style={s.ticketUser}>👤 {t.username}</Text>}
                    {t.lastMsg && <Text style={s.ticketLastMsg} numberOfLines={1}>💬 {t.lastMsg}</Text>}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    {hasUnread && (
                      <View style={s.unreadDot} />
                    )}
                    <Text style={{ color: CLR.neon, fontSize: 18 }}>→</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Modal: Nuevo ticket */}
      <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>🎫 NUEVO TICKET</Text>

            {/* Categoría */}
            <Text style={s.fieldLabel}>CATEGORÍA</Text>
            <View style={s.catRow}>
              {TICKET_CATS.map(c => (
                <TouchableOpacity
                  key={c.value}
                  style={[s.catBtn, category === c.value && { backgroundColor: `${c.color}20`, borderColor: c.color }]}
                  onPress={() => setCategory(c.value)}
                >
                  <Text style={[s.catTxt, category === c.value && { color: c.color }]}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Asunto */}
            <Text style={s.fieldLabel}>ASUNTO</Text>
            <TextInput
              style={s.input}
              placeholder="Resumí tu problema en una línea"
              placeholderTextColor={CLR.muted}
              value={subject}
              onChangeText={setSubject}
              maxLength={100}
            />

            {/* Match ID (opcional) */}
            {category === 'DISPUTA' && (
              <>
                <Text style={s.fieldLabel}>ID DE MATCH (opcional)</Text>
                <TextInput
                  style={s.input}
                  placeholder="matchId del partido en disputa"
                  placeholderTextColor={CLR.muted}
                  value={matchId}
                  onChangeText={setMatchId}
                  autoCapitalize="none"
                />
              </>
            )}

            {/* Descripción */}
            <Text style={s.fieldLabel}>DESCRIPCIÓN</Text>
            <TextInput
              style={[s.input, { height: 100, textAlignVertical: 'top' }]}
              placeholder="Describí en detalle qué ocurrió..."
              placeholderTextColor={CLR.muted}
              value={firstMsg}
              onChangeText={setFirstMsg}
              multiline
              maxLength={500}
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowForm(false)}>
                <Text style={s.cancelTxt}>CANCELAR</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.submitBtn, creating && { opacity: 0.6 }]}
                onPress={handleCreateTicket}
                disabled={creating}
              >
                {creating
                  ? <ActivityIndicator color="#000" size="small" />
                  : <Text style={s.submitTxt}>ENVIAR TICKET</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: CLR.bg },
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title:          { color: CLR.text, fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  subtitle:       { color: CLR.muted, fontSize: 12, marginTop: 2 },
  newBtn:         { backgroundColor: CLR.neon, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  newBtnTxt:      { color: '#000', fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  statsRow:       { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCard:       { flex: 1, backgroundColor: CLR.card, borderRadius: 12, borderWidth: 1, borderColor: CLR.border, borderLeftWidth: 3, padding: 12 },
  statVal:        { fontSize: 24, fontWeight: '900', marginBottom: 2 },
  statLabel:      { color: CLR.muted, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  empty:          { alignItems: 'center', paddingTop: 60 },
  emptyTitle:     { color: CLR.text, fontSize: 16, fontWeight: '700', marginBottom: 8 },
  emptySubtitle:  { color: CLR.muted, fontSize: 13, textAlign: 'center', maxWidth: 280 },
  ticketCard:     { backgroundColor: CLR.card, borderWidth: 1, borderColor: CLR.border, borderRadius: 14, padding: 14, marginBottom: 10 },
  statusPill:     { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  statusTxt:      { fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  urgentPill:     { backgroundColor: 'rgba(255,71,87,0.12)', borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,71,87,0.3)', paddingHorizontal: 6, paddingVertical: 2 },
  urgentTxt:      { color: CLR.red, fontSize: 9, fontWeight: '900' },
  altaPill:       { backgroundColor: 'rgba(255,215,0,0.12)', borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,215,0,0.3)', paddingHorizontal: 6, paddingVertical: 2 },
  altaTxt:        { color: CLR.gold, fontSize: 9, fontWeight: '900' },
  ticketSubject:  { color: CLR.text, fontSize: 15, fontWeight: '700', marginBottom: 2 },
  ticketCat:      { color: CLR.muted, fontSize: 11, marginBottom: 2 },
  ticketUser:     { color: CLR.blue, fontSize: 11, marginBottom: 2 },
  ticketLastMsg:  { color: CLR.dim, fontSize: 11, fontStyle: 'italic' },
  unreadDot:      { width: 10, height: 10, borderRadius: 5, backgroundColor: CLR.neon },
  // Modal
  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modal:          { backgroundColor: CLR.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, borderTopWidth: 2, borderColor: CLR.neon },
  modalTitle:     { color: CLR.neon, fontWeight: '900', fontSize: 18, letterSpacing: 1, marginBottom: 18 },
  fieldLabel:     { color: CLR.muted, fontSize: 10, fontWeight: '900', letterSpacing: 2, marginBottom: 6 },
  catRow:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  catBtn:         { backgroundColor: CLR.bg, borderWidth: 1, borderColor: CLR.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  catTxt:         { color: CLR.muted, fontSize: 11, fontWeight: '700' },
  input:          { backgroundColor: CLR.bg, borderWidth: 1, borderColor: CLR.border, borderRadius: 12, padding: 12, color: CLR.text, fontSize: 14, marginBottom: 12 },
  cancelBtn:      { flex: 1, backgroundColor: CLR.border, borderRadius: 12, padding: 14, alignItems: 'center' },
  cancelTxt:      { color: CLR.muted, fontWeight: '900', fontSize: 13 },
  submitBtn:      { flex: 2, backgroundColor: CLR.neon, borderRadius: 12, padding: 14, alignItems: 'center' },
  submitTxt:      { color: '#000', fontWeight: '900', fontSize: 13, letterSpacing: 1 },
});

import { useEffect, useRef, useState }             from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
  Alert, Image,
} from 'react-native';
import { useLocalSearchParams, useRouter }         from 'expo-router';
import {
  collection, doc, query, where, onSnapshot,
  addDoc, updateDoc, serverTimestamp, getDoc, orderBy,
} from 'firebase/firestore';
import { onAuthStateChanged }                      from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL }        from 'firebase/storage';
import * as ImagePicker                            from 'expo-image-picker';
import { SafeAreaView }                            from 'react-native-safe-area-context';
import { auth, db, storage }                       from '@/lib/firebase';
import { CLR, TICKET_STATUS_CLR, TICKET_CATS }    from '@/lib/constants';
import type { Ticket, TicketMsg, UserProfile }     from '@/lib/types';

const STAFF_ROLES = ['mod', 'soporte', 'ceo'];
const CEO_UID     = '2bOrFxTAcPgFPoHKJHQfYxoQJpw1';

export default function TicketDetailScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const router   = useRouter();
  const scrollRef = useRef<ScrollView>(null);

  const [user,     setUser]     = useState<UserProfile | null>(null);
  const [ticket,   setTicket]   = useState<Ticket | null>(null);
  const [msgs,     setMsgs]     = useState<TicketMsg[]>([]);
  const [input,    setInput]    = useState('');
  const [sending,  setSending]  = useState(false);
  const [uploading,setUploading]= useState(false);

  const isStaff  = STAFF_ROLES.includes(user?.rol ?? '') || user?.uid === CEO_UID;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async fireUser => {
      if (!fireUser) return;
      const snap = await getDoc(doc(db, 'usuarios', fireUser.uid));
      setUser(snap.exists() ? { uid: fireUser.uid, ...snap.data() } as UserProfile : { uid: fireUser.uid });
    });
    return unsub;
  }, []);

  // Cargar ticket
  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, 'tickets', id), snap => {
      if (snap.exists()) setTicket({ id: snap.id, ...snap.data() } as Ticket);
    });
    return unsub;
  }, [id]);

  // Cargar mensajes
  useEffect(() => {
    if (!id) return;
    const q = query(collection(db, 'ticket_chat'), where('ticketId', '==', id), orderBy('timestamp', 'asc'));
    const unsub = onSnapshot(q, snap => {
      setMsgs(snap.docs.map(d => ({ id: d.id, ...d.data() }) as TicketMsg));
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    });
    return unsub;
  }, [id]);

  // Marcar leído
  useEffect(() => {
    if (!id || !user || !ticket) return;
    const field = isStaff ? 'unreadStaff' : 'unreadUser';
    if ((ticket as Record<string, unknown>)[field]) {
      updateDoc(doc(db, 'tickets', id), { [field]: 0 }).catch(() => {});
    }
  }, [ticket, user, isStaff, id]);

  async function sendMsg(text: string, imageUrl?: string) {
    if (!user || !id) return;
    const msgText = text.trim() || (imageUrl ? '📷 Imagen' : '');
    if (!msgText) return;
    await addDoc(collection(db, 'ticket_chat'), {
      ticketId:  id,
      uid:       user.uid,
      nombre:    user.nombre ?? 'Usuario',
      texto:     msgText,
      image_url: imageUrl ?? null,
      isStaff,
      timestamp: serverTimestamp(),
    });
    await updateDoc(doc(db, 'tickets', id), {
      updated_at: serverTimestamp(),
      lastMsg:    msgText.slice(0, 80),
      ...(isStaff
        ? { unreadUser: (ticket?.unreadUser ?? 0) + 1 }
        : { unreadStaff: (ticket?.unreadStaff ?? 0) + 1 }
      ),
    });
  }

  async function handleSend() {
    if (!input.trim()) return;
    setSending(true);
    try {
      await sendMsg(input);
      setInput('');
    } catch (e: unknown) { Alert.alert('Error', (e as Error).message); }
    finally { setSending(false); }
  }

  async function handleImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7, allowsEditing: false });
    if (result.canceled) return;
    const asset = result.assets[0];
    setUploading(true);
    try {
      const response  = await fetch(asset.uri);
      const blob      = await response.blob();
      const storageRef = ref(storage, `tickets/${id}/${Date.now()}.jpg`);
      await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
      const imageUrl  = await getDownloadURL(storageRef);
      await sendMsg('📷 Imagen', imageUrl);
    } catch (e: unknown) { Alert.alert('Error', (e as Error).message); }
    finally { setUploading(false); }
  }

  async function updateStatus(newStatus: Ticket['status']) {
    if (!id) return;
    await updateDoc(doc(db, 'tickets', id), { status: newStatus, updated_at: serverTimestamp() });
    // Mensaje de sistema
    await addDoc(collection(db, 'ticket_chat'), {
      ticketId:  id,
      uid:       'SYSTEM',
      nombre:    '⚙️ Sistema',
      texto:     `Estado actualizado: ${newStatus}`,
      isStaff:   true,
      timestamp: serverTimestamp(),
    });
  }

  async function updatePriority(newPriority: Ticket['priority']) {
    if (!id) return;
    await updateDoc(doc(db, 'tickets', id), { priority: newPriority, updated_at: serverTimestamp() });
  }

  if (!ticket) {
    return <View style={{ flex:1, justifyContent:'center', alignItems:'center', backgroundColor: CLR.bg }}>
      <ActivityIndicator color={CLR.neon} size="large" />
    </View>;
  }

  const stClr   = TICKET_STATUS_CLR[ticket.status] ?? CLR.muted;
  const catInfo = TICKET_CATS.find(c => c.value === ticket.category);
  const isClosed = ticket.status === 'CLOSED' || ticket.status === 'RESOLVED';

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>

        {/* Header del ticket */}
        <View style={s.ticketHeader}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={{ color: CLR.neon, fontSize: 22 }}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.ticketTitle} numberOfLines={1}>{ticket.subject}</Text>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <View style={[s.statusPill, { backgroundColor: `${stClr}15`, borderColor: `${stClr}40` }]}>
                <Text style={[s.statusTxt, { color: stClr }]}>{ticket.status}</Text>
              </View>
              <Text style={s.catTxt}>{catInfo?.label ?? ticket.category}</Text>
            </View>
          </View>
        </View>

        {/* Acciones staff */}
        {isStaff && (
          <View style={s.staffBar}>
            <Text style={s.staffBarLabel}>ESTADO:</Text>
            {(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as Ticket['status'][]).map(st => (
              <TouchableOpacity
                key={st}
                style={[s.stBtn, ticket.status === st && { backgroundColor: `${TICKET_STATUS_CLR[st]}25`, borderColor: TICKET_STATUS_CLR[st] }]}
                onPress={() => updateStatus(st)}
              >
                <Text style={[s.stBtnTxt, ticket.status === st && { color: TICKET_STATUS_CLR[st] }]}>{st.replace('_', ' ')}</Text>
              </TouchableOpacity>
            ))}
            <View style={{ flex: 1 }} />
            {(['NORMAL', 'ALTA', 'URGENTE'] as Ticket['priority'][]).map(p => (
              <TouchableOpacity
                key={p}
                style={[s.prioBtn, ticket.priority === p && { backgroundColor: 'rgba(255,215,0,0.15)', borderColor: CLR.gold }]}
                onPress={() => updatePriority(p)}
              >
                <Text style={[s.prioBtnTxt, ticket.priority === p && { color: CLR.gold }]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Info usuario (staff view) */}
        {isStaff && (
          <View style={s.infoBar}>
            <Text style={s.infoTxt}>👤 {ticket.username}</Text>
            {ticket.matchId && <Text style={s.infoTxt}>🎮 Match: {ticket.matchId.slice(-8).toUpperCase()}</Text>}
            <Text style={[s.infoPrio, {
              color: ticket.priority === 'URGENTE' ? CLR.red : ticket.priority === 'ALTA' ? CLR.gold : CLR.muted
            }]}>
              {ticket.priority === 'URGENTE' ? '🚨' : ticket.priority === 'ALTA' ? '⚠️' : '•'} {ticket.priority}
            </Text>
          </View>
        )}

        {/* Chat */}
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
        >
          {msgs.map(msg => {
            const isMine    = msg.uid === user?.uid;
            const isSystem  = msg.uid === 'SYSTEM';
            if (isSystem) {
              return (
                <View key={msg.id} style={s.sysMsg}>
                  <Text style={s.sysMsgTxt}>{msg.texto}</Text>
                </View>
              );
            }
            return (
              <View key={msg.id} style={[s.bubble, isMine ? s.bubbleMine : s.bubbleOther]}>
                {!isMine && <Text style={[s.bubbleSender, { color: msg.isStaff ? CLR.gold : CLR.muted }]}>
                  {msg.isStaff ? '⚡ ' : ''}{msg.nombre}
                </Text>}
                {msg.image_url ? (
                  <Image source={{ uri: msg.image_url }} style={s.chatImg} resizeMode="contain" />
                ) : (
                  <Text style={s.bubbleTxt}>{msg.texto}</Text>
                )}
              </View>
            );
          })}
        </ScrollView>

        {/* Input */}
        {!isClosed ? (
          <View style={s.inputRow}>
            <TouchableOpacity style={s.imgBtn} onPress={handleImage} disabled={uploading}>
              <Text style={{ fontSize: 20 }}>{uploading ? '⏳' : '📷'}</Text>
            </TouchableOpacity>
            <TextInput
              style={s.input}
              placeholder={isStaff ? 'Responder al usuario...' : 'Escribí tu mensaje...'}
              placeholderTextColor={CLR.muted}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={500}
            />
            <TouchableOpacity style={[s.sendBtn, (!input.trim() || sending) && { opacity: 0.5 }]} onPress={handleSend} disabled={!input.trim() || sending}>
              {sending ? <ActivityIndicator color="#000" size="small" /> : <Text style={s.sendTxt}>➤</Text>}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.closedBar}>
            <Text style={s.closedTxt}>
              {ticket.status === 'RESOLVED' ? '✅ Ticket resuelto — conversación cerrada' : '⬛ Ticket cerrado'}
            </Text>
          </View>
        )}

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: CLR.bg },
  ticketHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: CLR.card, borderBottomWidth: 1, borderBottomColor: CLR.border },
  backBtn:      { padding: 4 },
  ticketTitle:  { color: CLR.text, fontSize: 15, fontWeight: '700', marginBottom: 3 },
  statusPill:   { borderRadius: 6, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2 },
  statusTxt:    { fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  catTxt:       { color: CLR.muted, fontSize: 10 },
  staffBar:     { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, backgroundColor: 'rgba(255,215,0,0.04)', borderBottomWidth: 1, borderBottomColor: CLR.border, flexWrap: 'wrap' },
  staffBarLabel:{ color: CLR.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  stBtn:        { backgroundColor: CLR.bg, borderRadius: 6, borderWidth: 1, borderColor: CLR.border, paddingHorizontal: 8, paddingVertical: 4 },
  stBtnTxt:     { color: CLR.muted, fontSize: 9, fontWeight: '700' },
  prioBtn:      { backgroundColor: CLR.bg, borderRadius: 6, borderWidth: 1, borderColor: CLR.border, paddingHorizontal: 8, paddingVertical: 4 },
  prioBtnTxt:   { color: CLR.muted, fontSize: 9, fontWeight: '700' },
  infoBar:      { flexDirection: 'row', gap: 12, padding: 10, backgroundColor: 'rgba(0,195,255,0.04)', borderBottomWidth: 1, borderBottomColor: CLR.border },
  infoTxt:      { color: CLR.blue, fontSize: 11, fontWeight: '600' },
  infoPrio:     { fontSize: 11, fontWeight: '700' },
  sysMsg:       { alignSelf: 'center', backgroundColor: 'rgba(139,148,158,0.1)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 10, borderWidth: 1, borderColor: CLR.border },
  sysMsgTxt:    { color: CLR.muted, fontSize: 11, textAlign: 'center' },
  bubble:       { maxWidth: '80%', borderRadius: 16, padding: 12, marginBottom: 8 },
  bubbleMine:   { alignSelf: 'flex-end', backgroundColor: 'rgba(0,255,136,0.12)', borderTopRightRadius: 4, borderWidth: 1, borderColor: 'rgba(0,255,136,0.2)' },
  bubbleOther:  { alignSelf: 'flex-start', backgroundColor: CLR.card, borderTopLeftRadius: 4, borderWidth: 1, borderColor: CLR.border },
  bubbleSender: { fontSize: 10, fontWeight: '900', marginBottom: 4, letterSpacing: 0.5 },
  bubbleTxt:    { color: CLR.text, fontSize: 14, lineHeight: 20 },
  chatImg:      { width: 200, height: 150, borderRadius: 10 },
  inputRow:     { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, backgroundColor: CLR.card, borderTopWidth: 1, borderTopColor: CLR.border },
  imgBtn:       { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', backgroundColor: CLR.bg, borderRadius: 10, borderWidth: 1, borderColor: CLR.border },
  input:        { flex: 1, backgroundColor: CLR.bg, borderRadius: 12, borderWidth: 1, borderColor: CLR.border, padding: 10, color: CLR.text, fontSize: 14, maxHeight: 100 },
  sendBtn:      { width: 40, height: 40, backgroundColor: CLR.neon, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  sendTxt:      { color: '#000', fontWeight: '900', fontSize: 16 },
  closedBar:    { padding: 16, backgroundColor: CLR.card, borderTopWidth: 1, borderTopColor: CLR.border, alignItems: 'center' },
  closedTxt:    { color: CLR.muted, fontSize: 13, fontWeight: '600' },
});

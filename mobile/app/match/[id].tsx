import { useEffect, useRef, useState }               from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
  Alert, Image, Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter }           from 'expo-router';
import {
  doc, onSnapshot, collection, query, where,
  addDoc, updateDoc, serverTimestamp, orderBy, getDoc,
} from 'firebase/firestore';
import { onAuthStateChanged }                        from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL }          from 'firebase/storage';
import * as ImagePicker                              from 'expo-image-picker';
import { SafeAreaView }                              from 'react-native-safe-area-context';
import { auth, db, storage }                         from '@/lib/firebase';
import { CLR, WEB_URL }                              from '@/lib/constants';
import type { TournamentMatch, ChatMsg, UserProfile } from '@/lib/types';

export default function MatchRoomScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const router   = useRouter();
  const scrollRef = useRef<ScrollView>(null);

  const [user,       setUser]       = useState<UserProfile | null>(null);
  const [match,      setMatch]      = useState<TournamentMatch | null>(null);
  const [chatMsgs,   setChatMsgs]   = useState<ChatMsg[]>([]);
  const [chatInput,  setChatInput]  = useState('');
  const [sending,    setSending]    = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [reporting,  setReporting]  = useState(false);

  // Auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async fireUser => {
      if (!fireUser) return;
      const snap = await getDoc(doc(db, 'usuarios', fireUser.uid));
      setUser(snap.exists() ? { uid: fireUser.uid, ...snap.data() } as UserProfile : { uid: fireUser.uid });
    });
    return unsub;
  }, []);

  // Match en tiempo real
  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, 'matches', id), snap => {
      if (snap.exists()) setMatch({ id: snap.id, ...snap.data() } as TournamentMatch);
    });
    return unsub;
  }, [id]);

  // Chat en tiempo real
  useEffect(() => {
    if (!id) return;
    const q = query(collection(db, 'match_chat'), where('matchId', '==', id), orderBy('timestamp', 'asc'));
    const unsub = onSnapshot(q, snap => {
      setChatMsgs(snap.docs.map(d => ({ id: d.id, ...d.data() }) as ChatMsg));
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    });
    return unsub;
  }, [id]);

  const uid      = user?.uid;
  const isP1     = match?.p1 === uid;
  const isP2     = match?.p2 === uid;
  const isPlayer = isP1 || isP2;
  const myReady  = isP1 ? match?.p1_ready : match?.p2_ready;

  async function handleCheckIn() {
    if (!uid || !id || !match) return;
    setCheckingIn(true);
    try {
      const field = isP1 ? 'p1_ready' : 'p2_ready';
      const atField = isP1 ? 'p1_ready_at' : 'p2_ready_at';
      await updateDoc(doc(db, 'matches', id), {
        [field]: true,
        [atField]: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
      // Mensaje en chat
      await addDoc(collection(db, 'match_chat'), {
        matchId: id,
        tournamentId: match.tournamentId,
        uid,
        nombre: user?.nombre ?? 'Jugador',
        texto: `✅ ${user?.nombre ?? 'Jugador'} hizo check-in. ¡Listo para jugar!`,
        timestamp: serverTimestamp(),
      });
    } catch (e: unknown) { Alert.alert('Error', (e as Error).message); }
    finally { setCheckingIn(false); }
  }

  async function handleSendChat() {
    if (!chatInput.trim() || !uid) return;
    setSending(true);
    try {
      await addDoc(collection(db, 'match_chat'), {
        matchId: id,
        tournamentId: match?.tournamentId,
        uid,
        nombre: user?.nombre ?? 'Jugador',
        texto: chatInput.trim().slice(0, 300),
        timestamp: serverTimestamp(),
      });
      setChatInput('');
    } catch { /* silent */ }
    finally { setSending(false); }
  }

  async function handleImageChat() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permiso', 'Necesitamos acceso a tu galería.');
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
    if (result.canceled) return;
    setUploading(true);
    try {
      const response  = await fetch(result.assets[0].uri);
      const blob      = await response.blob();
      const storageRef = ref(storage, `chat/${match?.tournamentId}/${id}/${Date.now()}.jpg`);
      await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
      const url = await getDownloadURL(storageRef);
      await addDoc(collection(db, 'match_chat'), {
        matchId: id, tournamentId: match?.tournamentId, uid,
        nombre: user?.nombre ?? 'Jugador', texto: '📷 Imagen', image_url: url,
        timestamp: serverTimestamp(),
      });
    } catch (e: unknown) { Alert.alert('Error', (e as Error).message); }
    finally { setUploading(false); }
  }

  async function handleReportResult(score: string, winner: string) {
    if (!uid || !id) return;
    setReporting(true);
    try {
      await updateDoc(doc(db, 'matches', id), {
        status: 'PENDING_RESULT',
        score,
        winner,
        reported_by: uid,
        updated_at: serverTimestamp(),
      });
    } catch (e: unknown) { Alert.alert('Error', (e as Error).message); }
    finally { setReporting(false); }
  }

  function openReportModal() {
    Alert.prompt(
      '📊 Reportar resultado',
      'Ingresá el marcador (ej: 3-1):',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Continuar',
          onPress: score => {
            if (!score?.trim()) return;
            Alert.alert(
              '¿Quién ganó?',
              '',
              [
                { text: match?.p1_username ?? 'Jugador 1', onPress: () => handleReportResult(score, match?.p1 ?? '') },
                { text: match?.p2_username ?? 'Jugador 2', onPress: () => handleReportResult(score, match?.p2 ?? '') },
                { text: 'Cancelar', style: 'cancel' },
              ],
            );
          },
        },
      ],
      'plain-text',
    );
  }

  if (!match) {
    return <View style={{ flex:1, justifyContent:'center', alignItems:'center', backgroundColor: CLR.bg }}>
      <ActivityIndicator color={CLR.neon} size="large" />
    </View>;
  }

  const stClr = match.status === 'WAITING' ? CLR.neon : match.status === 'PENDING_RESULT' ? CLR.gold : match.status === 'DISPUTE' ? CLR.red : CLR.muted;
  const myId  = isP1 ? user?.ea_id || user?.konami_id : user?.ea_id || user?.konami_id;

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>

          {/* Back */}
          <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 12 }}>
            <Text style={{ color: CLR.neon }}>← VOLVER</Text>
          </TouchableOpacity>

          {/* Estado */}
          <View style={[s.statusCard, { borderColor: `${stClr}40` }]}>
            <View style={[s.statusDot, { backgroundColor: stClr }]} />
            <Text style={[s.statusTxt, { color: stClr }]}>{match.status}</Text>
            <Text style={s.roundTxt}>{match.round ?? ''}</Text>
          </View>

          {/* VS Card */}
          <View style={s.vsCard}>
            <View style={s.vsPlayer}>
              <Text style={s.vsName}>{match.p1_username ?? 'Jugador 1'}</Text>
              {match.p1_ready && <Text style={s.vsReady}>✅ Ready</Text>}
            </View>
            <Text style={s.vs}>VS</Text>
            <View style={[s.vsPlayer, { alignItems: 'flex-end' }]}>
              <Text style={s.vsName}>{match.p2_username ?? 'Jugador 2'}</Text>
              {match.p2_ready && <Text style={s.vsReady}>✅ Ready</Text>}
            </View>
          </View>

          {/* Score si hay resultado */}
          {match.score && match.score !== '—' && (
            <View style={s.scoreCard}>
              <Text style={s.score}>{match.score}</Text>
              {match.winner && (
                <Text style={s.winner}>
                  🏆 {match.winner === match.p1 ? (match.p1_username ?? 'P1') : (match.p2_username ?? 'P2')}
                </Text>
              )}
            </View>
          )}

          {/* Rival ID */}
          {isPlayer && (
            <View style={s.rivalCard}>
              <Text style={s.rivalLabel}>ID DE TU RIVAL</Text>
              <Text style={s.rivalId} selectable>
                {isP1
                  ? (match as Record<string, unknown>)['p2_ea_id'] as string || (match as Record<string, unknown>)['p2_konami_id'] as string || 'No disponible'
                  : (match as Record<string, unknown>)['p1_ea_id'] as string || (match as Record<string, unknown>)['p1_konami_id'] as string || 'No disponible'
                }
              </Text>
            </View>
          )}

          {/* Acciones de jugador */}
          {isPlayer && match.status === 'WAITING' && !myReady && (
            <TouchableOpacity
              style={[s.actionBtn, checkingIn && { opacity: 0.6 }]}
              onPress={handleCheckIn}
              disabled={checkingIn}
            >
              {checkingIn
                ? <ActivityIndicator color="#000" />
                : <Text style={s.actionBtnTxt}>✅ HACER CHECK-IN</Text>
              }
            </TouchableOpacity>
          )}

          {isPlayer && match.status === 'WAITING' && myReady && !match[isP1 ? 'p2_ready' : 'p1_ready'] && (
            <View style={s.waitingOther}>
              <ActivityIndicator color={CLR.gold} size="small" style={{ marginRight: 8 }} />
              <Text style={{ color: CLR.gold, fontWeight: '700' }}>Esperando a tu rival...</Text>
            </View>
          )}

          {isPlayer && match.status === 'WAITING' && match.p1_ready && match.p2_ready && (
            <View style={{ gap: 10 }}>
              <TouchableOpacity style={s.reportBtn} onPress={openReportModal} disabled={reporting}>
                <Text style={s.reportBtnTxt}>📊 REPORTAR RESULTADO</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.screenshotBtn} onPress={handleImageChat}>
                <Text style={s.screenshotBtnTxt}>{uploading ? '⏳ Subiendo...' : '📸 SUBIR CAPTURA'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {match.status === 'DISPUTE' && (
            <View style={s.disputeCard}>
              <Text style={s.disputeTxt}>⚖️ DISPUTA ACTIVA — STAFF REVISANDO</Text>
              {match.dispute_reason && <Text style={s.disputeReason}>{match.dispute_reason}</Text>}
            </View>
          )}

          {/* Ver en web */}
          <TouchableOpacity style={s.webBtn} onPress={() => Linking.openURL(`${WEB_URL}/match/${id}`)}>
            <Text style={s.webBtnTxt}>🌐 Ver sala completa en la web</Text>
          </TouchableOpacity>

          {/* Chat */}
          <Text style={s.chatTitle}>💬 CHAT DE SALA</Text>
        </ScrollView>

        {/* Chat messages */}
        <View style={{ flex: 1, maxHeight: 240 }}>
          <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 12 }}>
            {chatMsgs.map(msg => {
              const isMine  = msg.uid === uid;
              const isBot   = msg.rol === 'bot' || msg.uid === 'BOT_LFA';
              return (
                <View key={msg.id} style={[s.bubble, isMine ? s.bubbleMine : s.bubbleOther]}>
                  {!isMine && <Text style={[s.bubbleSender, { color: isBot ? CLR.neon : CLR.muted }]}>{msg.nombre}</Text>}
                  {msg.image_url
                    ? <Image source={{ uri: msg.image_url }} style={s.chatImg} resizeMode="contain" />
                    : <Text style={s.bubbleTxt}>{msg.texto}</Text>
                  }
                </View>
              );
            })}
          </ScrollView>
        </View>

        {/* Input chat */}
        {isPlayer && (
          <View style={s.inputRow}>
            <TouchableOpacity style={s.imgBtn} onPress={handleImageChat} disabled={uploading}>
              <Text style={{ fontSize: 18 }}>{uploading ? '⏳' : '📷'}</Text>
            </TouchableOpacity>
            <TextInput
              style={s.input}
              placeholder="Mensaje..."
              placeholderTextColor={CLR.muted}
              value={chatInput}
              onChangeText={setChatInput}
              maxLength={300}
            />
            <TouchableOpacity
              style={[s.sendBtn, (!chatInput.trim() || sending) && { opacity: 0.5 }]}
              onPress={handleSendChat}
              disabled={!chatInput.trim() || sending}
            >
              <Text style={s.sendTxt}>➤</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: CLR.bg },
  statusCard:    { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: CLR.card, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
  statusDot:     { width: 10, height: 10, borderRadius: 5 },
  statusTxt:     { fontWeight: '900', fontSize: 13, letterSpacing: 1, flex: 1 },
  roundTxt:      { color: CLR.muted, fontSize: 11 },
  vsCard:        { backgroundColor: CLR.card, borderRadius: 16, borderWidth: 1, borderColor: CLR.border, padding: 20, flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  vsPlayer:      { flex: 1, alignItems: 'flex-start' },
  vsName:        { color: CLR.text, fontWeight: '900', fontSize: 14, marginBottom: 2 },
  vsReady:       { color: CLR.neon, fontSize: 11, fontWeight: '700' },
  vs:            { color: CLR.gold, fontWeight: '900', fontSize: 22, marginHorizontal: 10 },
  scoreCard:     { backgroundColor: 'rgba(255,215,0,0.06)', borderWidth: 1, borderColor: 'rgba(255,215,0,0.2)', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 12 },
  score:         { color: CLR.gold, fontWeight: '900', fontSize: 32, letterSpacing: 4, marginBottom: 4 },
  winner:        { color: CLR.neon, fontWeight: '700', fontSize: 14 },
  rivalCard:     { backgroundColor: 'rgba(0,195,255,0.06)', borderWidth: 1, borderColor: 'rgba(0,195,255,0.2)', borderRadius: 12, padding: 14, marginBottom: 12 },
  rivalLabel:    { color: CLR.blue, fontSize: 10, fontWeight: '900', letterSpacing: 2, marginBottom: 6 },
  rivalId:       { color: CLR.text, fontWeight: '700', fontSize: 15 },
  actionBtn:     { backgroundColor: CLR.neon, borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 12 },
  actionBtnTxt:  { color: '#000', fontWeight: '900', fontSize: 14, letterSpacing: 1 },
  waitingOther:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, backgroundColor: 'rgba(255,215,0,0.06)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,215,0,0.2)', marginBottom: 12 },
  reportBtn:     { backgroundColor: 'rgba(0,255,136,0.12)', borderWidth: 1, borderColor: 'rgba(0,255,136,0.3)', borderRadius: 14, padding: 14, alignItems: 'center' },
  reportBtnTxt:  { color: CLR.neon, fontWeight: '900', fontSize: 13, letterSpacing: 1 },
  screenshotBtn: { backgroundColor: 'rgba(0,195,255,0.12)', borderWidth: 1, borderColor: 'rgba(0,195,255,0.3)', borderRadius: 14, padding: 14, alignItems: 'center' },
  screenshotBtnTxt:{ color: CLR.blue, fontWeight: '900', fontSize: 13 },
  disputeCard:   { backgroundColor: 'rgba(255,71,87,0.08)', borderWidth: 1, borderColor: 'rgba(255,71,87,0.3)', borderRadius: 14, padding: 14, marginBottom: 12 },
  disputeTxt:    { color: CLR.red, fontWeight: '900', fontSize: 12, letterSpacing: 1, marginBottom: 4 },
  disputeReason: { color: CLR.muted, fontSize: 12 },
  webBtn:        { backgroundColor: CLR.card, borderWidth: 1, borderColor: CLR.border, borderRadius: 12, padding: 12, alignItems: 'center', marginBottom: 16 },
  webBtnTxt:     { color: CLR.muted, fontSize: 12, fontWeight: '600' },
  chatTitle:     { color: CLR.blue, fontWeight: '900', fontSize: 12, letterSpacing: 2, marginBottom: 8 },
  bubble:        { maxWidth: '80%', borderRadius: 16, padding: 10, marginBottom: 6 },
  bubbleMine:    { alignSelf: 'flex-end', backgroundColor: 'rgba(0,255,136,0.1)', borderTopRightRadius: 4 },
  bubbleOther:   { alignSelf: 'flex-start', backgroundColor: CLR.card, borderTopLeftRadius: 4 },
  bubbleSender:  { fontSize: 9, fontWeight: '900', marginBottom: 3, letterSpacing: 0.5 },
  bubbleTxt:     { color: CLR.text, fontSize: 13 },
  chatImg:       { width: 160, height: 120, borderRadius: 8 },
  inputRow:      { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, backgroundColor: CLR.card, borderTopWidth: 1, borderTopColor: CLR.border },
  imgBtn:        { width: 38, height: 38, backgroundColor: CLR.bg, borderRadius: 10, borderWidth: 1, borderColor: CLR.border, justifyContent: 'center', alignItems: 'center' },
  input:         { flex: 1, backgroundColor: CLR.bg, borderRadius: 10, borderWidth: 1, borderColor: CLR.border, padding: 10, color: CLR.text, fontSize: 14 },
  sendBtn:       { width: 38, height: 38, backgroundColor: CLR.neon, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  sendTxt:       { color: '#000', fontWeight: '900', fontSize: 16 },
});

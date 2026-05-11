import { useEffect, useState }               from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, Alert, ActivityIndicator, TextInput,
} from 'react-native';
import {
  doc, getDoc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { onAuthStateChanged, signOut }       from 'firebase/auth';
import { SafeAreaView }                      from 'react-native-safe-area-context';
import { auth, db }                          from '@/lib/firebase';
import { CLR }                               from '@/lib/constants';
import type { UserProfile }                  from '@/lib/types';

export default function PerfilScreen() {
  const [user,     setUser]     = useState<UserProfile | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [eaId,     setEaId]     = useState('');
  const [konamiId, setKonamiId] = useState('');
  const [nombre,   setNombre]   = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async fireUser => {
      if (!fireUser) { setLoading(false); return; }
      const snap = await getDoc(doc(db, 'usuarios', fireUser.uid));
      const data = snap.exists() ? { uid: fireUser.uid, ...snap.data() } as UserProfile : { uid: fireUser.uid };
      setUser(data);
      setNombre(data.nombre ?? '');
      setEaId(data.ea_id ?? '');
      setKonamiId(data.konami_id ?? '');
      setLoading(false);
    });
    return unsub;
  }, []);

  async function saveProfile() {
    if (!user) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'usuarios', user.uid), {
        nombre:     nombre.trim() || user.nombre,
        ea_id:      eaId.trim()     || null,
        konami_id:  konamiId.trim() || null,
        updated_at: serverTimestamp(),
      });
      setUser(prev => prev ? { ...prev, nombre: nombre.trim(), ea_id: eaId.trim(), konami_id: konamiId.trim() } : prev);
      setEditing(false);
      Alert.alert('✅ Guardado', 'Perfil actualizado correctamente.');
    } catch (e: unknown) {
      Alert.alert('Error', (e as Error).message);
    } finally { setSaving(false); }
  }

  async function handleLogout() {
    Alert.alert('Cerrar sesión', '¿Seguro que querés salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: () => signOut(auth) },
    ]);
  }

  if (loading) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: CLR.bg }}>
      <ActivityIndicator color={CLR.neon} size="large" />
    </View>
  );

  if (!user) return null;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>

        {/* Avatar placeholder */}
        <View style={s.avatarWrap}>
          <View style={s.avatar}>
            <Text style={s.avatarTxt}>{(user.nombre ?? 'J')[0].toUpperCase()}</Text>
          </View>
          <Text style={s.userName}>{user.nombre ?? 'Jugador'}</Text>
          <Text style={s.userEmail}>{user.email ?? ''}</Text>
          {user.rol && user.rol !== 'jugador' && (
            <View style={s.rolPill}>
              <Text style={s.rolTxt}>{user.rol.toUpperCase()}</Text>
            </View>
          )}
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          {[
            { label: 'VICTORIAS', val: user.victorias ?? 0, clr: CLR.neon  },
            { label: 'TÍTULOS',   val: user.titulos   ?? 0, clr: CLR.gold  },
            { label: 'BALANCE',   val: user.balance   ?? 0, clr: CLR.blue  },
          ].map(k => (
            <View key={k.label} style={[s.statCard, { borderLeftColor: k.clr }]}>
              <Text style={[s.statVal, { color: k.clr }]}>{k.val.toLocaleString()}</Text>
              <Text style={s.statLabel}>{k.label}</Text>
            </View>
          ))}
        </View>

        {/* IDs de juego */}
        <View style={s.section}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <Text style={s.sectionTitle}>🎮 IDs DE JUEGO</Text>
            <TouchableOpacity style={s.editBtn} onPress={() => setEditing(!editing)}>
              <Text style={s.editBtnTxt}>{editing ? '✕ CANCELAR' : '✏️ EDITAR'}</Text>
            </TouchableOpacity>
          </View>

          {editing ? (
            <>
              <Text style={s.fieldLabel}>NOMBRE DE USUARIO</Text>
              <TextInput style={s.input} value={nombre} onChangeText={setNombre} placeholderTextColor={CLR.muted} placeholder="Tu nombre" />
              <Text style={s.fieldLabel}>EA ID (FC 26 / FC Mobile)</Text>
              <TextInput style={s.input} value={eaId} onChangeText={setEaId} placeholderTextColor={CLR.muted} placeholder="Ej: SomosLFA#1234" autoCapitalize="none" />
              <Text style={s.fieldLabel}>KONAMI ID (eFootball)</Text>
              <TextInput style={s.input} value={konamiId} onChangeText={setKonamiId} placeholderTextColor={CLR.muted} placeholder="Ej: 1234567890" keyboardType="number-pad" />
              <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={saveProfile} disabled={saving}>
                {saving ? <ActivityIndicator color="#000" /> : <Text style={s.saveBtnTxt}>💾 GUARDAR CAMBIOS</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={s.idRow}>
                <Text style={s.idLabel}>EA ID</Text>
                <Text style={s.idVal}>{user.ea_id || '—'}</Text>
              </View>
              <View style={s.idRow}>
                <Text style={s.idLabel}>KONAMI ID</Text>
                <Text style={s.idVal}>{user.konami_id || '—'}</Text>
              </View>
              <View style={s.idRow}>
                <Text style={s.idLabel}>REGIÓN</Text>
                <Text style={s.idVal}>{user.region || '—'}</Text>
              </View>
              <View style={s.idRow}>
                <Text style={s.idLabel}>PAÍS</Text>
                <Text style={s.idVal}>{user.pais || '—'}</Text>
              </View>
            </>
          )}
        </View>

        {/* Logout */}
        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
          <Text style={s.logoutTxt}>🚪 CERRAR SESIÓN</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: CLR.bg },
  avatarWrap:  { alignItems: 'center', marginBottom: 24 },
  avatar:      { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(0,255,136,0.12)', borderWidth: 2, borderColor: CLR.neon, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  avatarTxt:   { color: CLR.neon, fontWeight: '900', fontSize: 32 },
  userName:    { color: CLR.text, fontWeight: '900', fontSize: 20, marginBottom: 2 },
  userEmail:   { color: CLR.muted, fontSize: 13, marginBottom: 8 },
  rolPill:     { backgroundColor: 'rgba(255,215,0,0.12)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(255,215,0,0.3)' },
  rolTxt:      { color: CLR.gold, fontWeight: '900', fontSize: 10, letterSpacing: 2 },
  statsRow:    { flexDirection: 'row', gap: 8, marginBottom: 24 },
  statCard:    { flex: 1, backgroundColor: CLR.card, borderRadius: 12, borderWidth: 1, borderColor: CLR.border, borderLeftWidth: 3, padding: 12 },
  statVal:     { fontSize: 20, fontWeight: '900', marginBottom: 2 },
  statLabel:   { color: CLR.muted, fontSize: 8, fontWeight: '700', letterSpacing: 1 },
  section:     { backgroundColor: CLR.card, borderRadius: 16, borderWidth: 1, borderColor: CLR.border, padding: 16, marginBottom: 16 },
  sectionTitle:{ color: CLR.muted, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  editBtn:     { backgroundColor: 'rgba(163,113,247,0.12)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(163,113,247,0.3)' },
  editBtnTxt:  { color: CLR.lav, fontSize: 10, fontWeight: '900' },
  fieldLabel:  { color: CLR.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1, marginBottom: 5 },
  input:       { backgroundColor: CLR.bg, borderWidth: 1, borderColor: CLR.border, borderRadius: 10, padding: 12, color: CLR.text, fontSize: 14, marginBottom: 12 },
  saveBtn:     { backgroundColor: CLR.neon, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 4 },
  saveBtnTxt:  { color: '#000', fontWeight: '900', fontSize: 13, letterSpacing: 1 },
  idRow:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: CLR.border },
  idLabel:     { color: CLR.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  idVal:       { color: CLR.text, fontSize: 13, fontWeight: '600' },
  logoutBtn:   { backgroundColor: 'rgba(255,71,87,0.1)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,71,87,0.3)', padding: 16, alignItems: 'center' },
  logoutTxt:   { color: CLR.red, fontWeight: '900', fontSize: 14, letterSpacing: 1 },
});

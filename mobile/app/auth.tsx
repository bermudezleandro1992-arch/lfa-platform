import { useState }                                              from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  Alert,
} from 'react-native';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { SafeAreaView }                 from 'react-native-safe-area-context';
import { auth, db }                     from '@/lib/firebase';
import { CLR }                          from '@/lib/constants';

export default function AuthScreen() {
  const [tab,      setTab]      = useState<'login' | 'register'>('login');
  const [email,    setEmail]    = useState('');
  const [pass,     setPass]     = useState('');
  const [nombre,   setNombre]   = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleLogin() {
    if (!email || !pass) return Alert.alert('Error', 'Completá email y contraseña.');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pass);
    } catch (e: unknown) {
      Alert.alert('Error', (e as Error).message);
    } finally { setLoading(false); }
  }

  async function handleRegister() {
    if (!email || !pass || !nombre) return Alert.alert('Error', 'Completá todos los campos.');
    if (pass.length < 6) return Alert.alert('Error', 'La contraseña debe tener al menos 6 caracteres.');
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
      await updateProfile(cred.user, { displayName: nombre.trim() });
      await setDoc(doc(db, 'usuarios', cred.user.uid), {
        uid:        cred.user.uid,
        nombre:     nombre.trim(),
        email:      email.trim(),
        balance:    0,
        victorias:  0,
        titulos:    0,
        rol:        'jugador',
        created_at: serverTimestamp(),
      });
    } catch (e: unknown) {
      Alert.alert('Error', (e as Error).message);
    } finally { setLoading(false); }
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          {/* Logo */}
          <Text style={s.logo}>⚡ SOMOS<Text style={{ color: CLR.neon }}>LFA</Text></Text>
          <Text style={s.subtitle}>La plataforma de fútbol virtual</Text>

          {/* Tabs */}
          <View style={s.tabs}>
            <TouchableOpacity style={[s.tab, tab === 'login'    && s.tabActive]} onPress={() => setTab('login')}>
              <Text style={[s.tabTxt, tab === 'login' && s.tabTxtActive]}>INICIAR SESIÓN</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.tab, tab === 'register' && s.tabActive]} onPress={() => setTab('register')}>
              <Text style={[s.tabTxt, tab === 'register' && s.tabTxtActive]}>REGISTRARSE</Text>
            </TouchableOpacity>
          </View>

          {/* Form */}
          <View style={s.form}>
            {tab === 'register' && (
              <TextInput
                style={s.input}
                placeholder="Nombre de usuario"
                placeholderTextColor={CLR.muted}
                value={nombre}
                onChangeText={setNombre}
                autoCapitalize="words"
              />
            )}
            <TextInput
              style={s.input}
              placeholder="Email"
              placeholderTextColor={CLR.muted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              style={s.input}
              placeholder="Contraseña"
              placeholderTextColor={CLR.muted}
              value={pass}
              onChangeText={setPass}
              secureTextEntry
            />

            <TouchableOpacity
              style={[s.btn, loading && { opacity: 0.6 }]}
              onPress={tab === 'login' ? handleLogin : handleRegister}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="black" />
                : <Text style={s.btnTxt}>{tab === 'login' ? '⚡ ENTRAR' : '🚀 CREAR CUENTA'}</Text>
              }
            </TouchableOpacity>
          </View>

          <Text style={s.footer}>© 2025 SomosLFA. Todos los derechos reservados.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: CLR.bg },
  scroll:     { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logo:       { fontWeight: '900', fontSize: 36, color: CLR.text, textAlign: 'center', marginBottom: 4, letterSpacing: 2 },
  subtitle:   { color: CLR.muted, textAlign: 'center', marginBottom: 32, fontSize: 13 },
  tabs:       { flexDirection: 'row', backgroundColor: CLR.card, borderRadius: 12, marginBottom: 24, overflow: 'hidden', borderWidth: 1, borderColor: CLR.border },
  tab:        { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive:  { backgroundColor: CLR.neon },
  tabTxt:     { color: CLR.muted, fontWeight: '700', fontSize: 12, letterSpacing: 1 },
  tabTxtActive:{ color: '#000' },
  form:       { gap: 12 },
  input:      { backgroundColor: CLR.card, borderWidth: 1, borderColor: CLR.border, borderRadius: 12, padding: 14, color: CLR.text, fontSize: 15 },
  btn:        { backgroundColor: CLR.neon, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  btnTxt:     { color: '#000', fontWeight: '900', fontSize: 15, letterSpacing: 1 },
  footer:     { color: CLR.dim, textAlign: 'center', marginTop: 32, fontSize: 11 },
});

import { useEffect, useState }          from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { View, ActivityIndicator }      from 'react-native';
import { onAuthStateChanged, User }     from 'firebase/auth';
import { GestureHandlerRootView }       from 'react-native-gesture-handler';
import { SafeAreaProvider }             from 'react-native-safe-area-context';
import { auth }                         from '@/lib/firebase';
import { CLR }                          from '@/lib/constants';

function AuthGate({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const segments = useSegments();
  const [user,    setUser]    = useState<User | null | undefined>(undefined);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUser(u));
    return unsub;
  }, []);

  useEffect(() => {
    if (user === undefined) return; // aún cargando
    const inAuth = segments[0] === 'auth';
    if (!user && !inAuth) {
      router.replace('/auth');
    } else if (user && inAuth) {
      router.replace('/(tabs)/dashboard');
    }
  }, [user, segments]);

  if (user === undefined) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: CLR.bg }}>
        <ActivityIndicator color={CLR.neon} size="large" />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthGate>
          <Slot />
        </AuthGate>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

import { Tabs }          from 'expo-router';
import { CLR }           from '@/lib/constants';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: CLR.card,
          borderTopColor:  CLR.border,
          borderTopWidth:  1,
          height:          60,
          paddingBottom:   8,
        },
        tabBarActiveTintColor:   CLR.neon,
        tabBarInactiveTintColor: CLR.muted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
        headerStyle:      { backgroundColor: CLR.bg },
        headerTintColor:  CLR.text,
        headerTitleStyle: { fontWeight: '900', letterSpacing: 1 },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{ title: 'INICIO', tabBarIcon: ({ color }) => <TabIcon label="🏠" color={color} /> }}
      />
      <Tabs.Screen
        name="torneos"
        options={{ title: 'TORNEOS', tabBarIcon: ({ color }) => <TabIcon label="🏆" color={color} /> }}
      />
      <Tabs.Screen
        name="ranking"
        options={{ title: 'RANKING', tabBarIcon: ({ color }) => <TabIcon label="📊" color={color} /> }}
      />
      <Tabs.Screen
        name="billetera"
        options={{ title: 'BILLETERA', tabBarIcon: ({ color }) => <TabIcon label="💳" color={color} /> }}
      />
      <Tabs.Screen
        name="tickets"
        options={{ title: 'SOPORTE', tabBarIcon: ({ color }) => <TabIcon label="🎫" color={color} /> }}
      />
      <Tabs.Screen
        name="perfil"
        options={{ title: 'PERFIL', tabBarIcon: ({ color }) => <TabIcon label="👤" color={color} /> }}
      />
    </Tabs>
  );
}

function TabIcon({ label, color }: { label: string; color: string }) {
  const { Text } = require('react-native');
  return <Text style={{ fontSize: 20, color }}>{label}</Text>;
}

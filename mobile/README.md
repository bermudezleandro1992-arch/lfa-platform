# SomosLFA Mobile 📱

App nativa Android/iOS para la plataforma SomosLFA. Construida con **Expo + React Native**, comparte el backend Firebase con la web.

## Stack
- **Expo SDK 52** + **Expo Router v4** (navegación basada en archivos)
- **Firebase 10** (Auth, Firestore, Storage — misma base que la web)
- **TypeScript** strict

---

## Requisitos previos

1. **Node.js 18+**
2. **Expo CLI**: `npm install -g expo-cli`
3. **EAS CLI** (para builds): `npm install -g eas-cli`
4. Cuenta en [expo.dev](https://expo.dev)
5. **Android Studio** (solo si querés buildear localmente)

---

## Setup local

```bash
cd mobile
npm install

# Copiar y completar variables de entorno
cp .env.example .env
# Editar .env con los valores de Firebase Console
```

### Variables requeridas (`.env`)
```
EXPO_PUBLIC_FIREBASE_API_KEY=        ← Firebase Console → Configuración del proyecto
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=lfaofficial.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=lfaofficial
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=lfaofficial.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=
EXPO_PUBLIC_WEB_URL=https://lfa-platform.web.app
```

---

## Correr en desarrollo

```bash
# Expo Go (sin build nativo — más rápido para probar)
npm start

# Android (requiere Android Studio o dispositivo físico)
npm run android

# iOS (requiere macOS + Xcode)
npm run ios
```

---

## Generar APK (distribución directa)

### Via EAS Build (recomendado — cloud, sin necesitar Android Studio)

```bash
# 1. Logearse en Expo
eas login

# 2. Configurar el proyecto (solo primera vez)
eas build:configure

# 3. Buildear APK (preview = distribución interna)
npm run build:apk

# El APK se sube a expo.dev — descargar desde ahí
```

### Via EAS Build (producción — para Play Store)

```bash
npm run build:aab
# Genera un .aab para subir a Google Play Console
```

---

## Estructura de pantallas

```
app/
  auth.tsx              ← Login / Registro
  (tabs)/
    dashboard.tsx       ← Inicio: balance, sala activa, torneos
    torneos.tsx         ← Listado y unión a torneos
    ranking.tsx         ← Ranking global de jugadores
    billetera.tsx       ← Balance, historial, links a recarga
    tickets.tsx         ← Sistema de soporte (punto 9)
    perfil.tsx          ← Perfil, IDs de juego, configuración
  match/[id].tsx        ← Sala de partido en vivo
  torneo/[id].tsx       ← Detalle de torneo + lista de matches
  ticket/[id].tsx       ← Chat privado de ticket de soporte
```

---

## Sistema de Tickets (Soporte)

### Para jugadores:
1. Ir a **Soporte** → **+ NUEVO**
2. Seleccionar categoría (Disputa / Pago / Técnico / Cuenta / Otro)
3. Completar asunto y descripción
4. El staff recibe notificación y responde desde la app

### Para Staff (MOD/Soporte/CEO):
- Ven **todos** los tickets globalmente
- Pueden cambiar estado: `OPEN → IN_PROGRESS → RESOLVED → CLOSED`
- Pueden cambiar prioridad: `NORMAL / ALTA / URGENTE`
- Chat privado con el usuario

### Colección Firestore:
- `tickets/{ticketId}` — Datos del ticket
- `ticket_chat/{msgId}` — Mensajes del chat

---

## Permisos Android

La app solicita:
- **Cámara** — para subir screenshots de partidos
- **Galería** — para elegir imágenes
- **Notificaciones** — para alertas de match y tickets

---

## Notas de seguridad

- Las variables `EXPO_PUBLIC_*` son visibles en el bundle. Son las mismas que usa la web (Firebase client SDK — comportamiento esperado).
- Las reglas de Firestore y Storage protegen el acceso a los datos.
- Las acciones de staff/CEO requieren rol verificado server-side.

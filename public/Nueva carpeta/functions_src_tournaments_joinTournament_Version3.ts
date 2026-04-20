import * as admin                          from "firebase-admin";
import { onCall, HttpsError }              from "firebase-functions/v2/https";
import { getStartTournamentTask }          from "./startTournament";

const db = admin.firestore();

export const joinTournament = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Debés iniciar sesión.");

  const { tournamentId } = request.data;
  const uid = request.auth.uid;

  const tournamentRef = db.collection("tournaments").doc(tournamentId);
  const userRef       = db.collection("users").doc(uid);

  return db.runTransaction(async (tx) => {
    const [tSnap, uSnap] = await Promise.all([tx.get(tournamentRef), tx.get(userRef)]);

    if (!tSnap.exists) throw new HttpsError("not-found", "Torneo no encontrado.");
    if (!uSnap.exists) throw new HttpsError("not-found", "Usuario no encontrado.");

    const t = tSnap.data()!;
    const u = uSnap.data()!;

    // Validaciones
    if (t.status !== "OPEN")              throw new HttpsError("failed-precondition", "El torneo no está abierto.");
    if (t.players.includes(uid))          throw new HttpsError("already-exists",      "Ya estás inscrito.");
    if (t.players.length >= t.capacity)   throw new HttpsError("resource-exhausted",  "Sala llena.");

    // Compatibilidad de región
    const compatibles: Record<string, string[]> = {
      LATAM_SUR:   ["LATAM_SUR",  "AMERICA", "GLOBAL"],
      LATAM_NORTE: ["LATAM_NORTE","AMERICA", "GLOBAL"],
      AMERICA:     ["LATAM_SUR",  "LATAM_NORTE", "AMERICA", "GLOBAL"],
      GLOBAL:      ["LATAM_SUR",  "LATAM_NORTE", "AMERICA", "GLOBAL"],
    };
    if (!compatibles[u.region]?.includes(t.region))
      throw new HttpsError("failed-precondition", `Tu región (${u.region}) no puede entrar a este torneo (${t.region}).`);

    const isFree = t.entry_fee === 0;

    // Validaciones FREE
    if (isFree) {
      const authUser = await admin.auth().getUser(uid);
      if (!authUser.emailVerified)
        throw new HttpsError("failed-precondition", "Verificá tu email para acceder a torneos gratuitos.");
      if (!u.ea_id?.trim())
        throw new HttpsError("failed-precondition", "Vinculá tu EA ID antes de acceder a torneos gratuitos.");
      if (u.coins > 5_000)
        throw new HttpsError("failed-precondition", "Con más de 5,000 Coins no podés acceder a salas gratuitas.");

      // Máx 2 torneos free por día
      const since = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 86_400_000));
      const snap  = await db.collection("transactions")
        .where("userId", "==", uid).where("type", "==", "FREE_ENTRY").where("timestamp", ">=", since).get();
      if (snap.size >= 2)
        throw new HttpsError("resource-exhausted", "Límite diario: máximo 2 torneos gratuitos por día.");
    }

    // Saldo
    if (!isFree && u.coins < t.entry_fee)
      throw new HttpsError("failed-precondition", `Saldo insuficiente. Necesitás ${t.entry_fee.toLocaleString()} Coins.`);

    // Inscribir
    const newPlayers = [...t.players, uid];
    if (!isFree) tx.update(userRef, { coins: u.coins - t.entry_fee });
    tx.update(tournamentRef, { players: newPlayers });

    // Transacción log
    tx.set(db.collection("transactions").doc(), {
      userId: uid, type: isFree ? "FREE_ENTRY" : "TOURNAMENT_ENTRY",
      amount: isFree ? 0 : -t.entry_fee, tournamentId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (!isFree && !u.has_participated_in_paid)
      tx.update(userRef, { has_participated_in_paid: true });

    // Lanzar torneo si está lleno
    if (newPlayers.length === t.capacity)
      await getStartTournamentTask(tournamentId);

    return {
      success:    true,
      newBalance: isFree ? u.coins : u.coins - t.entry_fee,
      message:    "¡Inscripción exitosa!",
    };
  });
});
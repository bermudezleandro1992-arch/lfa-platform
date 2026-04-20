"use client";

import { useEffect, useState }       from "react";
import { doc, onSnapshot }           from "firebase/firestore";
import { db, auth, storage }         from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import ConsoleBadges                 from "./ConsoleBadges";

interface Match {
  id:             string;
  p1:             string;
  p2:             string;
  p1_username?:   string;
  p2_username?:   string;
  p1_ea_id?:      string;
  p2_ea_id?:      string;
  score:          string;
  winner:         string | null;
  status:         "WAITING" | "PENDING_RESULT" | "DISPUTE" | "FINISHED";
  reported_by?:   string;
  screenshot_url?: string;
  dispute_deadline?: any;
  round:          string;
  tournamentId:   string;
}

interface Props { matchId: string; }

export default function MatchRoom({ matchId }: Props) {
  const [match,         setMatch]         = useState<Match | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [uploading,     setUploading]     = useState(false);
  const [disputing,     setDisputing]     = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [message,       setMessage]       = useState("");
  const [timeLeft,      setTimeLeft]      = useState(0);

  const uid = auth.currentUser?.uid;

  // Tiempo real del match
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "matches", matchId), (snap) => {
      if (snap.exists()) { setMatch({ id: snap.id, ...snap.data() } as Match); }
      setLoading(false);
    });
    return () => unsub();
  }, [matchId]);

  // Countdown para disputa
  useEffect(() => {
    if (!match?.dispute_deadline) return;
    const iv = setInterval(() => {
      const secs = Math.max(0, Math.floor((match.dispute_deadline.toMillis() - Date.now()) / 1000));
      setTimeLeft(secs);
    }, 1000);
    return () => clearInterval(iv);
  }, [match?.dispute_deadline]);

  const fmtTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const callApi = async (endpoint: string, body: object) => {
    const token = await auth.currentUser!.getIdToken();
    const res   = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
  };

  const handleUploadResult = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !match) return;
    setUploading(true); setMessage("");
    try {
      // Subir imagen a Firebase Storage
      const storageRef = ref(storage, `results/${match.tournamentId}/${matchId}/${Date.now()}`);
      await uploadBytes(storageRef, file);
      const screenshotUrl = await getDownloadURL(storageRef);
      // Reportar resultado
      const data = await callApi("/api/reportResult", { matchId, screenshotUrl });
      setMessage(`✅ Resultado enviado. Score: ${data.score}. Tu rival tiene ${data.disputeDeadline ? "10 min" : ""} para disputar.`);
    } catch (err: any) {
      setMessage(`❌ ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDispute = async () => {
    if (!disputeReason.trim()) { setMessage("❌ Escribí el motivo de la disputa."); return; }
    setDisputing(true); setMessage("");
    try {
      await callApi("/api/disputeMatch", { matchId, reason: disputeReason });
      setMessage("⚠️ Disputa enviada. El Staff revisará el caso.");
    } catch (err: any) {
      setMessage(`❌ ${err.message}`);
    } finally {
      setDisputing(false);
    }
  };

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400" />
    </div>
  );

  if (!match) return <p className="text-center text-red-400 py-10">Match no encontrado.</p>;

  const isP1        = match.p1 === uid;
  const isP2        = match.p2 === uid;
  const myEaId      = isP1 ? match.p1_ea_id : match.p2_ea_id;
  const rivalEaId   = isP1 ? match.p2_ea_id : match.p1_ea_id;
  const rivalName   = isP1 ? match.p2_username : match.p1_username;
  const canReport   = (isP1 || isP2) && match.status === "WAITING";
  const canDispute  = (isP1 || isP2) && match.status === "PENDING_RESULT" && match.reported_by !== uid;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4">
      <div className="max-w-2xl mx-auto">

        {/* HEADER */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-yellow-400 mb-1">⚔️ Sala de Match</h1>
          <p className="text-gray-500 text-sm">Ronda: <span className="text-white font-semibold">{match.round}</span></p>
          <div className="flex justify-center mt-3">
            <ConsoleBadges size="sm" />
          </div>
        </div>

        {/* VS CARD */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
          <div className="grid grid-cols-3 items-center gap-4">
            {/* Jugador 1 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-yellow-400/10 border-2 border-yellow-400 rounded-full flex items-center justify-center text-2xl mx-auto mb-2">
                🎮
              </div>
              <p className="font-bold text-white">{match.p1_username ?? "Jugador 1"}</p>
              {match.p1_ea_id && (
                <p className="text-xs text-yellow-400 font-mono mt-1">{match.p1_ea_id}</p>
              )}
            </div>

            {/* VS */}
            <div className="text-center">
              <p className="text-3xl font-black text-gray-600">VS</p>
              {match.score && (
                <p className="text-2xl font-black text-yellow-400 mt-1">{match.score}</p>
              )}
            </div>

            {/* Jugador 2 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-400/10 border-2 border-blue-400 rounded-full flex items-center justify-center text-2xl mx-auto mb-2">
                🎮
              </div>
              <p className="font-bold text-white">{match.p2_username ?? "Jugador 2"}</p>
              {match.p2_ea_id && (
                <p className="text-xs text-blue-400 font-mono mt-1">{match.p2_ea_id}</p>
              )}
            </div>
          </div>

          {/* STATUS BADGE */}
          <div className="text-center mt-4">
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${
              match.status === "WAITING"        ? "bg-green-500/20 text-green-400" :
              match.status === "PENDING_RESULT" ? "bg-yellow-500/20 text-yellow-400" :
              match.status === "DISPUTE"        ? "bg-red-500/20 text-red-400" :
                                                  "bg-gray-700 text-gray-400"
            }`}>
              {match.status === "WAITING"        ? "⏳ Esperando resultado" :
               match.status === "PENDING_RESULT" ? "🕐 Pendiente de confirmación" :
               match.status === "DISPUTE"        ? "⚠️ En disputa — Staff notificado" :
                                                   "✅ Finalizado"}
            </span>
          </div>
        </div>

        {/* INSTRUCCIONES EA ID */}
        {match.status === "WAITING" && (isP1 || isP2) && rivalEaId && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-5 mb-6">
            <h3 className="font-bold text-blue-300 mb-2">📋 Cómo conectarse con tu rival</h3>
            <ol className="text-sm text-gray-300 space-y-1 list-decimal list-inside">
              <li>Abrí el juego y andá a <strong>Amigos / Buscar jugador</strong></li>
              <li>Buscá el EA ID de tu rival: <strong className="text-yellow-400 font-mono">{rivalEaId}</strong></li>
              <li>Invitalo a un partido amistoso</li>
              <li>Jugá el partido y al terminar subí la foto del resultado</li>
            </ol>
            <button onClick={() => navigator.clipboard.writeText(rivalEaId ?? "")}
              className="mt-3 text-xs text-blue-400 hover:text-blue-300 underline">
              📋 Copiar EA ID del rival
            </button>
          </div>
        )}

        {/* REPORTE DE RESULTADO */}
        {canReport && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-6">
            <h3 className="font-bold text-white mb-3">📸 Reportar Resultado</h3>
            <p className="text-sm text-gray-400 mb-4">
              Solo el <strong>ganador</strong> sube la foto. La IA valida el marcador automáticamente.
            </p>
            <label className={`w-full py-3 rounded-xl font-bold text-sm transition-all cursor-pointer flex items-center justify-center gap-2
              ${uploading ? "bg-gray-700 text-gray-500 cursor-wait" : "bg-yellow-400 text-gray-900 hover:bg-yellow-300"}`}>
              {uploading ? "⏳ Subiendo y validando..." : "📷 Subir foto del resultado"}
              <input type="file" accept="image/*" className="hidden" onChange={handleUploadResult} disabled={uploading} />
            </label>
          </div>
        )}

        {/* COUNTDOWN + DISPUTA */}
        {canDispute && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 mb-6">
            <h3 className="font-bold text-red-400 mb-2">⚠️ Tu rival reportó victoria</h3>

            {timeLeft > 0 && (
              <div className="text-center mb-4">
                <p className="text-xs text-gray-500 mb-1">Tiempo para disputar</p>
                <p className={`text-3xl font-mono font-black ${timeLeft <= 60 ? "text-red-400 animate-pulse" : "text-yellow-400"}`}>
                  {fmtTime(timeLeft)}
                </p>
              </div>
            )}

            <p className="text-sm text-gray-400 mb-3">
              Score reportado: <strong className="text-white">{match.score}</strong>
            </p>

            {match.screenshot_url && (
              <a href={match.screenshot_url} target="_blank" rel="noreferrer"
                className="text-sm text-blue-400 underline block mb-3">
                🖼️ Ver screenshot subido por tu rival
              </a>
            )}

            <textarea value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)}
              placeholder="Explicá por qué el resultado es incorrecto..."
              className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-sm text-white resize-none h-20 mb-3 focus:border-red-400 outline-none"
            />

            <button onClick={handleDispute} disabled={disputing}
              className="w-full py-3 bg-red-500 text-white font-bold rounded-xl hover:bg-red-400 transition disabled:opacity-50">
              {disputing ? "⏳ Enviando disputa..." : "🚨 DISPUTAR RESULTADO"}
            </button>
          </div>
        )}

        {/* RESULTADO FINAL */}
        {match.status === "FINISHED" && match.winner && (
          <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-2xl p-6 text-center">
            <p className="text-4xl mb-2">🏆</p>
            <p className="text-xl font-black text-yellow-400">
              {match.winner === uid ? "¡Ganaste!" : "Perdiste esta vez"}
            </p>
            {match.score && (
              <p className="text-gray-400 mt-1">Resultado final: <strong className="text-white">{match.score}</strong></p>
            )}
          </div>
        )}

        {/* MENSAJE GLOBAL */}
        {message && (
          <div className="mt-4 text-center text-sm bg-gray-800 rounded-xl p-3">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
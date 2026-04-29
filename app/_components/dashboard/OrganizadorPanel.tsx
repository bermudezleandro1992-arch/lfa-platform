"use client";

import { useState, useEffect, useCallback } from "react";
import {
  collection, query, where, onSnapshot,
  limit, doc, getDoc, getDocs,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import type { Tournament } from "@/hooks/useTournaments";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Match {
  id:              string;
  p1:              string;
  p2:              string;
  p1_username?:    string;
  p2_username?:    string;
  score?:          string;
  winner?:         string | null;
  status:          "WAITING" | "PENDING_RESULT" | "DISPUTE" | "FINISHED";
  screenshot_url?: string;
  round?:          string;
  tournamentId:    string;
}

interface UserInfo { nombre: string; avatar_url?: string; celular?: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const statusColor: Record<string, string> = {
  OPEN:      "#00ff88",
  ACTIVE:    "#ffd700",
  FINISHED:  "#6e7681",
  CANCELLED: "#ff4757",
  DISPUTE:   "#ff4757",
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function OrganizadorPanel() {
  const [uid,          setUid]          = useState<string | null>(null);
  const [tournaments,  setTournaments]  = useState<Tournament[]>([]);
  const [selected,     setSelected]     = useState<Tournament | null>(null);
  const [matches,      setMatches]      = useState<Match[]>([]);
  const [users,        setUsers]        = useState<Record<string, UserInfo>>({});
  const [actionMsg,    setActionMsg]    = useState("");
  const [showCreate,   setShowCreate]   = useState(false);
  const [subTarget,      setSubTarget]      = useState<{ matchId: string; playerId: string } | null>(null);
  const [subUid,         setSubUid]         = useState("");
  const [addingPlayer,   setAddingPlayer]   = useState(false);
  const [searchNick,     setSearchNick]     = useState("");
  const [searchResults,  setSearchResults]  = useState<{uid:string;nombre:string;avatar_url?:string;celular?:string}[]>([]);
  const [searchLoading,  setSearchLoading]  = useState(false);

  // Auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUid(u?.uid ?? null));
    return unsub;
  }, []);

  // Live list of organizer's tournaments
  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, "tournaments"),
      where("tipo",            "==", "organizado"),
      where("organizador_uid", "==", uid),
      limit(30)
    );
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Tournament));
      list.sort((a, b) => (b.created_at?.toMillis?.() ?? 0) - (a.created_at?.toMillis?.() ?? 0));
      setTournaments(list);
    });
    return unsub;
  }, [uid]);

  // Live matches for selected tournament
  useEffect(() => {
    if (!selected) { setMatches([]); return; }
    const q = query(
      collection(db, "matches"),
      where("tournamentId", "==", selected.id),
      limit(64)
    );
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Match));
      list.sort((a, b) => (a.round ?? "").localeCompare(b.round ?? ""));
      setMatches(list);
    });
    return unsub;
  }, [selected]);

  // Fetch user names for players in selected tournament
  useEffect(() => {
    if (!selected) return;
    const toFetch = selected.players.filter(p => !users[p]);
    if (toFetch.length === 0) return;
    Promise.all(
      toFetch.map(async p => {
        const snap = await getDoc(doc(db, "usuarios", p));
        return {
          id:   p,
          info: snap.exists()
            ? (snap.data() as UserInfo)
            : { nombre: p.slice(0, 8) },
        };
      })
    ).then(results => {
      const upd: Record<string, UserInfo> = {};
      results.forEach(r => { upd[r.id] = r.info; });
      setUsers(prev => ({ ...prev, ...upd }));
    });
  }, [selected]);

  // Generic API call helper
  const callApi = useCallback(async (endpoint: string, body: object) => {
    const token = await auth.currentUser!.getIdToken();
    const res = await fetch(endpoint, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error desconocido");
    return data;
  }, []);

  const avanzar = useCallback(async (matchId: string, playerId: string) => {
    setActionMsg("");
    try {
      await callApi("/api/organizer/action", {
        action: "avanzar", matchId, playerId, tournamentId: selected!.id,
      });
      setActionMsg("✅ Jugador avanzado correctamente");
    } catch (e) { setActionMsg("❌ " + (e as Error).message); }
  }, [callApi, selected]);

  const expulsar = useCallback(async (matchId: string, playerId: string) => {
    if (!confirm("¿Expulsar este jugador? Su rival avanzará automáticamente.")) return;
    setActionMsg("");
    try {
      await callApi("/api/organizer/action", {
        action: "expulsar", matchId, playerId, tournamentId: selected!.id,
      });
      setActionMsg("✅ Jugador expulsado");
    } catch (e) { setActionMsg("❌ " + (e as Error).message); }
  }, [callApi, selected]);

  const sustituir = useCallback(async () => {
    if (!subTarget || !subUid.trim()) return;
    setActionMsg("");
    try {
      await callApi("/api/organizer/action", {
        action:        "sustituir",
        matchId:       subTarget.matchId,
        playerId:      subTarget.playerId,
        substituteId:  subUid.trim(),
        tournamentId:  selected!.id,
      });
      setActionMsg("✅ Jugador sustituido");
      setSubTarget(null);
      setSubUid("");
    } catch (e) { setActionMsg("❌ " + (e as Error).message); }
  }, [callApi, selected, subTarget, subUid]);

  const searchPlayer = useCallback(async () => {
    if (!searchNick.trim()) return;
    setSearchLoading(true);
    setSearchResults([]);
    try {
      const snap = await getDocs(query(
        collection(db, "usuarios"),
        where("nombre", "==", searchNick.trim()),
        limit(5)
      ));
      const results = snap.docs.map(d => ({
        uid:       d.id,
        nombre:    d.data().nombre || d.id.slice(0, 8),
        avatar_url: d.data().avatar_url,
        celular:    d.data().celular,
      }));
      setSearchResults(results);
      if (results.length === 0) setActionMsg("⚠️ No se encontró ningún jugador con ese nick exacto.");
    } catch { setActionMsg("❌ Error al buscar jugador"); }
    setSearchLoading(false);
  }, [searchNick]);

  const addPlayer = useCallback(async (playerUid: string) => {
    setActionMsg("");
    try {
      await callApi("/api/organizer/action", {
        action:       "agregar_jugador",
        tournamentId: selected!.id,
        playerId:     playerUid,
      });
      setActionMsg("✅ Jugador agregado al torneo");
      setAddingPlayer(false);
      setSearchNick("");
      setSearchResults([]);
    } catch (e) { setActionMsg("❌ " + (e as Error).message); }
  }, [callApi, selected]);

  const activeMatches   = matches.filter(m => m.status !== "FINISHED");
  const finishedMatches = matches.filter(m => m.status === "FINISHED");

  return (
    <div style={{ minHeight: "100vh", background: "#0b0e14", color: "white", fontFamily: "'Roboto',sans-serif" }}>
      <div style={{ maxWidth: 940, margin: "0 auto", padding: "24px 16px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: "0.95rem", fontWeight: 900, color: "#a371f7" }}>
            🎙️ PANEL ORGANIZADOR
          </span>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              marginLeft: "auto", background: "rgba(163,113,247,0.12)",
              border: "1px solid rgba(163,113,247,0.4)", color: "#a371f7",
              fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: "0.68rem",
              padding: "8px 16px", borderRadius: 8, cursor: "pointer",
            }}>
            ＋ CREAR TORNEO
          </button>
        </div>

        {/* Action feedback */}
        {actionMsg && (
          <div style={{
            marginBottom: 16, padding: "10px 14px", borderRadius: 8, fontSize: "0.8rem",
            background:   actionMsg.startsWith("✅") ? "rgba(0,255,136,0.08)" : "rgba(255,71,87,0.08)",
            border:       `1px solid ${actionMsg.startsWith("✅") ? "#00ff8840" : "#ff475740"}`,
            color:        actionMsg.startsWith("✅") ? "#00ff88" : "#ff4757",
          }}>
            {actionMsg}
          </div>
        )}

        {/* Two-column layout */}
        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 14, alignItems: "start" }}>

          {/* ── Sidebar: tournament list ── */}
          <div style={{ background: "#111318", border: "1px solid #1c2028", borderRadius: 14, overflow: "hidden" }}>
            <div style={{
              padding: "11px 14px", borderBottom: "1px solid #1c2028",
              fontFamily: "'Orbitron',sans-serif", fontSize: "0.65rem", color: "#8b949e",
            }}>
              MIS TORNEOS ({tournaments.length})
            </div>

            {tournaments.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "#6e7681", fontSize: "0.75rem" }}>
                No tenés torneos creados.<br />
                <span style={{ color: "#a371f7", cursor: "pointer" }} onClick={() => setShowCreate(true)}>
                  Crear uno ahora →
                </span>
              </div>
            ) : (
              tournaments.map(t => {
                const isActive = selected?.id === t.id;
                return (
                  <button key={t.id} onClick={() => setSelected(t)}
                    style={{
                      width: "100%", textAlign: "left", border: "none",
                      borderLeft: `3px solid ${isActive ? "#a371f7" : "transparent"}`,
                      borderBottom: "1px solid #1c2028",
                      background: isActive ? "rgba(163,113,247,0.08)" : "transparent",
                      padding: "11px 13px", cursor: "pointer", transition: "0.15s",
                    }}>
                    <div style={{
                      fontFamily: "'Orbitron',sans-serif", fontSize: "0.68rem",
                      fontWeight: 900, color: isActive ? "#a371f7" : "#c9d1d9", marginBottom: 4,
                    }}>
                      {t.nombre_torneo || `${t.game} · ${t.mode?.replace(/_/g, " ")}`}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: "0.6rem", color: statusColor[t.status] || "#8b949e" }}>
                        ● {t.status}
                      </span>
                      <span style={{ fontSize: "0.6rem", color: "#8b949e" }}>
                        {t.players.length}/{t.capacity}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* ── Main: match management ── */}
          {!selected ? (
            <div style={{
              background: "#111318", border: "1px solid #1c2028", borderRadius: 14,
              padding: 48, textAlign: "center", color: "#6e7681",
            }}>
              <div style={{ fontSize: "2rem", marginBottom: 10 }}>🎙️</div>
              <p style={{ fontSize: "0.8rem" }}>Seleccioná un torneo para gestionarlo</p>
            </div>
          ) : (
            <div>
              {/* Tournament header */}
              <div style={{
                background: "#111318", border: "1px solid #1c2028",
                borderRadius: 14, padding: "15px 20px", marginBottom: 12,
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    {selected.nombre_torneo && (
                      <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: "0.9rem", fontWeight: 900, color: "#a371f7", marginBottom: 4 }}>
                        {selected.nombre_torneo}
                      </div>
                    )}
                    <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: "0.72rem", fontWeight: 700, color: "#6e7681" }}>
                      {selected.game} · {selected.mode?.replace(/_/g, " ")} · {selected.capacity}j
                    </div>
                  </div>
                  {selected.status === "OPEN" && (
                    <button
                      onClick={() => { setAddingPlayer(true); setSearchNick(""); setSearchResults([]); }}
                      style={{
                        background: "rgba(0,255,136,0.1)", border: "1px solid rgba(0,255,136,0.3)",
                        color: "#00ff88", fontFamily: "'Orbitron',sans-serif", fontWeight: 900,
                        fontSize: "0.62rem", padding: "6px 12px", borderRadius: 8, cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}>
                      ➕ AGREGAR JUGADOR
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: "0.72rem", color: "#8b949e" }}>
                  <span>Estado: <strong style={{ color: statusColor[selected.status] || "#c9d1d9" }}>{selected.status}</strong></span>
                  <span>Inscripción: <strong style={{ color: "#ffd700" }}>
                    {selected.entry_fee === 0 ? "GRATIS" : `🪙 ${selected.entry_fee.toLocaleString()}`}
                  </strong></span>
                  <span>Jugadores: <strong style={{ color: "#c9d1d9" }}>{selected.players.length}/{selected.capacity}</strong></span>
                  {selected.premio_externo && (
                    <span style={{ color: "#ffd700" }}>🏆 Premio externo</span>
                  )}
                </div>
                {selected.descripcion && (
                  <p style={{ marginTop: 8, fontSize: "0.72rem", color: "#8b949e", lineHeight: 1.5 }}>
                    {selected.descripcion}
                  </p>
                )}
              </div>

              {/* Players enrolled */}
              {selected.players.length > 0 && (
                <div style={{
                  background: "#111318", border: "1px solid #1c2028",
                  borderRadius: 14, padding: "13px 16px", marginBottom: 12,
                }}>
                  <div style={{
                    fontFamily: "'Orbitron',sans-serif", fontSize: "0.63rem",
                    color: "#6e7681", marginBottom: 10,
                  }}>
                    JUGADORES INSCRIPTOS ({selected.players.length}/{selected.capacity})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {selected.players.map(p => {
                      const u = users[p];
                      return (
                        <div key={p} style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "8px 12px", background: "#0b0e14",
                          border: "1px solid #1c2028", borderRadius: 10,
                        }}>
                          {u?.avatar_url ? (
                            <img src={u.avatar_url} alt="" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#1c2028", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>👤</div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: "0.75rem", color: "#c9d1d9" }}>{u?.nombre || p.slice(0, 8)}</div>
                            {u?.celular ? (
                              <a
                                href={`https://wa.me/${u.celular.replace(/\D/g, "")}`}
                                target="_blank" rel="noopener noreferrer"
                                style={{ fontSize: "0.62rem", color: "#25d366", textDecoration: "none" }}
                              >
                                📱 {u.celular}
                              </a>
                            ) : (
                              <span style={{ fontSize: "0.6rem", color: "#4a5568" }}>Sin WhatsApp registrado</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Active matches */}
              {activeMatches.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{
                    fontFamily: "'Orbitron',sans-serif", fontSize: "0.63rem",
                    color: "#ffd700", marginBottom: 8, padding: "0 2px",
                  }}>
                    ⚔️ PARTIDOS EN CURSO ({activeMatches.length})
                  </div>
                  {activeMatches.map(m => (
                    <MatchControl
                      key={m.id} match={m} users={users}
                      onAvanzar={pid  => avanzar(m.id, pid)}
                      onExpulsar={pid => expulsar(m.id, pid)}
                      onSustituir={pid => setSubTarget({ matchId: m.id, playerId: pid })}
                    />
                  ))}
                </div>
              )}

              {/* Finished matches */}
              {finishedMatches.length > 0 && (
                <div>
                  <div style={{
                    fontFamily: "'Orbitron',sans-serif", fontSize: "0.63rem",
                    color: "#6e7681", marginBottom: 8, padding: "0 2px",
                  }}>
                    ✅ PARTIDOS FINALIZADOS ({finishedMatches.length})
                  </div>
                  {finishedMatches.map(m => (
                    <MatchControl key={m.id} match={m} users={users} readOnly />
                  ))}
                </div>
              )}

              {/* No matches yet */}
              {matches.length === 0 && (
                <div style={{
                  background: "#111318", border: "1px solid #1c2028",
                  borderRadius: 14, padding: 36, textAlign: "center",
                  color: "#6e7681", fontSize: "0.8rem",
                }}>
                  <div style={{ fontSize: "1.5rem", marginBottom: 8 }}>⏳</div>
                  {selected.status === "OPEN"
                    ? `Esperando jugadores (${selected.players.length}/${selected.capacity}). Los partidos se crean al llenarse el cupo.`
                    : "No hay partidos registrados."}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Substitute modal ── */}
      {subTarget && (        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
          zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }}>
          <div style={{
            background: "#111318", border: "1px solid rgba(163,113,247,0.4)",
            borderRadius: 18, padding: 26, maxWidth: 420, width: "100%",
          }}>
            <div style={{
              fontFamily: "'Orbitron',sans-serif", color: "#a371f7",
              fontSize: "0.85rem", fontWeight: 900, marginBottom: 14,
            }}>
              🔄 SUSTITUIR JUGADOR
            </div>
            <p style={{ color: "#8b949e", fontSize: "0.75rem", marginBottom: 14 }}>
              Ingresá el UID del jugador de reemplazo.
            </p>
            <input
              value={subUid}
              onChange={e => setSubUid(e.target.value)}
              placeholder="UID del jugador sustituto"
              style={{
                width: "100%", background: "#0b0e14", border: "1px solid #30363d",
                color: "white", padding: "10px 12px", borderRadius: 8, outline: "none",
                fontFamily: "'Roboto',sans-serif", fontSize: "0.8rem", boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                onClick={() => { setSubTarget(null); setSubUid(""); }}
                style={{
                  flex: 1, background: "#1c2028", border: "1px solid #30363d",
                  color: "#8b949e", padding: "10px", borderRadius: 8, cursor: "pointer",
                  fontFamily: "'Orbitron',sans-serif", fontSize: "0.65rem",
                }}>
                CANCELAR
              </button>
              <button
                onClick={sustituir}
                disabled={!subUid.trim()}
                style={{
                  flex: 1, background: "#a371f7", border: "none", color: "white",
                  padding: "10px", borderRadius: 8, cursor: subUid.trim() ? "pointer" : "default",
                  fontFamily: "'Orbitron',sans-serif", fontSize: "0.65rem", fontWeight: 900,
                  opacity: subUid.trim() ? 1 : 0.5,
                }}>
                CONFIRMAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Player modal ── */}
      {addingPlayer && selected && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)",
          zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }}>
          <div style={{
            background: "#111318", border: "1px solid rgba(0,255,136,0.4)",
            borderRadius: 18, padding: 26, maxWidth: 460, width: "100%",
          }}>
            <div style={{ fontFamily: "'Orbitron',sans-serif", color: "#00ff88", fontSize: "0.85rem", fontWeight: 900, marginBottom: 6 }}>
              ➕ AGREGAR JUGADOR
            </div>
            <p style={{ color: "#8b949e", fontSize: "0.72rem", marginBottom: 14 }}>
              Buscá por nick exacto del jugador para agregarlo directamente al torneo (sin pago).
            </p>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                value={searchNick}
                onChange={e => setSearchNick(e.target.value)}
                onKeyDown={e => e.key === "Enter" && searchPlayer()}
                placeholder="Nick exacto del jugador..."
                style={{
                  flex: 1, background: "#0b0e14", border: "1px solid #30363d",
                  color: "white", padding: "10px 12px", borderRadius: 8, outline: "none",
                  fontFamily: "'Roboto',sans-serif", fontSize: "0.8rem", boxSizing: "border-box" as const,
                }}
              />
              <button
                onClick={searchPlayer}
                disabled={searchLoading || !searchNick.trim()}
                style={{
                  background: "rgba(0,255,136,0.15)", border: "1px solid rgba(0,255,136,0.4)",
                  color: "#00ff88", padding: "10px 16px", borderRadius: 8, cursor: "pointer",
                  fontFamily: "'Orbitron',sans-serif", fontSize: "0.65rem", fontWeight: 900,
                  opacity: searchLoading || !searchNick.trim() ? 0.5 : 1,
                }}>
                {searchLoading ? "⏳" : "🔍 BUSCAR"}
              </button>
            </div>
            {searchResults.map(r => (
              <div key={r.uid} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                background: "#0b0e14", border: "1px solid #1c2028", borderRadius: 10, marginBottom: 8,
              }}>
                {r.avatar_url ? (
                  <img src={r.avatar_url} alt="" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#1c2028", display: "flex", alignItems: "center", justifyContent: "center" }}>👤</div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: "0.78rem", color: "#c9d1d9" }}>{r.nombre}</div>
                  {r.celular && <div style={{ fontSize: "0.62rem", color: "#25d366" }}>📱 {r.celular}</div>}
                </div>
                <button
                  onClick={() => addPlayer(r.uid)}
                  style={{
                    background: "#00ff88", border: "none", color: "#0b0e14",
                    padding: "7px 14px", borderRadius: 8, cursor: "pointer",
                    fontFamily: "'Orbitron',sans-serif", fontSize: "0.62rem", fontWeight: 900,
                  }}>
                  AGREGAR
                </button>
              </div>
            ))}
            {searchResults.length === 0 && searchNick && !searchLoading && (
              <p style={{ color: "#6e7681", fontSize: "0.72rem", textAlign: "center" }}>Sin resultados. El nick debe ser exacto.</p>
            )}
            <button
              onClick={() => { setAddingPlayer(false); setSearchNick(""); setSearchResults([]); }}
              style={{
                marginTop: 8, width: "100%", background: "#1c2028", border: "1px solid #30363d",
                color: "#8b949e", padding: "10px", borderRadius: 8, cursor: "pointer",
                fontFamily: "'Orbitron',sans-serif", fontSize: "0.65rem",
              }}>
              CANCELAR
            </button>
          </div>
        </div>
      )}

      {/* ── Create tournament modal ── */}
      {showCreate && uid && (
        <CreateModal
          uid={uid}
          onClose={() => setShowCreate(false)}
          onCreated={t => { setSelected(t); setShowCreate(false); }}
        />
      )}

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@900&display=swap');`}</style>
    </div>
  );
}

// ─── MatchControl ─────────────────────────────────────────────────────────────

interface MatchControlProps {
  match:        Match;
  users:        Record<string, UserInfo>;
  onAvanzar?:   (pid: string) => void;
  onExpulsar?:  (pid: string) => void;
  onSustituir?: (pid: string) => void;
  readOnly?:    boolean;
}

function MatchControl({ match: m, users, onAvanzar, onExpulsar, onSustituir, readOnly }: MatchControlProps) {
  const getName = (pid: string) =>
    pid === "TBD" ? "TBD" : (users[pid]?.nombre ?? m.p1_username ?? pid.slice(0, 8));

  const players = [m.p1, m.p2].filter(p => p && p !== "TBD");

  return (
    <div style={{
      background: "#161b22", border: "1px solid #1c2028",
      borderRadius: 12, padding: "13px 15px", marginBottom: 8,
    }}>
      {/* Round + status */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: "0.58rem", color: "#6e7681" }}>
          {(m.round ?? "RONDA").replace(/_/g, " ").toUpperCase()}
        </span>
        <span style={{
          fontSize: "0.58rem", fontFamily: "'Orbitron',sans-serif",
          color: m.status === "FINISHED" ? "#00ff88" : m.status === "DISPUTE" ? "#ff4757" : "#ffd700",
        }}>
          {m.status}
        </span>
      </div>

      {/* Screenshot */}
      {m.screenshot_url && (
        <div style={{ marginBottom: 10 }}>
          <a href={m.screenshot_url} target="_blank" rel="noopener noreferrer">
            <img
              src={m.screenshot_url} alt="Resultado"
              style={{
                width: "100%", maxHeight: 200, objectFit: "contain",
                borderRadius: 8, border: "1px solid #30363d", cursor: "pointer",
              }}
            />
          </a>
          <div style={{ fontSize: "0.6rem", color: "#6e7681", marginTop: 4, textAlign: "center" }}>
            📸 Captura del jugador — clic para ampliar
          </div>
        </div>
      )}

      {/* Players */}
      {players.map((pid, i) => {
        const isWinner = m.winner === pid;
        return (
          <div key={pid} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "7px 0",
            borderTop: i === 0 ? "none" : "1px solid #1c2028",
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
              background: isWinner ? "#00ff88" : m.status === "FINISHED" ? "#ff4757" : "#6e7681",
            }} />
            <div style={{ flex: 1, fontSize: "0.78rem", fontWeight: 700, color: isWinner ? "#00ff88" : "#c9d1d9" }}>
              {getName(pid)}
              {isWinner && <span style={{ marginLeft: 6, fontSize: "0.62rem" }}>🏆</span>}
            </div>
            {!readOnly && m.status !== "FINISHED" && (
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => onAvanzar?.(pid)} style={actionBtn("#00ff88")}>✓ Avanzar</button>
                <button onClick={() => onExpulsar?.(pid)} style={actionBtn("#ff4757")}>🚫 Expulsar</button>
                <button onClick={() => onSustituir?.(pid)} style={actionBtn("#a371f7")}>🔄 Sust.</button>
              </div>
            )}
          </div>
        );
      })}

      {m.score && (
        <div style={{
          marginTop: 8, fontSize: "0.72rem", color: "#ffd700",
          textAlign: "center", fontFamily: "'Orbitron',sans-serif", fontWeight: 900,
        }}>
          {m.score}
        </div>
      )}
    </div>
  );
}

function actionBtn(color: string): React.CSSProperties {
  return {
    background: color + "18",
    border:     `1px solid ${color}40`,
    color,
    padding:    "4px 8px",
    borderRadius: 6,
    cursor:     "pointer",
    fontSize:   "0.6rem",
    fontWeight: 700,
    whiteSpace: "nowrap",
  };
}

// ─── CreateModal ──────────────────────────────────────────────────────────────

interface CreateModalProps {
  uid:       string;
  onClose:   () => void;
  onCreated: (t: Tournament) => void;
}

const GAME_MODES: Record<string, string[]> = {
  FC26:      ["GENERAL_95", "ULTIMATE"],
  EFOOTBALL: ["DREAM_TEAM", "GENUINOS"],
};

function CreateModal({ uid, onClose, onCreated }: CreateModalProps) {
  const [form, setForm] = useState({
    nombre_torneo:      "",
    game:               "FC26",
    mode:               "GENERAL_95",
    region:             "LATAM_SUR",
    capacity:           8,
    entry_fee:          0,
    descripcion:        "",
    tipo_premio:        "coins" as "coins" | "usd" | "puntos" | "otro",
    premio_monto:       0,
    premio_moneda:      "",
    premio_externo:     false,
    premio_descripcion: "",
  });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const set = (k: string, v: unknown) => setForm(p => ({ ...p, [k]: v }));

  const submit = async () => {
    setLoading(true); setError("");
    try {
      const token = await auth.currentUser!.getIdToken();
      const res = await fetch("/api/organizer/create", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al crear torneo");
      const tSnap = await getDoc(doc(db, "tournaments", data.tournamentId));
      if (tSnap.exists()) onCreated({ id: tSnap.id, ...tSnap.data() } as Tournament);
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)",
      zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, overflowY: "auto",
    }}>
      <div style={{
        background: "#111318", border: "1px solid rgba(163,113,247,0.4)",
        borderRadius: 20, padding: 28, maxWidth: 520, width: "100%",
      }}>
        <div style={{
          fontFamily: "'Orbitron',sans-serif", color: "#a371f7",
          fontSize: "0.9rem", fontWeight: 900, marginBottom: 20,
        }}>
          ＋ CREAR TORNEO ORGANIZADO
        </div>

        {/* Tournament name */}
        <Field label="NOMBRE DEL TORNEO (opcional)">
          <input
            value={form.nombre_torneo}
            onChange={e => set("nombre_torneo", e.target.value.slice(0, 80))}
            placeholder="Ej: Copa Deportivo La Luz · Agosto 2025"
            style={{ ...sel(), outline: "none" }}
          />
        </Field>

        {/* Game */}
        <Field label="JUEGO">
          <div style={{ display: "flex", gap: 8 }}>
            {["FC26", "EFOOTBALL"].map(g => (
              <button key={g}
                onClick={() => { set("game", g); set("mode", GAME_MODES[g][0]); }}
                style={pill(form.game === g)}>
                {g}
              </button>
            ))}
          </div>
        </Field>

        {/* Mode */}
        <Field label="MODO">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {GAME_MODES[form.game].map(m => (
              <button key={m} onClick={() => set("mode", m)} style={pill(form.mode === m)}>
                {m.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </Field>

        {/* Region */}
        <Field label="REGIÓN">
          <select value={form.region} onChange={e => set("region", e.target.value)} style={sel()}>
            {["LATAM_SUR", "LATAM_NORTE", "AMERICA", "EUROPA", "GLOBAL"].map(r => (
              <option key={r} value={r}>{r.replace(/_/g, " ")}</option>
            ))}
          </select>
        </Field>

        {/* Capacity + fee */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <Field label="CUPOS" inline>
            <select value={form.capacity} onChange={e => set("capacity", Number(e.target.value))} style={sel()}>
              {[2, 4, 8, 16, 32].map(n => (
                <option key={n} value={n}>{n} jugadores</option>
              ))}
            </select>
          </Field>
          <Field label="INSCRIPCIÓN (LFC)" inline>
            <input
              type="number" min={0} value={form.entry_fee}
              onChange={e => set("entry_fee", Math.max(0, Number(e.target.value)))}
              style={{ ...sel(), outline: "none" }}
            />
          </Field>
        </div>

        {/* Description */}
        <Field label="DESCRIPCIÓN (opcional)">
          <textarea
            value={form.descripcion}
            onChange={e => set("descripcion", e.target.value.slice(0, 280))}
            rows={2}
            placeholder="Ej: Torneo del stream. ¡Todos bienvenidos!"
            style={{ ...sel(), resize: "vertical" as const }}
          />
        </Field>

        {/* Prize type */}
        <Field label="TIPO DE PREMIO">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {([
              { v: "coins",  label: "🪙 LFA Coins" },
              { v: "puntos", label: "⭐ Puntos Tienda" },
              { v: "usd",    label: "💵 USD" },
              { v: "otro",   label: "🏆 Moneda Local" },
            ] as const).map(({ v, label }) => (
              <button key={v} onClick={() => set("tipo_premio", v)} style={pill(form.tipo_premio === v)}>
                {label}
              </button>
            ))}
          </div>
        </Field>
        {(form.tipo_premio === "usd" || form.tipo_premio === "otro") && (
          <div style={{ display: "grid", gridTemplateColumns: form.tipo_premio === "otro" ? "1fr 1fr" : "1fr", gap: 12, marginBottom: 14 }}>
            <Field label="MONTO DEL PREMIO" inline>
              <input
                type="number" min={0} value={form.premio_monto}
                onChange={e => set("premio_monto", Math.max(0, Number(e.target.value)))}
                placeholder="Ej: 50"
                style={{ ...sel(), outline: "none" }}
              />
            </Field>
            {form.tipo_premio === "otro" && (
              <Field label="MONEDA" inline>
                <input
                  value={form.premio_moneda}
                  onChange={e => set("premio_moneda", e.target.value.slice(0, 20))}
                  placeholder="Ej: ARS, PEN, CLP…"
                  style={{ ...sel(), outline: "none" }}
                />
              </Field>
            )}
          </div>
        )}
        {(form.tipo_premio === "usd" || form.tipo_premio === "otro" || form.tipo_premio === "puntos") && (
          <Field label="DESCRIPCIÓN DEL PREMIO (opcional)">
            <input
              value={form.premio_descripcion}
              onChange={e => set("premio_descripcion", e.target.value.slice(0, 200))}
              placeholder="Ej: Gift card para el campeón"
              style={{ ...sel(), outline: "none" }}
            />
          </Field>
        )}

        {error && (
          <div style={{ color: "#ff4757", fontSize: "0.75rem", marginBottom: 12 }}>❌ {error}</div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose}
            style={{
              flex: 1, background: "#1c2028", border: "1px solid #30363d", color: "#8b949e",
              padding: "11px", borderRadius: 8, cursor: "pointer",
              fontFamily: "'Orbitron',sans-serif", fontSize: "0.65rem",
            }}>
            CANCELAR
          </button>
          <button onClick={submit} disabled={loading}
            style={{
              flex: 1, background: "#a371f7", border: "none", color: "white",
              padding: "11px", borderRadius: 8, cursor: "pointer",
              fontFamily: "'Orbitron',sans-serif", fontSize: "0.65rem",
              fontWeight: 900, opacity: loading ? 0.7 : 1,
            }}>
            {loading ? "⏳ CREANDO..." : "✅ CREAR TORNEO"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tiny style helpers ───────────────────────────────────────────────────────

function Field({ label, children, inline }: { label: string; children: React.ReactNode; inline?: boolean }) {
  return (
    <div style={{ marginBottom: inline ? 0 : 14 }}>
      <label style={{
        display: "block", fontSize: "0.65rem", color: "#8b949e",
        marginBottom: 5, fontFamily: "'Orbitron',sans-serif",
      }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function pill(active: boolean): React.CSSProperties {
  return {
    background:   active ? "rgba(163,113,247,0.2)" : "#0b0e14",
    border:       `1px solid ${active ? "rgba(163,113,247,0.6)" : "#30363d"}`,
    color:        active ? "#a371f7" : "#8b949e",
    padding:      "7px 14px",
    borderRadius: 8,
    cursor:       "pointer",
    fontSize:     "0.72rem",
    fontWeight:   active ? 700 : 400,
    transition:   "0.15s",
  };
}

function sel(): React.CSSProperties {
  return {
    width:        "100%",
    background:   "#0b0e14",
    border:       "1px solid #30363d",
    color:        "white",
    padding:      "9px 12px",
    borderRadius: 8,
    fontSize:     "0.8rem",
    boxSizing:    "border-box" as const,
  };
}

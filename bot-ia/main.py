from firebase_functions import firestore_fn
import firebase_admin
from firebase_admin import firestore
from google.cloud import vision
import re

# ─────────────────────────────────────────────────────────────
# INICIALIZACIÓN (una sola vez en la nube)
# ─────────────────────────────────────────────────────────────
if not firebase_admin._apps:
    firebase_admin.initialize_app()

db = firestore.client()


# ─────────────────────────────────────────────────────────────
# FUNCIÓN PRINCIPAL: procesarArbitrajeNube
# Escucha nuevos documentos en reportes_ia/
# Se activa tanto para 1vs1 (sala.html) como para CO-OP (salacoop.html)
# ─────────────────────────────────────────────────────────────
@firestore_fn.on_document_created(document="reportes_ia/{reporteId}")
def procesar_arbitraje_nube(
    event: firestore_fn.Event[firestore_fn.DocumentSnapshot | None]
) -> None:

    if event.data is None:
        return

    data = event.data.to_dict()

    # Solo procesar reportes en estado "procesando"
    if data.get("estado") != "procesando":
        return

    # ── Datos comunes ──
    t_id         = data.get("torneo_id", "")
    u_id         = data.get("jugador_uid", "")
    nombre       = data.get("jugador_nombre", "").upper().strip()
    imagen_url   = data.get("imagen_url", "")
    es_coop      = data.get("es_coop", False)
    dupla_id     = data.get("dupla_id")
    rival_dupla_id = data.get("rival_dupla_id")

    # Nombres de los 4 jugadores (enviados desde salacoop.html)
    mi_j1_nombre     = data.get("mi_jugador1_nombre", nombre).upper().strip()
    mi_j2_nombre     = data.get("mi_jugador2_nombre", "").upper().strip()
    rival_j1_nombre  = data.get("rival_jugador1_nombre", "").upper().strip()
    rival_j2_nombre  = data.get("rival_jugador2_nombre", "").upper().strip()

    print(f"⚽ VAR analizando {'CO-OP' if es_coop else '1VS1'}: {nombre} | torneo={t_id}")

    try:
        torneo_ref = db.collection("torneos").document(t_id)
        torneo_doc = torneo_ref.get()

        if not torneo_doc.exists:
            print(f"❌ Torneo {t_id} no encontrado.")
            event.data.reference.update({"estado": "error", "marcador_leido": "Torneo no encontrado"})
            return

        t_data            = torneo_doc.to_dict()
        juego_torneo      = t_data.get("juego", "").lower()
        plataforma_torneo = t_data.get("plataforma", "").lower()
        cupos             = t_data.get("cupos_totales", 4)
        costo             = t_data.get("costo_inscripcion", 0)
        premio_total      = costo * cupos

        chat_ref = torneo_ref.collection("mensajes")

        # ── Si no hay nombres de compañero, buscarlos en Firestore ──
        if es_coop and not mi_j2_nombre:
            mi_j1_nombre, mi_j2_nombre, rival_j1_nombre, rival_j2_nombre = (
                _buscar_nombres_dupla(t_data, u_id, dupla_id, rival_dupla_id)
            )

        # ─────────────────────────────────────────────────────────
        # 👁️  ANÁLISIS DE IA
        # ─────────────────────────────────────────────────────────
        fraude         = False
        motivo_fraude  = ""
        marcador       = "Victoria Validada"
        mis_goles      = -1
        rival_goles    = -1

        if not imagen_url:
            fraude = True
            motivo_fraude = "⚠️ FRAUDE: No se adjuntó imagen."
        else:
            try:
                print("👁️ Google Vision escaneando...")
                client = vision.ImageAnnotatorClient()
                image  = vision.Image()
                image.source.image_uri = imagen_url

                response = client.text_detection(image=image)
                texts    = response.text_annotations

                if not texts:
                    fraude = True
                    motivo_fraude = "Imagen vacía o ilegible. Subí con mejor calidad."
                else:
                    texto_full  = texts[0].description.lower()
                    texto_clean = re.sub(r"[_@#\-\.]", " ", texto_full)

                    # Lógica básica para detectar palabras clave de edición o fraude
                    palabras_prohibidas = ["photoshop", "edit", "modded", "cheat"]
                    for p in palabras_prohibidas:
                        if p in texto_full:
                            fraude = True
                            motivo_fraude = f"⚠️ FRAUDE: Se detectó posible edición ({p})."
                            break

                    # Extraer división si es aplicable
                    division = None
                    match = re.search(r'divisi[oó]n\s*(\d+)', texto_full)
                    if match:
                        division = int(match.group(1))
                    else:
                        match = re.search(r'div\s*(\d+)', texto_full)
                        if match:
                            division = int(match.group(1))
                    
                    if division:
                        print(f"División detectada: {division}")
                        # Aquí podrías guardar la división en el usuario si lo deseas
                        # db.collection("usuarios").document(u_id).update({"division_efootball": division})

                    # ── 1. ANTI-TRAMPA: JUEGO CORRECTO ──
                    palabras_ef = [
                        "efootball", "konami", "jugadas destacadas",
                        "club de futbol", "estilo de juego", "madrid chamartin",
                    ]
                    palabras_fc = [
                        "ea sports", "ultimate team", "fc 26", "fifa",
                        "resumen del partido", "valoración del partido",
                    ]

                    if "efootball" in juego_torneo:
                        if any(p in texto_full for p in palabras_fc):
                            fraude = True
                            motivo_fraude = "⚠️ FRAUDE: Captura de FC 26 en torneo de eFootball."
                    elif any(x in juego_torneo for x in ("fc 26", "fc", "fifa")):
                        if any(p in texto_full for p in palabras_ef):
                            fraude = True
                            motivo_fraude = "⚠️ FRAUDE: Captura de eFootball en torneo de FC 26."

                    # ── 2. ANTI-TRAMPA: DERROTA ──
                    if not fraude:
                        palabras_derrota = [
                            "derrota", "perdiste", "defeat", "lose",
                            "abandono", "you lose", "desconectado",
                        ]
                        if any(p in texto_full for p in palabras_derrota):
                            fraude = True
                            motivo_fraude = "⚠️ FRAUDE: La captura muestra una DERROTA. Solo el ganador sube el resultado."

                    # ── 3. ANTI-TRAMPA: IDENTIDAD ──
                    # Para CO-OP: aceptamos si aparece al menos uno de los 2 IDs propios
                    # (eFootball a veces trunca el nombre en pantalla)
                    if not fraude:
                        def normalizar(s):
                            return s.lower().replace("_", " ").replace("-", " ").strip()

                        nombres_a_buscar = [mi_j1_nombre, mi_j2_nombre] if es_coop else [mi_j1_nombre]
                        nombres_a_buscar = [normalizar(n) for n in nombres_a_buscar if n]

                        encontro_identidad = False
                        for nm in nombres_a_buscar:
                            # Búsqueda exacta O parcial (mínimo 5 caracteres del ID)
                            if nm in texto_clean:
                                encontro_identidad = True
                                break
                            partes = [p for p in nm.split() if len(p) >= 5]
                            if any(p in texto_clean for p in partes):
                                encontro_identidad = True
                                break

                        if not encontro_identidad:
                            ids_str = " / ".join(nombres_a_buscar)
                            fraude = True
                            motivo_fraude = (
                                f"⚠️ FRAUDE: Ningún ID de tu dupla ({ids_str.upper()}) "
                                f"aparece en la imagen. ¿Subiste una foto vieja?"
                            )

                    # ── 4. LECTURA DE MARCADOR ──
                    if not fraude:
                        mis_goles, rival_goles, marcador = _leer_marcador(
                            texto_full, texto_clean, mi_j1_nombre, rival_j1_nombre
                        )

                        if mis_goles == -1:
                            # No se detectó marcador — para CO-OP en eFootball es común
                            # intentar con texto más limpio antes de rechazar
                            fraude = True
                            motivo_fraude = (
                                "⚠️ No se detectó un marcador claro. "
                                "Para eFootball CO-OP: capturá la pantalla de resultados "
                                "de la sala mostrando el marcador (Ej: 3 - 0). "
                                "Para FC 26: capturá 'Resumen del Partido'."
                            )
                        elif mis_goles == rival_goles:
                            fraude = True
                            motivo_fraude = (
                                f"❌ EMPATE ({marcador}). Definan por Penales "
                                f"y suban el resultado final."
                            )
                        elif mis_goles < rival_goles:
                            fraude = True
                            motivo_fraude = (
                                f"❌ El marcador ({marcador}) indica que perdiste. "
                                f"Solo el GANADOR sube el resultado."
                            )

            except Exception as vision_err:
                print(f"Vision API error: {vision_err}")
                fraude = True
                motivo_fraude = "❌ Error del sistema de IA. El Staff revisará manualmente."

        # ─────────────────────────────────────────────────────────
        # 🛡️  RESULTADO FRAUDE → Penalizar y alertar
        # ─────────────────────────────────────────────────────────
        if fraude:
            event.data.reference.update({"estado": "fraude", "marcador_leido": motivo_fraude})

            # Penalizar Fair Play
            try:
                db.collection("usuarios").document(u_id).update(
                    {"fair_play": firestore.INCREMENT(-15)}
                )
            except Exception:
                pass

            chat_ref.add({
                "autorId": "BOT",
                "autorNombre": "🤖 VAR LFA",
                "tipo": "alerta",
                "texto": f"🚨 ANÁLISIS RECHAZADO: {motivo_fraude}<br><b>(-15% Fair Play)</b>",
                "timestamp": firestore.SERVER_TIMESTAMP,
            })
            return

        # ─────────────────────────────────────────────────────────
        # ✅  RESULTADO VÁLIDO → Actualizar torneo y premios
        # ─────────────────────────────────────────────────────────
        event.data.reference.update({"estado": "aprobado", "marcador_leido": marcador})

        # Campos de ranking por categoría
        campo_cat = _campo_categoria(juego_torneo, plataforma_torneo, es_coop)

        if es_coop:
            _procesar_resultado_coop(
                t_data, torneo_ref, chat_ref,
                u_id, nombre, mi_j1_nombre, mi_j2_nombre,
                dupla_id, rival_dupla_id,
                marcador, campo_cat, premio_total, cupos
            )
        else:
            _procesar_resultado_1vs1(
                t_data, torneo_ref, chat_ref,
                u_id, nombre, marcador, campo_cat, premio_total, cupos
            )

    except Exception as e:
        print(f"❌ Error crítico: {e}")
        try:
            event.data.reference.update({"estado": "error", "marcador_leido": "Error interno."})
        except Exception:
            pass


# ─────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────

def _buscar_nombres_dupla(t_data, u_id, dupla_id, rival_dupla_id):
    """Busca los 4 nombres en duplas_sorteadas o equipos_draft."""
    mi_j1 = mi_j2 = rival_j1 = rival_j2 = ""

    duplas = t_data.get("duplas_sorteadas", [])
    for d in duplas:
        j1 = d.get("jugador1", {})
        j2 = d.get("jugador2", {})
        if d.get("id") == dupla_id or j1.get("uid") == u_id or j2.get("uid") == u_id:
            mi_j1 = (j1.get("nombre") or "").upper()
            mi_j2 = (j2.get("nombre") or "").upper()
        elif d.get("id") == rival_dupla_id:
            rival_j1 = (j1.get("nombre") or "").upper()
            rival_j2 = (j2.get("nombre") or "").upper()

    # Fallback: equipos_draft (formato CEO)
    if not mi_j1:
        drafts = t_data.get("equipos_draft", {})
        for eq in drafts.values():
            p1 = eq.get("p1", "")
            p2 = eq.get("p2", "")
            if p1 == u_id or p2 == u_id:
                mi_j1 = (eq.get("p1_nombre") or "").upper()
                mi_j2 = (eq.get("p2_nombre") or "").upper()
            else:
                rival_j1 = (eq.get("p1_nombre") or "").upper()
                rival_j2 = (eq.get("p2_nombre") or "").upper()

    return mi_j1, mi_j2, rival_j1, rival_j2


def _leer_marcador(texto_full, texto_clean, mi_nombre, rival_nombre):
    """
    Extrae el marcador de la imagen.
    Retorna (mis_goles, rival_goles, marcador_str).
    Si no se detecta, retorna (-1, -1, '').
    """
    # Patrones de marcador: "3 - 2", "3:2", "3–2", "3 2" cerca de palabras clave
    patrones = [
        r"\b(\d{1,2})\s*[-:–]\s*(\d{1,2})\b",   # 3-0, 3:0, 3–0
        r"\b(\d{1,2})\s*\|\s*(\d{1,2})\b",        # 3|0
        r"(\d{1,2})\s*\n\s*(\d{1,2})",            # 3\n0 (columnas)
    ]

    candidatos = []
    for pat in patrones:
        for m in re.finditer(pat, texto_full):
            a, b = int(m.group(1)), int(m.group(2))
            if a <= 20 and b <= 20:
                candidatos.append((a, b, m.start()))

    if not candidatos:
        # Fallback: dos números sueltos en contexto de victoria
        contexto_victoria = ["victoria", "win", "ganaste", "you win", "winner", "resultado final"]
        if any(c in texto_full for c in contexto_victoria):
            nums = [int(n) for n in re.findall(r"\b(\d{1,2})\b", texto_full) if int(n) <= 20]
            if len(nums) >= 2:
                candidatos.append((nums[0], nums[1], 0))

    if not candidatos:
        return -1, -1, ""

    # Tomar el candidato más cercano al inicio (suele ser el marcador principal)
    # o el último si hay varios (eFootball muestra el resultado al final)
    a, b, _ = candidatos[-1]

    # Determinar cuál es "mis goles" según posición del nombre en el texto
    mi_pos    = texto_clean.find(mi_nombre.lower().replace("_", " ")) if mi_nombre else -1
    rival_pos = texto_clean.find(rival_nombre.lower().replace("_", " ")) if rival_nombre else -1

    mis_goles   = a
    rival_goles = b

    # Si el rival aparece ANTES que yo en el texto → sus goles están primero
    if rival_pos != -1 and mi_pos != -1 and rival_pos < mi_pos:
        mis_goles   = b
        rival_goles = a

    marcador = f"{mis_goles} - {rival_goles}"
    return mis_goles, rival_goles, marcador


def _campo_categoria(juego, plataforma, es_coop):
    if "mobile" in plataforma:
        return "titulos_mobile"
    if es_coop:
        return "titulos_coop"
    if any(x in juego for x in ("fc 26", "fc", "fifa")):
        return "titulos_fc26"
    if "efootball" in juego:
        return "titulos_efootball"
    if "crossplay" in plataforma:
        return "titulos_crossplay"
    return "titulos_otros"


def _acreditar_premios_usuario(u_id, premio, campo_cat):
    """Incrementa coins, títulos y categoría del ganador."""
    updates = {"titulos": firestore.INCREMENT(1)}
    if premio > 0:
        updates["number"] = firestore.INCREMENT(premio)
    if campo_cat:
        updates[campo_cat] = firestore.INCREMENT(1)
    updates["partidos_ganados"] = firestore.INCREMENT(1)
    updates["partidos_jugados"] = firestore.INCREMENT(1)
    updates["fair_play"]        = firestore.INCREMENT(2)
    db.collection("usuarios").document(u_id).update(updates)


def _procesar_resultado_1vs1(
    t_data, torneo_ref, chat_ref,
    u_id, nombre, marcador, campo_cat, premio_total, cupos
):
    """Lógica de resultados para torneos 1vs1 o 2 jugadores."""
    if cupos <= 2:
        _acreditar_premios_usuario(u_id, premio_total, campo_cat)
        torneo_ref.update({
            "ganador_final": u_id,
            "estado": "finalizado_premios",
            "marcador_final": marcador,
            "campeon_nombre": nombre,
        })
        chat_ref.add({
            "autorId": "BOT", "autorNombre": "🤖 LFA BOT", "tipo": "sistema",
            "texto": (
                f"✅ <b>MARCADOR VALIDADO: {marcador}</b><br>"
                f"⚽ ¡{nombre} se lleva la victoria! Premio acreditado en la billetera."
            ),
            "timestamp": firestore.SERVER_TIMESTAMP,
        })
    else:
        ronda2 = t_data.get("llaves_ronda2", [])
        if u_id not in ronda2 and len(ronda2) < 2:
            ronda2.append(u_id)
            torneo_ref.update({"llaves_ronda2": ronda2, "marcador_semis": marcador})
            chat_ref.add({
                "autorId": "BOT", "autorNombre": "🤖 LFA BOT", "tipo": "sistema",
                "texto": (
                    f"✅ <b>RESULTADO VALIDADO: {marcador}</b><br>"
                    f"🔥 ¡{nombre} avanza a la siguiente ronda!"
                ),
                "timestamp": firestore.SERVER_TIMESTAMP,
            })
        elif u_id in ronda2:
            _acreditar_premios_usuario(u_id, premio_total, campo_cat)
            torneo_ref.update({
                "ganador_final": u_id,
                "estado": "finalizado_premios",
                "marcador_final": marcador,
                "campeon_nombre": nombre,
            })
            chat_ref.add({
                "autorId": "BOT", "autorNombre": "🤖 LFA BOT", "tipo": "sistema",
                "texto": (
                    f"🏆 <b>¡TENEMOS CAMPEÓN!</b><br>"
                    f"🥇 {nombre} gana con {marcador}. Premio transferido."
                ),
                "timestamp": firestore.SERVER_TIMESTAMP,
            })


def _procesar_resultado_coop(
    t_data, torneo_ref, chat_ref,
    u_id, nombre, mi_j1_nombre, mi_j2_nombre,
    dupla_id, rival_dupla_id,
    marcador, campo_cat, premio_total, cupos
):
    """
    Lógica de resultados para CO-OP 2vs2.
    El premio se reparte entre los 2 jugadores de la dupla ganadora.
    Actualiza el bracket (campo bracket en Firestore) o el campo ganador_final.
    """
    duplas        = t_data.get("duplas_sorteadas", [])
    bracket       = t_data.get("bracket", [])
    equipos_draft = t_data.get("equipos_draft", {})

    # Encontrar UIDs de los jugadores de mi dupla
    uid_j1 = u_id
    uid_j2 = None

    # Buscar en duplas_sorteadas
    for d in duplas:
        j1 = d.get("jugador1", {})
        j2 = d.get("jugador2", {})
        if d.get("id") == dupla_id or j1.get("uid") == u_id or j2.get("uid") == u_id:
            uid_j1 = j1.get("uid") or u_id
            uid_j2 = j2.get("uid")
            break

    # Fallback: equipos_draft
    if not uid_j2 and equipos_draft:
        for eq in equipos_draft.values():
            if eq.get("p1") == u_id or eq.get("p2") == u_id:
                uid_j1 = eq.get("p1") or u_id
                uid_j2 = eq.get("p2")
                break

    premio_por_jugador = premio_total // 2 if premio_total > 0 else 0

    # ── Determinar si hay bracket con rondas o es directo ──
    # Si el bracket tiene más de 1 partido pendiente, avanzar ganador
    # Si es la final (1 partido o ganador_final vacío), acreditar premio

    partidos_totales = sum(len(ronda) for ronda in bracket)
    ganador_actual   = t_data.get("ganador_final")
    ronda_coop       = t_data.get("ronda_coop_actual", 1)
    ganadores_ronda  = t_data.get(f"ganadores_ronda_{ronda_coop}", [])

    es_final_directa = partidos_totales <= 1 or cupos <= 4

    nombre_dupla = f"{mi_j1_nombre} / {mi_j2_nombre}" if mi_j2_nombre else mi_j1_nombre

    if es_final_directa or dupla_id not in (t_data.get("ganadores_ronda_1", [])):
        # Registrar avance de ronda o victoria final
        if not ganador_actual:
            # Acreditar premios a ambos jugadores
            _acreditar_premios_usuario(uid_j1, premio_por_jugador, campo_cat)
            if uid_j2:
                _acreditar_premios_usuario(uid_j2, premio_por_jugador, campo_cat)

            # Actualizar copa del equipo
            if dupla_id:
                try:
                    db.collection("equipos_coop").document(uid_j1).update(
                        {"copas": firestore.INCREMENT(1), "ganancias": firestore.INCREMENT(premio_por_jugador)}
                    )
                except Exception:
                    pass

            torneo_ref.update({
                "ganador_final": dupla_id or uid_j1,
                "estado": "finalizado_premios",
                "marcador_final": marcador,
                "campeon_nombre": nombre_dupla,
            })

            chat_ref.add({
                "autorId": "BOT", "autorNombre": "🤖 LFA BOT", "tipo": "sistema",
                "texto": (
                    f"🏆 <b>¡TENEMOS CAMPEONES CO-OP!</b><br>"
                    f"🥇 <b>{nombre_dupla}</b> gana con marcador <b>{marcador}</b>.<br>"
                    f"💰 Premio acreditado a los dos integrantes de la dupla."
                ),
                "timestamp": firestore.SERVER_TIMESTAMP,
            })
        else:
            # Ronda intermedia: registrar ganador y avisar
            ganadores_ronda.append(dupla_id or uid_j1)
            torneo_ref.update({
                f"ganadores_ronda_{ronda_coop}": ganadores_ronda,
                f"marcador_ronda_{ronda_coop}": marcador,
            })
            chat_ref.add({
                "autorId": "BOT", "autorNombre": "🤖 LFA BOT", "tipo": "sistema",
                "texto": (
                    f"✅ <b>RESULTADO VALIDADO: {marcador}</b><br>"
                    f"🔥 ¡<b>{nombre_dupla}</b> avanza a la siguiente ronda del bracket CO-OP!"
                ),
                "timestamp": firestore.SERVER_TIMESTAMP,
            })
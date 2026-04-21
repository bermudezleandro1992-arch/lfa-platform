const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const crypto = require("crypto"); 
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const vision = require('@google-cloud/vision');

// Inicializamos Firebase Admin SIN duplicarlo
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

// ==========================================
// 🔑 TUS LLAVES MAESTRAS DE PASARELAS
// ==========================================
// 🚨 LEE EL TOKEN DE MERCADO PAGO DESDE EL ARCHIVO .env 🚨
const MERCADOPAGO_ACCESS_TOKEN = process.env.MERCADOPAGO_TOKEN;

const client = new vision.ImageAnnotatorClient();

// ==========================================
// 🛡️ MIDDLEWARE DE SEGURIDAD: VERIFICAR TOKEN
// ==========================================
async function verificarIdentidad(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new Error("SEGURIDAD LFA: Acceso denegado. Falta token de autorización.");
    }
    const idToken = authHeader.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        if (!decodedToken || !decodedToken.uid) {
            throw new Error("SEGURIDAD LFA: Token inválido o sin UID.");
        }
        return decodedToken.uid;
    } catch (e) {
        throw new Error("SEGURIDAD LFA: Token inválido, expirado o manipulado.");
    }
}

function validarMonto(monto) {
    const valor = Number(monto);
    if (!Number.isFinite(valor) || valor <= 0) {
        throw new Error("SEGURIDAD LFA: Monto inválido.");
    }
    return valor;
}

async function obtenerUsuario(uid) {
    if (!uid) throw new Error("SEGURIDAD LFA: UID inválido.");
    const userDoc = await db.collection('usuarios').doc(uid).get();
    if (!userDoc.exists) throw new Error("SEGURIDAD LFA: Usuario no encontrado en BD.");
    return { uid, data: userDoc.data() };
}

async function verificarAdmin(uid) {
    const { data: userData } = await obtenerUsuario(uid);
    const rol = userData.rol;
    const CEOuid = "2bOrFxTAcPgFPoHKJHQfYxoQJpw1";

    if (uid !== CEOuid && rol !== "admin") {
        throw new Error(`SEGURIDAD LFA: Usuario no tiene permisos de administrador. UID: ${uid}, Rol: ${rol}`);
    }

    return { uid, rol, isAuthorized: true };
}

async function verificarCapitan(uid) {
    const { data: userData } = await obtenerUsuario(uid);
    const rol = userData.rol;
    const CEOuid = "2bOrFxTAcPgFPoHKJHQfYxoQJpw1";

    if (uid === CEOuid || rol === "admin" || rol === "capitan") {
        return { uid, rol, isAuthorized: true };
    }

    throw new Error(`SEGURIDAD LFA: Usuario no tiene permisos de capitán. UID: ${uid}, Rol: ${rol}`);
}

// Catálogo inmutable de precios en el servidor
const PACKS_OFICIALES = {
    "INICIAL": { usd: 2.00, coins: 2 },
    "BÁSICO": { usd: 5.00, coins: 5 },
    "BASICO": { usd: 5.00, coins: 5 }, 
    "PRO": { usd: 10.00, coins: 10 },
    "WHALE": { usd: 20.00, coins: 22 } // <-- WHALE CON 2 COINS DE REGALO
};

// ============================================================================
// 🇦🇷 1️⃣ CREAR PAGO MERCADO PAGO (AUTOMÁTICO, BLINDADO Y EN VIVO)
// ============================================================================
exports.crearPagoMP = functions.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return res.status(204).send('');
    }

    try {
        // 1. VALIDAR TOKEN DE FIREBASE
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.error("[crearPagoMP] Header de autorización faltante o mal formado");
            return res.status(401).json({ error: "Token de autorización requerido", success: false });
        }

        const idToken = authHeader.split('Bearer ')[1];
        let decodedToken;
        try {
            decodedToken = await admin.auth().verifyIdToken(idToken);
        } catch (tokenError) {
            console.error("[crearPagoMP] Token inválido:", tokenError.message);
            return res.status(401).json({ error: "Token inválido o expirado", success: false });
        }

        const uidReal = decodedToken.uid;
        console.log(`[crearPagoMP] UID verificado: ${uidReal}`);

        // 2. VALIDAR PACK
        const { pack_name } = req.body;
        if (!pack_name) {
            return res.status(400).json({ error: "Falta pack_name", success: false });
        }

        const packSeguro = PACKS_OFICIALES[pack_name];
        if (!packSeguro) {
            console.warn(`[crearPagoMP] Pack no válido: ${pack_name}`);
            return res.status(400).json({ error: "Pack inexistente o modificado por el cliente.", success: false });
        }

        // 3. VERIFICAR MERCADO PAGO TOKEN
        if (!MERCADOPAGO_ACCESS_TOKEN) {
            console.error("[crearPagoMP] MERCADOPAGO_ACCESS_TOKEN no configurado");
            return res.status(500).json({ error: "Error de configuración del servidor", success: false });
        }

        // 4. OBTENER COTIZACIÓN DÓLAR CRIPTO
        let valorDolarCripto = 1466;
        try {
            const resDolar = await fetch("https://dolarapi.com/v1/dolares/cripto");
            const dataDolar = await resDolar.json();
            if (dataDolar && dataDolar.venta) {
                valorDolarCripto = dataDolar.venta;
                console.log(`[crearPagoMP] Dólar Cripto: ${valorDolarCripto}`);
            }
        } catch (error) {
            console.error("[crearPagoMP] Error leyendo Dólar Cripto, usando fallback:", error.message);
        }

        // 5. CALCULAR PRECIO EN ARS
        const costoBaseARS = packSeguro.usd * valorDolarCripto;
        const priceARS = Math.round(costoBaseARS * 1.10);
        console.log(`[crearPagoMP] Precio calculado: ${packSeguro.usd} USD → ${priceARS} ARS`);

        // 6. OBTENER EMAIL DEL USUARIO
        let userDoc;
        try {
            userDoc = await db.collection("usuarios").doc(uidReal).get();
        } catch (dbError) {
            console.error("[crearPagoMP] Error accediendo a Firestore:", dbError.message);
            return res.status(500).json({ error: "Error accediendo a la base de datos", success: false });
        }

        const email = userDoc.exists ? (userDoc.data().email || "jugador@somoslfa.com") : "jugador@somoslfa.com";

        // 7. CREAR REFERENCIA EXTERNA
        const externalRef = `${uidReal}_${packSeguro.coins}_${Date.now()}`;

        // 8. CREAR PREFERENCIA EN MERCADO PAGO
        const bodyData = {
            items: [
                {
                    title: `Pack ${pack_name} - ${packSeguro.coins} LFA Coins`,
                    description: "Monedas virtuales LFA",
                    quantity: 1,
                    currency_id: "ARS",
                    unit_price: priceARS
                }
            ],
            payer: { email: email },
            external_reference: externalRef,
            back_urls: {
                success: "https://somoslfa.com/dashboard",
                failure: "https://somoslfa.com/dashboard",
                pending: "https://somoslfa.com/dashboard"
            },
            auto_return: "approved",
            notification_url: "https://us-central1-lfaofficial.cloudfunctions.net/webhookMP"
        };

        let response;
        try {
            response = await fetch("https://api.mercadopago.com/checkout/preferences", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`
                },
                body: JSON.stringify(bodyData)
            });
        } catch (mpFetchError) {
            console.error("[crearPagoMP] Error conectando a Mercado Pago:", mpFetchError.message);
            return res.status(502).json({ error: "Error conectando a Mercado Pago", success: false });
        }

        const mpData = await response.json();

        if (mpData.init_point) {
            console.log(`[crearPagoMP] Preferencia creada: ${mpData.id}`);
            // Guardar intento de pago
            try {
                await db.collection('pagos_pendientes').add({
                    uid: uidReal,
                    email,
                    precio_ars: priceARS,
                    coins: packSeguro.coins,
                    pack_name,
                    estado: "esperando_pago",
                    metodo: "mercadopago",
                    external_reference: externalRef,
                    fecha: admin.firestore.FieldValue.serverTimestamp()
                });
            } catch (saveError) {
                console.warn("[crearPagoMP] Advertencia al guardar pago pendiente:", saveError.message);
                // No fallar por esto, el pago puede procesarse igualmente
            }
            res.status(200).json({ init_point: mpData.init_point, success: true });
        } else {
            console.error("[crearPagoMP] Mercado Pago rechazó:", mpData);
            res.status(400).json({ error: mpData.message || "Rechazado por Mercado Pago", success: false });
        }
    } catch (error) {
        console.error("[crearPagoMP] Error no controlado:", error.message, error.stack);
        res.status(500).json({ error: error.message || "Error interno del servidor", success: false });
    }
});

// ============================================================================
// 🔔 2️⃣ WEBHOOK DE MERCADO PAGO (EL COBRADOR INVISIBLE)
// ============================================================================
exports.webhookMP = functions.https.onRequest(async (req, res) => {
    // Mercado Pago manda notificaciones. Siempre hay que responderle 200 rápido.
    res.status(200).send("OK");

    const topic = req.query.topic || req.query.type;
    const paymentId = req.query.id || req.query['data.id'];

    if (topic !== 'payment' || !paymentId) {
        return;
    }

    try {
        const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
            headers: { "Authorization": `Bearer ${MERCADOPAGO_ACCESS_TOKEN}` }
        });
        const paymentInfo = await response.json();

        if (paymentInfo.status !== 'approved') {
            return;
        }

        const extRef = paymentInfo.external_reference;
        if (!extRef) {
            console.warn("Webhook MP: external_reference ausente.");
            return;
        }

        const partesRef = extRef.split("_");
        if (partesRef.length < 3) {
            console.warn("Webhook MP: formato de external_reference no válido.", extRef);
            return;
        }

        const coins = parseInt(partesRef[partesRef.length - 2], 10);
        const timestamp = Number(partesRef[partesRef.length - 1]);
        const uid = partesRef.slice(0, partesRef.length - 2).join("_");

        if (!uid || Number.isNaN(coins) || Number.isNaN(timestamp) || coins <= 0) {
            console.warn("Webhook MP: external_reference inválido.", extRef);
            return;
        }

        const pagoDocId = `mp_${paymentId}`;
        const pagoRef = db.collection('pagos_procesados').doc(pagoDocId);
        const pagoDoc = await pagoRef.get();

        if (pagoDoc.exists) {
            return;
        }

        await db.collection("usuarios").doc(uid).update({
            number: admin.firestore.FieldValue.increment(coins)
        });

        await pagoRef.set({
            uid: uid,
            coins_entregadas: coins,
            monto_ars: paymentInfo.transaction_amount,
            fecha: admin.firestore.FieldValue.serverTimestamp(),
            metodo: "mercadopago",
            payment_id: paymentId,
            external_reference: extRef
        });

        const pendingQuery = await db.collection("pagos_pendientes").where("external_reference", "==", extRef).get();
        if (!pendingQuery.empty) {
            await pendingQuery.docs[0].ref.update({ estado: "completado" });
        }
    } catch (error) {
        console.error("Error validando webhook MP: ", error);
    }
});

// ==========================================
// 🎟️ 3️⃣ INSCRIPCIÓN A TORNEOS (BLINDADO)
// ==========================================
exports.inscribirTorneo = functions.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return res.status(204).send('');
    }

    try {
        const uidReal = await verificarIdentidad(req);
        const { torneoId, nombreEquipo } = req.body; 
        if (!torneoId) return res.status(400).json({ success: false, error: "Faltan datos" });

        const userRef = db.collection('usuarios').doc(uidReal);
        const torneoRef = db.collection('torneos').doc(torneoId);

        await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            const torneoDoc = await transaction.get(torneoRef);

            if (!userDoc.exists || !torneoDoc.exists) throw new Error("No encontrado");

            const userData = userDoc.data();
            const torneoData = torneoDoc.data();

            if (torneoData.participantes && torneoData.participantes.includes(uidReal)) throw new Error("YA_INSCRITO");
            if (torneoData.participantes && torneoData.participantes.length >= torneoData.cupos_totales) throw new Error("TORNEO_LLENO");
            if ((userData.number || 0) < torneoData.costo_inscripcion) throw new Error("SALDO_INSUFICIENTE");
            if ((userData.fair_play !== undefined ? userData.fair_play : 100) < 50) throw new Error("Cuenta RESTRINGIDA por comportamiento tóxico."); 

            transaction.update(userRef, { number: (userData.number || 0) - torneoData.costo_inscripcion });
            
            const nuevosParticipantes = [...(torneoData.participantes || []), uidReal];
            let nuevoEstado = "abierto";
            let partidoIniciado = torneoData.partido_iniciado_en || null;
            
            if (nuevosParticipantes.length === torneoData.cupos_totales) {
                nuevoEstado = "en_disputa";
                partidoIniciado = Date.now();
            }

            transaction.update(torneoRef, {
                participantes: nuevosParticipantes,
                inscritos: nuevosParticipantes.length,
                estado: nuevoEstado,
                pozo_acumulado: (torneoData.pozo_acumulado || 0) + torneoData.costo_inscripcion,
                partido_iniciado_en: partidoIniciado
            });
        });

        res.json({ success: true });
    } catch (error) { res.json({ success: false, error: error.message }); }
});

// ==========================================
// 💸 4️⃣ REPARTIR PREMIOS (CEO - CATEGORÍAS SEPARADAS)
// ==========================================
exports.repartirPremios = functions.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return res.status(204).send('');
    }

    try {
        const uidReal = await verificarIdentidad(req);
        // 🛡️ VALIDACIÓN REAL DE ADMIN EN SERVER
        await verificarAdmin(uidReal);

        const { torneoId, ganador1Id, ganador2Id, ganador3Id } = req.body;
        if (!torneoId) throw new Error("Falta el ID del torneo.");

        const torneoRef = db.collection('torneos').doc(torneoId);
        const torneoDoc = await torneoRef.get();
        if (!torneoDoc.exists) throw new Error("Torneo no encontrado.");

        const torneoData = torneoDoc.data();
        if (torneoData.estado === 'finalizado_premios') throw new Error("Los premios ya fueron repartidos.");

        const participantes = torneoData.participantes || [];
        const ganadores = [ganador1Id, ganador2Id, ganador3Id].filter(Boolean);
        for (const ganadorId of ganadores) {
            if (!participantes.includes(ganadorId)) {
                throw new Error(`El ganador ${ganadorId} no forma parte de este torneo.`);
            }
        }

        const cupos = torneoData.cupos_totales || 4;
        const pozoBruto = torneoData.pozo_acumulado || 0;
        
        const feeOrg = pozoBruto * 0.10;
        const pozoNeto = pozoBruto * 0.90; 

        let premioG1 = 0, premioG2 = 0, premioG3 = 0;

        if (cupos <= 8) {
            premioG1 = pozoNeto;
        } else if (cupos === 16) {
            premioG1 = pozoNeto * 0.70;
            premioG2 = pozoNeto * 0.30;
        } else if (cupos >= 32) {
            premioG1 = pozoNeto * 0.60;
            premioG2 = pozoNeto * 0.25;
            premioG3 = pozoNeto * 0.15;
        }

        // 🧠 SISTEMA DE CATEGORÍAS SEPARADAS PARA EL RANKING
        let modoCat = "titulos_otros";
        let m = (torneoData.modo || "").toUpperCase();
        if(m.includes("ULTIMATE")) modoCat = "titulos_ut";
        else if(m.includes("GLOBAL")) modoCat = "titulos_global95";
        else if(m.includes("MOBILE")) modoCat = "titulos_mobile";
        else if(m.includes("DREAM")) modoCat = "titulos_dreamteam";
        else if(m.includes("GENUINOS")) modoCat = "titulos_genuinos";

        const batch = db.batch();

        if (feeOrg > 0) {
            const orgRef = db.collection('usuarios').doc("2bOrFxTAcPgFPoHKJHQfYxoQJpw1");
            batch.update(orgRef, { number: admin.firestore.FieldValue.increment(feeOrg) });
        }

        if (ganador1Id && premioG1 > 0) {
            batch.update(db.collection('usuarios').doc(ganador1Id), { 
                number: admin.firestore.FieldValue.increment(premioG1),
                titulos: admin.firestore.FieldValue.increment(1),
                [modoCat]: admin.firestore.FieldValue.increment(1), 
                partidos_ganados: admin.firestore.FieldValue.increment(1),
                partidos_jugados: admin.firestore.FieldValue.increment(1),
                fair_play: admin.firestore.FieldValue.increment(2) 
            });
            
            // PREMIOS 2VS2: Si el torneo fue Co-Op, también le damos las stats al Equipo
            if(torneoData.formato && torneoData.formato.toLowerCase().includes("2vs2")) {
                const eqRef = db.collection('equipos_coop').doc(ganador1Id);
                batch.update(eqRef, {
                    ganancias: admin.firestore.FieldValue.increment(premioG1),
                    copas: admin.firestore.FieldValue.increment(1)
                });
            }
        }
        
        if (ganador2Id && premioG2 > 0) {
            batch.update(db.collection('usuarios').doc(ganador2Id), { 
                number: admin.firestore.FieldValue.increment(premioG2),
                partidos_perdidos: admin.firestore.FieldValue.increment(1),
                partidos_jugados: admin.firestore.FieldValue.increment(1),
                fair_play: admin.firestore.FieldValue.increment(1) 
            });
            
            if(torneoData.formato && torneoData.formato.toLowerCase().includes("2vs2")) {
                const eqRef = db.collection('equipos_coop').doc(ganador2Id);
                batch.update(eqRef, { ganancias: admin.firestore.FieldValue.increment(premioG2) });
            }
        }

        if (ganador3Id && premioG3 > 0) {
            batch.update(db.collection('usuarios').doc(ganador3Id), { 
                number: admin.firestore.FieldValue.increment(premioG3)
            });
        }
        
        batch.update(torneoRef, { estado: "finalizado_premios", campeon_nombre: ganador1Id });
        await batch.commit();

        res.json({ success: true });
    } catch (error) { res.json({ success: false, error: error.message }); }
});

// ==========================================
// 🏦 5️⃣ SOLICITAR RETIRO (BLINDADO)
// ==========================================
exports.solicitarRetiro = functions.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return res.status(204).send('');
    }

    try {
        const uidReal = await verificarIdentidad(req);
        const { nombre_plataforma, nombre_real, whatsapp, monto, cbuAlias, auditoria_ip } = req.body;
        const montoCoins = validarMonto(monto);
        const userRef = db.collection('usuarios').doc(uidReal);
        
        await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            const uData = userDoc.data();
            const fairPlayActual = uData.fair_play !== undefined ? uData.fair_play : 100;

            if ((uData.number || 0) < montoCoins) throw new Error("Saldo insuficiente");
            if (fairPlayActual < 60) throw new Error("Billetera Congelada por comportamiento tóxico.");
            if ((uData.torneos_pagos_jugados || 0) < 1) throw new Error("Debés participar en al menos 1 torneo pago para habilitar los retiros. Los torneos gratuitos y las coins de referido no habilitan retiros.");

            transaction.update(userRef, { number: admin.firestore.FieldValue.increment(-montoCoins) });
            
            const retiroRef = db.collection('retiros').doc();
            transaction.set(retiroRef, {
                uid: uidReal, 
                nombreJugador: nombre_plataforma, 
                nombre_real, 
                whatsapp, 
                montoCoins: montoCoins, 
                cbuAlias, 
                ip_solicitud: auditoria_ip, 
                fecha: admin.firestore.FieldValue.serverTimestamp(), 
                estado: "pendiente"
            });
        });

        res.json({ success: true });
    } catch (error) { res.json({ success: false, error: error.message }); }
});

// ==========================================
// 🤖 6️⃣ LFA BOT IA (VAR MULTI-JUEGO ESTRICTO SUPREMO)
// ==========================================
exports.procesarArbitrajeNube = onDocumentCreated("reportes_ia/{reporteId}", async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data();
    if (data.estado !== "procesando") return;

    const t_id = data.torneo_id; 
    const u_id = data.jugador_uid;
    const nombre = (data.jugador_nombre || "").toUpperCase(); 
    const imagen_url = data.imagen_url || "";
    const esCoop = data.es_coop === true || data.dupla_id != null;

    try {
        const torneoRef = db.collection('torneos').doc(t_id);
        const torneoDoc = await torneoRef.get();
        
        if (!torneoDoc.exists) return snap.ref.update({ estado: 'error', marcador_leido: 'Torneo no encontrado' });

        const t_data = torneoDoc.data();
        const juego = t_data.juego || "FC 26";
        const cupos = t_data.cupos_totales || 4; 
        const premio_total = (t_data.costo_inscripcion || 0) * cupos;
        
        // Para CO-OP: obtener los 4 nombres (dupla propia + dupla rival)
        let rival_uid = null;
        let rival_nombre = "RIVAL";
        let miCompanero_uid = null;
        let miCompanero_nombre = null;
        let rivalCompanero_nombre = null;

        if (esCoop && t_data.equipos_draft) {
            // Buscar mi dupla y la dupla rival en equipos_draft
            const drafts = t_data.equipos_draft;
            let miDraftId = null;
            let rivalDraftId = null;
            for (const [id, eq] of Object.entries(drafts)) {
                if (eq.p1 === u_id || eq.p2 === u_id) {
                    miDraftId = id;
                    miCompanero_uid = eq.p1 === u_id ? eq.p2 : eq.p1;
                    miCompanero_nombre = eq.p1 === u_id ? eq.p2_nombre : eq.p1_nombre;
                } else {
                    rivalDraftId = id;
                    rival_uid = eq.p1;
                    rival_nombre = eq.p1_nombre || "RIVAL";
                    rivalCompanero_nombre = eq.p2_nombre;
                }
            }
        } else if (esCoop && t_data.duplas_sorteadas) {
            const duplas = t_data.duplas_sorteadas;
            for (const d of duplas) {
                if (d.jugador1?.uid === u_id || d.jugador2?.uid === u_id) {
                    miCompanero_uid = d.jugador1?.uid === u_id ? d.jugador2?.uid : d.jugador1?.uid;
                    miCompanero_nombre = d.jugador1?.uid === u_id ? d.jugador2?.nombre : d.jugador1?.nombre;
                } else {
                    rival_uid = d.jugador1?.uid;
                    rival_nombre = d.jugador1?.nombre || "RIVAL";
                    rivalCompanero_nombre = d.jugador2?.nombre;
                }
            }
        } else {
            const participantesIds = t_data.participantes || [];
            rival_uid = participantesIds.find(id => id !== u_id);
            if (rival_uid) {
                const rivalDoc = await db.collection('usuarios').doc(rival_uid).get();
                if (rivalDoc.exists) rival_nombre = rivalDoc.data().nombre;
            }
        }

        const chat_ref = torneoRef.collection("mensajes");
        let fraude = false; 
        let motivo_fraude = "";
        let idGanador = u_id; 
        let nombreGanador = nombre; 
        let marcadorMostrado = "";

        if (!imagen_url) { 
            fraude = true; 
            motivo_fraude = "⚠️ No se adjuntó imagen al reporte."; 
        } else {
            try {
                const [result] = await client.textDetection(imagen_url);
                const texts = result.textAnnotations;

                if (texts && texts.length > 0) {
                    const texto_completo = texts[0].description.toLowerCase();
                    const textoUpper = texto_completo.toUpperCase();
                    
                    // Palabras de derrota en inglés y español (eFootball y FC26)
                    const palabrasDerrota = ["DERROTA", "PERDISTE", "DEFEAT", "LOSE", "ABANDONO", "DESCONECTADO", "YOU LOSE"];
                    let esDerrota = palabrasDerrota.some(p => textoUpper.includes(p));

                    if (esDerrota) {
                        await snap.ref.update({ estado: 'fraude', marcador_leido: 'Intento de subir Derrota' });
                        await db.collection('usuarios').doc(u_id).update({ fair_play: admin.firestore.FieldValue.increment(-15) });
                        return chat_ref.add({ 
                            autorId: 'BOT', autorNombre: '🤖 VAR LFA', tipo: 'alerta', 
                            texto: `🚨 <b>¡VAR LFA INTERVIENE!</b><br>@${nombre} subió una captura de DERROTA. ¡Solo el ganador reporta!<br><b>(-15% Fair Play)</b>`, 
                            timestamp: admin.firestore.FieldValue.serverTimestamp() 
                        });
                    }

                    const limpiar = s => (s || "").toLowerCase().replace(/[_@#\-\.]/g, ' ').trim();
                    const textoLimpio = limpiar(texto_completo);

                    // Verificar IDs propios
                    const miNom = limpiar(nombre);
                    let encontroYo = textoLimpio.includes(miNom) || miNom.split(' ').some(p => p.length > 3 && textoLimpio.includes(p));

                    // Para CO-OP: verificar también al compañero (la sala muestra los 4 IDs)
                    let encontroCompanero = true;
                    if (esCoop && miCompanero_nombre) {
                        const compNom = limpiar(miCompanero_nombre);
                        encontroCompanero = textoLimpio.includes(compNom) || compNom.split(' ').some(p => p.length > 3 && textoLimpio.includes(p));
                    }

                    // Para CO-OP: si en la sala aparecen los 4 IDs, mejor — pero no exigimos los 4 si el juego los trunca
                    if (!encontroYo && !encontroCompanero) {
                        fraude = true; 
                        motivo_fraude = `⚠️ FRAUDE: Ningún ID de tu dupla ('${nombre}'${miCompanero_nombre ? ` / ${miCompanero_nombre}` : ''}) aparece en la imagen.`;
                    } 
                    
                    if (!fraude) {
                        let golesA = -1; let golesB = -1;

                        // Patrones de marcador: "3 - 2", "3:2", "3–2"
                        const patterns = [
                            /\b(\d{1,2})\s*[\-\:–]\s*(\d{1,2})\b/g,
                            /\b(\d{1,2})\s*\n\s*(\d{1,2})\b/g,
                        ];

                        for (const pat of patterns) {
                            const matches = [...texto_completo.matchAll(pat)];
                            // Filtrar marcadores imposibles (más de 20 goles)
                            const validos = matches.filter(m => parseInt(m[1]) <= 20 && parseInt(m[2]) <= 20);
                            if (validos.length > 0) {
                                // Tomar el último marcador (suele ser el final en capturas de eFootball)
                                const ultimo = validos[validos.length - 1];
                                golesA = parseInt(ultimo[1]);
                                golesB = parseInt(ultimo[2]);
                                break;
                            }
                        }

                        // Fallback: buscar dos números solitarios en contexto de resultado
                        if (golesA === -1) {
                            const victoria = ["victoria", "win", "ganaste", "you win", "winner", "resultado"];
                            const hayContexto = victoria.some(v => texto_completo.includes(v));
                            if (hayContexto) {
                                const nums = texto_completo.match(/\b(\d{1,2})\b/g) || [];
                                const filtrados = nums.map(Number).filter(n => n <= 20);
                                if (filtrados.length >= 2) {
                                    golesA = filtrados[0]; golesB = filtrados[1];
                                }
                            }
                        }

                        if (golesA !== -1 && golesB !== -1) {
                            // Determinar qué goles corresponden a quién según posición en el texto
                            const posYo = textoLimpio.indexOf(miNom);
                            const posRival = textoLimpio.indexOf(limpiar(rival_nombre));
                            let misGoles = golesA; let rivalGoles = golesB;

                            if (posRival !== -1 && posYo !== -1 && posRival < posYo) { 
                                misGoles = golesB; rivalGoles = golesA; 
                            }

                            if (misGoles === rivalGoles) { 
                                fraude = true; 
                                motivo_fraude = `❌ EMPATE (${misGoles}-${rivalGoles}). Definan por Penales y vuelvan a subir el resultado.`; 
                            } else if (misGoles > rivalGoles) { 
                                idGanador = u_id; 
                                nombreGanador = esCoop ? (nombre + (miCompanero_nombre ? ` / ${miCompanero_nombre}` : "")) : nombre;
                                marcadorMostrado = `${misGoles} - ${rivalGoles}`; 
                            } else { 
                                fraude = true; 
                                motivo_fraude = `❌ El marcador indica que perdiste (${misGoles}-${rivalGoles}). Solo el GANADOR sube el resultado.`;
                            }
                        } else { 
                            fraude = true; 
                            motivo_fraude = "⚠️ El VAR no detectó un resultado claro. Subí la captura con el marcador visible (Ej: 3 - 0). Para eFootball CO-OP, capturá la pantalla de resultados de la sala."; 
                        }
                    }
                } else { 
                    fraude = true; 
                    motivo_fraude = "Imagen vacía o ilegible. Intentá con mejor calidad."; 
                }
            } catch (visionError) { 
                fraude = true; 
                motivo_fraude = "❌ Error en el sistema de IA. El Staff revisará manualmente."; 
                console.error("Vision API error:", visionError.message);
            }
        }

        if (fraude) {
            await snap.ref.update({ estado: 'fraude', marcador_leido: motivo_fraude });
            await db.collection('usuarios').doc(u_id).update({ fair_play: admin.firestore.FieldValue.increment(-15) });
            return chat_ref.add({ autorId: 'BOT', autorNombre: '🤖 VAR LFA', tipo: 'alerta', texto: `🚨 ANÁLISIS RECHAZADO: ${motivo_fraude}<br><b>(-15% Puntos de Fair Play)</b>`, timestamp: admin.firestore.FieldValue.serverTimestamp() });
        }

        // ✅ RESULTADO VÁLIDO — Actualizar según formato del torneo
        let modoCat = "titulos_otros";
        let m = (t_data.modo || "").toUpperCase();
        if(m.includes("ULTIMATE")) modoCat = "titulos_ut";
        else if(m.includes("GLOBAL")) modoCat = "titulos_global95";
        else if(m.includes("MOBILE")) modoCat = "titulos_mobile";
        else if(m.includes("DREAM")) modoCat = "titulos_dreamteam";
        else if(m.includes("GENUINOS")) modoCat = "titulos_genuinos";
        else if(m.includes("COOP") || esCoop) modoCat = "titulos_coop";

        const userRef = db.collection('usuarios').doc(idGanador);
        let updatesUsuario = { 
            number: admin.firestore.FieldValue.increment(premio_total), 
            titulos: admin.firestore.FieldValue.increment(1),
            [modoCat]: admin.firestore.FieldValue.increment(1), 
            partidos_ganados: admin.firestore.FieldValue.increment(1),
            partidos_jugados: admin.firestore.FieldValue.increment(1),
            fair_play: admin.firestore.FieldValue.increment(2) 
        };
        
        if (rival_uid) { 
            await db.collection('usuarios').doc(rival_uid).update({ 
                partidos_perdidos: admin.firestore.FieldValue.increment(1), 
                partidos_jugados: admin.firestore.FieldValue.increment(1) 
            }); 
        }

        if (cupos <= 2) {
            await userRef.update(updatesUsuario);
            await torneoRef.update({ ganador_final: idGanador, estado: 'finalizado_premios', marcador_final: marcadorMostrado, campeon_nombre: nombreGanador });
            await snap.ref.update({ estado: 'aprobado', marcador_leido: marcadorMostrado });
            let msj = `✅ <b>MARCADOR VALIDADO: ${marcadorMostrado}</b><br>⚽ ¡${nombreGanador} se lleva la victoria!`;
            await chat_ref.add({ autorId: 'BOT', autorNombre: '🤖 LFA BOT', tipo: 'sistema', texto: msj, timestamp: admin.firestore.FieldValue.serverTimestamp() });
        } else {
            let ronda2 = t_data.llaves_ronda2 || [];
            if (!ronda2.includes(idGanador) && ronda2.length < 2) {
                ronda2.push(idGanador);
                await torneoRef.update({ llaves_ronda2: ronda2, marcador_semis: marcadorMostrado });
                await snap.ref.update({ estado: 'aprobado', marcador_leido: marcadorMostrado });
                let msj = `✅ <b>RESULTADO VALIDADO: ${marcadorMostrado}</b><br>🔥 ¡${nombreGanador} avanza a la Final!`;
                await chat_ref.add({ autorId: 'BOT', autorNombre: '🤖 LFA BOT', tipo: 'sistema', texto: msj, timestamp: admin.firestore.FieldValue.serverTimestamp() });
            } else if (ronda2.includes(idGanador)) {
                await userRef.update(updatesUsuario);
                await torneoRef.update({ ganador_final: idGanador, estado: 'finalizado_premios', marcador_final: marcadorMostrado, campeon_nombre: nombreGanador });
                await snap.ref.update({ estado: 'aprobado', marcador_leido: marcadorMostrado });
                let msj = `🏆 <b>¡TENEMOS CAMPEÓN!</b><br>🥇 ${nombreGanador} gana la Final (${marcadorMostrado}).`;
                await chat_ref.add({ autorId: 'BOT', autorNombre: '🤖 LFA BOT', tipo: 'sistema', texto: msj, timestamp: admin.firestore.FieldValue.serverTimestamp() });
            }
        }
    } catch (e) { 
        console.error("procesarArbitrajeNube error:", e.message); 
        await snap.ref.update({ estado: 'error' }); 
    }
});


// ==========================================
// 🛰️ 7️⃣ ÁRBITRO DE RED ORIGINAL (PING LATENCIA)
// ==========================================
exports.asignarHostPorPing = onDocumentCreated("torneos/{t_id}/pings/{u_id}", async (event) => {
    const t_id = event.params.t_id; 
    const pingsSnap = await db.collection("torneos").doc(t_id).collection("pings").get();
    
    if (pingsSnap.size === 2) {
        let mejorPing = 9999; 
        let nombreHost = "";
        
        pingsSnap.forEach(doc => { 
            const d = doc.data(); 
            if (d.latencia < mejorPing) { 
                mejorPing = d.latencia; 
                nombreHost = d.nombre; 
            } 
        });
        
        await db.collection("torneos").doc(t_id).collection("mensajes").add({
            autorId: 'BOT', 
            autorNombre: '🤖 LFA RADAR', 
            tipo: 'sistema', 
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            texto: `📡 <b>TEST DE LATENCIA COMPLETADO</b><br>El sistema detecta que <b>${nombreHost.toUpperCase()}</b> tiene mejor conexión a los servidores.<br>👉 <i>Debería ser el HOST de la partida para evitar Lag.</i>`
        });
    }
});

// ==========================================
// ⚖️ 8️⃣ PANEL ADMIN: GESTIÓN DE FAIR PLAY
// ==========================================
exports.modificarFairPlay = functions.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return res.status(204).send('');
    }

    try {
        const uidReal = await verificarIdentidad(req);
        // 🛡️ VALIDACIÓN REAL DE ADMIN EN SERVER
        await verificarAdmin(uidReal);
        
        const { jugadorUid, nuevoPuntaje } = req.body;
        const userRef = db.collection('usuarios').doc(jugadorUid);
        await userRef.update({ fair_play: parseInt(nuevoPuntaje) });
        
        res.json({ success: true, mensaje: `Fair Play actualizado a ${nuevoPuntaje}%` });
    } catch (error) { res.json({ success: false, error: error.message }); }
});

// ==========================================
// 🚀 9️⃣ AUTO-SPAWNER (CREADOR AUTOMÁTICO DE SALAS)
// ==========================================
exports.autoSpawnerSalas = onDocumentUpdated("torneos/{torneoId}", async (event) => {
    const dataAntes = event.data.before.data();
    const dataDespues = event.data.after.data();

    if (dataAntes.estado === "abierto" && dataDespues.estado === "en_disputa") {
        try {
            const configDoc = await db.collection("configuracion").doc("spawner").get();
            if (configDoc.exists && configDoc.data().activo === true) {
                let nuevoTitulo = dataDespues.titulo;
                if(nuevoTitulo.includes('#')) { nuevoTitulo = nuevoTitulo.split('#')[0].trim() + " #" + Math.floor(Math.random() * 9000 + 1000); }

                await db.collection("torneos").add({
                    titulo: nuevoTitulo, detalles: dataDespues.detalles || "", region: dataDespues.region || "GLOBAL",
                    juego: dataDespues.juego, plataforma: dataDespues.plataforma, modo: dataDespues.modo,
                    cupos_totales: dataDespues.cupos_totales, costo_inscripcion: dataDespues.costo_inscripcion,
                    inscritos: 0, participantes: [], estado: "abierto",
                    creado: admin.firestore.FieldValue.serverTimestamp(), pozo_acumulado: 0
                });
            }
        } catch(e) { console.error("Error en Auto-Spawner:", e); }
    }
});

// ==========================================
// 🤝 SISTEMA DE REFERIDOS (VINCULACIÓN)
// ==========================================
exports.vincularReferido = functions.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return res.status(204).send('');
    }

    try {
        const uidReal = await verificarIdentidad(req);
        const codigo_invitador = (req.body.codigo_invitador || "").toString().trim();
        const ip_registro = (req.body.ip_registro || "").toString().trim();

        if (!codigo_invitador) throw new Error("Código vacío");

        // Buscamos al invitador por su Nombre (ID de plataforma)
        const invitadorQuery = await db.collection("usuarios").where("nombre", "==", codigo_invitador.toUpperCase()).get();
        if (invitadorQuery.empty) throw new Error("El código del creador/amigo no existe.");

        const invitadorDoc = invitadorQuery.docs[0];
        if (invitadorDoc.id === uidReal) throw new Error("No podés referirte a ti mismo, pillo.");

        const userRef = db.collection("usuarios").doc(uidReal);
        const userDoc = await userRef.get();

        if (userDoc.data().referido_por) throw new Error("Ya fuiste referido por alguien más.");

        // Guardamos el vínculo y la IP para el Anti-Fraude
        await userRef.update({ 
            referido_por: invitadorDoc.id, 
            bono_referido_entregado: false,
            ip_registro_referido: ip_registro || "Desconocida"
        });

        res.json({ success: true, mensaje: "¡Código vinculado al éxito!" });
    } catch (error) { res.json({ success: false, error: error.message }); }
});

// ==========================================
// 💸 MOTOR DE PAGOS BOCA A BOCA Y AFILIADOS PRO
// ==========================================
exports.procesarSistemaReferidos = onDocumentUpdated("torneos/{torneoId}", async (event) => {
    const dataAntes = event.data.before.data();
    const dataDespues = event.data.after.data();

    // Solo se dispara cuando el torneo FINALIZA y se pagaron los premios base
    if (dataAntes.estado !== "finalizado_premios" && dataDespues.estado === "finalizado_premios") {
        const participantes = dataDespues.participantes || [];
        const costo = dataDespues.costo_inscripcion || 0;

        if (costo === 0) return; // Los torneos Freeroll no dan bonos ni Rake

        const rakeGeneradoPorJugador = costo * 0.10; // La casa cobra el 10%
        const comisionStreamer = rakeGeneradoPorJugador * 0.25; // El Streamer se lleva el 25% del Rake

        const batch = db.batch();

        for (const uid of participantes) {
            const userRef = db.collection("usuarios").doc(uid);
            const userDoc = await userRef.get();
            if (!userDoc.exists) continue;

            // Registrar participación en torneo pago (habilita retiros)
            batch.update(userRef, { torneos_pagos_jugados: admin.firestore.FieldValue.increment(1) });

            const uData = userDoc.data();

            // Si este jugador fue invitado por alguien...
            if (uData.referido_por) {
                const invitadorRef = db.collection("usuarios").doc(uData.referido_por);
                const invitadorDoc = await invitadorRef.get();

                if (invitadorDoc.exists) {
                    const invData = invitadorDoc.data();

                    // 🎁 1. SISTEMA BOCA A BOCA (Solo gana el INVITADOR: 0.50 LFA)
                    if (costo >= 2 && uData.bono_referido_entregado !== true) {
                        // 🛡️ BARRERA ANTI-FRAUDE: Verificamos que no sea el mismo pibe con 2 cuentas
                        const ipUser = uData.ip_registro_referido || "IP1";
                        const ipInviter = invData.ip_registro_referido || "IP2";

                        if (ipUser === ipInviter && ipUser !== "Desconocida") {
                            console.log(`Fraude bloqueado. IP Duplicada: ${ipUser}`);
                        } else {
                            // Marcamos el bono como usado para el nuevo (para que no lo use más)
                            batch.update(userRef, { bono_referido_entregado: true });
                            // +50 LFA Coins al invitador, trackeadas como bonus (no retirables)
                            batch.update(invitadorRef, {
                                number: admin.firestore.FieldValue.increment(50),
                                coins_referidos: admin.firestore.FieldValue.increment(50),
                            });
                        }
                    }

                    // 💎 2. SISTEMA AFILIADOS PRO (Ingreso Pasivo para Streamers)
                    // Si el invitador tiene el tag de "streamer", cobra por CADA sala que juegue su referido
                    if (invData.rol === "streamer" || invData.es_afiliado === true) {
                        batch.update(invitadorRef, {
                            number: admin.firestore.FieldValue.increment(comisionStreamer),
                            ganancias_afiliado: admin.firestore.FieldValue.increment(comisionStreamer)
                        });
                    }
                }
            }
        }
        await batch.commit(); // Ejecutamos todos los pagos juntos a la velocidad de la luz
    }
});

// ============================================================
// ============================================================
// 🔧 LÓGICA COMPARTIDA DE SORTEO (usada por auto-trigger y función manual)
// ============================================================
async function ejecutarSorteoLogic(torneoId, torneo) {
    const jugadores = torneo.jugadores_individuales || [];
    if (jugadores.length < 2) {
        console.log(`Sorteo cancelado: solo ${jugadores.length} jugadores.`);
        return null;
    }

    const jugadoresParaSortear = [...jugadores];

    // Fisher-Yates shuffle
    for (let i = jugadoresParaSortear.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [jugadoresParaSortear[i], jugadoresParaSortear[j]] = [jugadoresParaSortear[j], jugadoresParaSortear[i]];
    }

    // Cargar perfiles en paralelo
    const profileSnaps = await Promise.all(jugadoresParaSortear.map(uid => db.collection("usuarios").doc(uid).get()));
    const perfiles = {};
    profileSnaps.forEach(snap => {
        if (snap.exists) {
            const d = snap.data();
            perfiles[snap.id] = { uid: snap.id, nombre: d.nombre || d.plataforma_id || snap.id.substring(0, 8), plataforma_id: d.plataforma_id || "" };
        }
    });

    // Armar duplas
    const duplas = [];
    for (let i = 0; i + 1 < jugadoresParaSortear.length; i += 2) {
        const uid1 = jugadoresParaSortear[i];
        const uid2 = jugadoresParaSortear[i + 1];
        const p1 = perfiles[uid1] || { uid: uid1, nombre: `Jugador${i + 1}`, plataforma_id: "" };
        const p2 = perfiles[uid2] || { uid: uid2, nombre: `Jugador${i + 2}`, plataforma_id: "" };
        const duplaNum = duplas.length + 1;
        duplas.push({
            id: `dupla_${String(duplaNum).padStart(2, "0")}`,
            numero: duplaNum,
            jugador1: { uid: p1.uid, nombre: p1.nombre, plataforma_id: p1.plataforma_id },
            jugador2: { uid: p2.uid, nombre: p2.nombre, plataforma_id: p2.plataforma_id },
            nombre_equipo: `${p1.nombre.split(" ")[0]} / ${p2.nombre.split(" ")[0]}`.toUpperCase(),
            copas: 0,
            logo_url: "https://i.imgur.com/vHqBovx.png",
            eliminado: false,
        });
    }

    // Generar bracket
    const nDuplas = duplas.length;
    const tamBracket = siguientePotenciaDeDos(nDuplas);
    const duplasPadded = [...duplas];
    while (duplasPadded.length < tamBracket) {
        duplasPadded.push({ id: `bye_${duplasPadded.length}`, nombre_equipo: "BYE", bye: true });
    }
    const bracket = generarBracket(duplasPadded);

    // Batch write
    const batch = db.batch();
    const torneoRef = db.collection("torneos").doc(torneoId);

    batch.update(torneoRef, {
        estado: "en_juego",
        duplas_sorteadas: duplas,
        bracket: bracket,
        participantes: duplas.map(d => d.id),
        sorteo_ejecutado_en: admin.firestore.FieldValue.serverTimestamp(),
        sorteo_auto: true,
    });

    const sorteoRef = db.collection("sorteos").doc(torneoId);
    batch.set(sorteoRef, {
        torneoId, torneoTitulo: torneo.titulo || "",
        jugadores_originales: jugadores,
        jugadores_sorteados: jugadoresParaSortear,
        duplas,
        ejecutado_en: admin.firestore.FieldValue.serverTimestamp(),
        ejecutado_por: "AUTO_SYSTEM",
    });

    duplas.forEach(dupla => {
        [dupla.jugador1, dupla.jugador2].forEach(j => {
            if (j && j.uid) {
                const eqRef = db.collection("equipos_coop").doc(j.uid);
                batch.set(eqRef, {
                    dupla_id: dupla.id,
                    dupla_nombre: dupla.nombre_equipo,
                    compañero_uid: j.uid === dupla.jugador1.uid ? dupla.jugador2.uid : dupla.jugador1.uid,
                    compañero_nombre: j.uid === dupla.jugador1.uid ? dupla.jugador2.nombre : dupla.jugador1.nombre,
                    torneo_activo: torneoId,
                    actualizado: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
            }
        });
    });

    await batch.commit();

    return { duplas_creadas: duplas.length, jugadores_sorteados: jugadoresParaSortear.length, bracket_rondas: bracket.length };
}

// ============================================================
// ⚡ AUTO-SORTEO: Se dispara automáticamente cuando el torneo
// pasa a estado "esperando_sorteo" y los cupos están llenos.
// ============================================================
exports.autoSorteoCoopDraft = onDocumentUpdated("torneos/{torneoId}", async (event) => {
    const antes = event.data.before.data();
    const despues = event.data.after.data();
    const torneoId = event.params.torneoId;

    // Solo actuar cuando pasa de "abierto" a "esperando_sorteo" en modo draft
    const pasaAEsperandoSorteo = antes.estado !== "esperando_sorteo" && despues.estado === "esperando_sorteo";
    const esDraft = despues.formato === "2vs2_draft";
    const yaHaySorteo = despues.duplas_sorteadas && despues.duplas_sorteadas.length > 0;

    if (!pasaAEsperandoSorteo || !esDraft || yaHaySorteo) return;

    const jugadores = despues.jugadores_individuales || [];
    if (jugadores.length < 2) {
        console.log(`[autoSorteo] ${torneoId}: insuficientes jugadores (${jugadores.length}), esperando más.`);
        return;
    }

    console.log(`[autoSorteo] ${torneoId}: ejecutando sorteo con ${jugadores.length} jugadores.`);

    // Pequeña demora para que los clientes vean el estado "esperando_sorteo" y animen el lobby
    await new Promise(r => setTimeout(r, 4000));

    try {
        // Re-leer el torneo por si hubo cambios durante el delay
        const snap = await db.collection("torneos").doc(torneoId).get();
        if (!snap.exists) return;
        const torneoActualizado = snap.data();

        // Verificar que el estado sigue siendo esperando_sorteo y no se sorteó ya
        if (torneoActualizado.estado !== "esperando_sorteo") {
            console.log(`[autoSorteo] ${torneoId}: estado cambió durante el delay, abortando.`);
            return;
        }
        if (torneoActualizado.duplas_sorteadas && torneoActualizado.duplas_sorteadas.length > 0) {
            console.log(`[autoSorteo] ${torneoId}: sorteo ya ejecutado por otro proceso.`);
            return;
        }

        const result = await ejecutarSorteoLogic(torneoId, torneoActualizado);
        if (result) {
            console.log(`[autoSorteo] ${torneoId}: ✅ ${result.duplas_creadas} duplas creadas, ${result.bracket_rondas} rondas.`);

            // ── AUTO-SPAWN: Abrir nueva sala idéntica cuando esta se llenó ──
            try {
                const configDoc = await db.collection("configuracion").doc("spawner").get();
                const spawnerActivo = !configDoc.exists || configDoc.data().activo !== false; // activo por defecto
                if (spawnerActivo) {
                    let nuevoTitulo = torneoActualizado.titulo || "CO-OP DRAFT";
                    // Generar nuevo número de sala
                    if (nuevoTitulo.includes('#')) {
                        const base = nuevoTitulo.split('#')[0].trim();
                        nuevoTitulo = `${base} #${Math.floor(Math.random() * 9000 + 1000)}`;
                    } else {
                        nuevoTitulo = `${nuevoTitulo} #${Math.floor(Math.random() * 9000 + 1000)}`;
                    }
                    await db.collection("torneos").add({
                        titulo: nuevoTitulo,
                        detalles: torneoActualizado.detalles || "",
                        region: torneoActualizado.region || "GLOBAL",
                        juego: torneoActualizado.juego || "FC 26",
                        plataforma: torneoActualizado.plataforma || "Crossplay",
                        modo: torneoActualizado.modo || "2VS2 CO-OP",
                        formato: "2vs2_draft",           // siempre draft para CO-OP
                        cupos_totales: torneoActualizado.cupos_totales || 8,
                        costo_inscripcion: torneoActualizado.costo_inscripcion || 0,
                        inscritos: 0,
                        participantes: [],
                        jugadores_individuales: [],
                        estado: "abierto",
                        reglas: torneoActualizado.reglas || [],
                        creado: admin.firestore.FieldValue.serverTimestamp(),
                        pozo_acumulado: 0,
                        spawn_from: torneoId,          // trazabilidad
                    });
                    console.log(`[autoSorteo] Nueva sala CO-OP creada: ${nuevoTitulo}`);
                }
            } catch(spawnErr) {
                console.error("[autoSorteo] Error al crear nueva sala:", spawnErr.message);
            }
        }
    } catch (e) {
        console.error(`[autoSorteo] ${torneoId}: Error:`, e.message);
    }
});

// ============================================================
// 🎲 EJECUTAR SORTEO COOP MANUAL (CEO/ADMIN)
// Baraja los jugadores individuales y arma las duplas al azar.
// Luego genera el bracket completo.
// ============================================================
exports.ejecutarSorteo = functions.https.onCall(async (data, context) => {
    // 1. Verificar que es admin (UID del dueño de LFA)
    const ADMIN_UID = "2bOrFxTAcPgFPoHKJHQfYxoQJpw1";
    if (!context.auth || context.auth.uid !== ADMIN_UID) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Solo el Administrador puede ejecutar el sorteo."
      );
    }

    const { torneoId } = data;
    if (!torneoId) {
      throw new functions.https.HttpsError("invalid-argument", "Falta el ID del torneo.");
    }

    const torneoSnap = await db.collection("torneos").doc(torneoId).get();
    if (!torneoSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Torneo no encontrado.");
    }

    const torneo = torneoSnap.data();

    if (torneo.estado !== "esperando_sorteo" && torneo.estado !== "abierto") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        `Estado inválido: ${torneo.estado}. Debe ser 'esperando_sorteo' o 'abierto'.`
      );
    }

    const jugadores = torneo.jugadores_individuales || [];
    if (jugadores.length < 2) {
      throw new functions.https.HttpsError("failed-precondition", "Se necesitan al menos 2 jugadores.");
    }

    const result = await ejecutarSorteoLogic(torneoId, torneo);

    return {
      success: true,
      duplas_creadas: result.duplas_creadas,
      jugadores_sorteados: result.jugadores_sorteados,
      bracket_rondas: result.bracket_rondas,
    };
  });



// ============================================================
// 🔢 HELPERS
// ============================================================
function siguientePotenciaDeDos(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function generarBracket(duplas) {
  // duplas ya es potencia de 2
  const rondas = [];
  let equiposRonda = [...duplas];

  while (equiposRonda.length > 1) {
    const rondaActual = [];
    for (let i = 0; i < equiposRonda.length; i += 2) {
      rondaActual.push({
        id: `m_${rondas.length + 1}_${Math.floor(i / 2) + 1}`,
        equipo1: equiposRonda[i] || null,
        equipo2: equiposRonda[i + 1] || null,
        ganador: null,
        resultado: "",
        estado: "pendiente",
        es_final: equiposRonda.length === 2,
      });
    }
    rondas.push(rondaActual);
    // Para las siguientes rondas, usamos placeholders
    equiposRonda = rondaActual.map((m) => ({ id: m.id, nombre_equipo: "GANADOR" }));
  }

  return rondas;
}

// ============================================================
// 🎟️ INSCRIBIR EN TORNEO COOP (onCall)
// ============================================================
// ============================================================================
// 🎮 INSCRIBIR EN TORNEO CO-OP (onRequest — igual que el resto del proyecto)
// REEMPLAZA la función inscribirTorneoCoop que estaba como onCall
// ============================================================================
exports.inscribirTorneoCoop = functions.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return res.status(204).send('');
    }

    try {
        // Usa la misma función verificarIdentidad que ya existe en el proyecto
        const uid = await verificarIdentidad(req);
        const { torneoId, nombreEquipo } = req.body;

        if (!torneoId) return res.json({ success: false, error: "Falta el ID del torneo." });

        const result = await db.runTransaction(async (tx) => {
            const torneoRef = db.collection("torneos").doc(torneoId);
            const usuarioRef = db.collection("usuarios").doc(uid);

            const [torneoSnap, usuarioSnap] = await Promise.all([
                tx.get(torneoRef),
                tx.get(usuarioRef),
            ]);

            if (!torneoSnap.exists) throw new Error("Torneo no encontrado.");
            if (!usuarioSnap.exists) throw new Error("Usuario no encontrado.");

            const torneo = torneoSnap.data();
            const usuario = usuarioSnap.data();

            if (torneo.estado !== "abierto" && torneo.estado !== "esperando_sorteo") {
                throw new Error("Este torneo ya no acepta inscripciones.");
            }

            if (usuario.baneado === true) {
                throw new Error("Tu cuenta está suspendida.");
            }

            const esDraft = torneo.formato === "2vs2_draft";
            const listaActual = esDraft
                ? (torneo.jugadores_individuales || [])
                : (torneo.participantes || []);

            if (listaActual.includes(uid)) {
                throw new Error("Ya estás inscripto en este torneo.");
            }

            if (listaActual.length >= torneo.cupos_totales) {
                throw new Error("Los cupos están llenos.");
            }

            const costo = torneo.costo_inscripcion || 0;
            if (costo > 0 && (usuario.number || 0) < costo) {
                throw new Error(`Saldo insuficiente. Necesitás ${costo} LFA Coins.`);
            }

            // Debitar saldo si tiene costo
            if (costo > 0) {
                tx.update(usuarioRef, {
                    number: admin.firestore.FieldValue.increment(-costo),
                });
            }

            // Agregar al jugador en el campo correcto según el formato
            const campoLista = esDraft ? "jugadores_individuales" : "participantes";
            tx.update(torneoRef, {
                [campoLista]: admin.firestore.FieldValue.arrayUnion(uid),
                // Si se llenaron los cupos en modo draft, pasar a esperando_sorteo
                ...(listaActual.length + 1 >= torneo.cupos_totales && esDraft
                    ? { estado: "esperando_sorteo" }
                    : {}),
            });

            return {
                success: true,
                esDraft,
                message: esDraft
                    ? "Inscripto en el Draft. El sorteo comenzará pronto."
                    : "Equipo inscripto exitosamente.",
            };
        });

        res.json(result);

    } catch (e) {
        console.error("Error en inscribirTorneoCoop:", e.message);
        res.json({ success: false, error: e.message });
    }
});

// ============================================================
// ⏰ AUTO-SPAWNER HORARIO — Crea 2 salas por modo cada hora
//    en la colección `tournaments` (sistema Arena 1VS1 Next.js)
// ============================================================
const { onSchedule } = require("firebase-functions/v2/scheduler");

// 14 slots × 2 juegos × 2 modos × 3 regiones = 168 plantillas
const SALA_SLOTS_SPAWN = [
    // [capacity, entry_fee]
    [2, 500],  [2, 2000],
    [4, 0],    [4, 500],
    [6, 0],    [6, 500],  [6, 2000],
    [8, 0],    [8, 500],  [8, 2000],
    [12, 500], [12, 2000],
    [16, 0],   [16, 10000],
];

const _SPAWN_GAMES = [
    { game: "FC26",      modes: ["GENERAL_95", "ULTIMATE"] },
    { game: "EFOOTBALL", modes: ["DREAM_TEAM", "GENUINOS"] },
];
const _SPAWN_REGIONS = ["LATAM_SUR", "LATAM_NORTE", "AMERICA"];

function getTierFromFee(entry_fee) {
    if (entry_fee === 0)    return "FREE";
    if (entry_fee < 1000)  return "RECREATIVO";
    if (entry_fee < 10000) return "COMPETITIVO";
    return "ELITE";
}

function calcPrizePool(capacity, entry_fee) {
    return Math.floor(capacity * entry_fee * 0.9);
}

function calcPrizes(capacity, entry_fee) {
    if (entry_fee === 0) return [{ place: 1, label: "🥇 1°", percentage: 100, coins: 0 }];
    const pot = calcPrizePool(capacity, entry_fee);
    if (capacity <= 8) return [{ place: 1, label: "🥇 1°", percentage: 100, coins: pot }];
    return [
        { place: 1, label: "🥇 1°", percentage: 70, coins: Math.floor(pot * 0.70) },
        { place: 2, label: "🥈 2°", percentage: 30, coins: Math.floor(pot * 0.30) },
    ];
}

const SPAWN_TEMPLATES = [];
for (const g of _SPAWN_GAMES) {
    for (const mode of g.modes) {
        for (const [capacity, entry_fee] of SALA_SLOTS_SPAWN) {
            for (const region of _SPAWN_REGIONS) {
                SPAWN_TEMPLATES.push({
                    game: g.game, mode, region, capacity, entry_fee,
                    tier: getTierFromFee(entry_fee),
                });
            }
        }
    }
}

async function runSpawnCycle() {
    const configDoc = await db.collection("configuracion").doc("spawner").get();
    if (!configDoc.exists || configDoc.data().activo !== true) {
        console.log("[Spawner] Desactivado en configuración, saltando ciclo.");
        return { created: 0, checked: SPAWN_TEMPLATES.length };
    }

    let created = 0;
    for (const tpl of SPAWN_TEMPLATES) {
        const snap = await db.collection("tournaments")
            .where("game",      "==", tpl.game)
            .where("mode",      "==", tpl.mode)
            .where("entry_fee", "==", tpl.entry_fee)
            .where("capacity",  "==", tpl.capacity)
            .where("region",    "==", tpl.region)
            .where("status",    "==", "OPEN")
            .get();

        const needed = Math.max(0, 2 - snap.size);
        if (needed === 0) continue;

        const batch = db.batch();
        for (let i = 0; i < needed; i++) {
            const ref = db.collection("tournaments").doc();
            batch.set(ref, {
                game:       tpl.game,
                mode:       tpl.mode,
                region:     tpl.region,
                tier:       tpl.tier,
                free:       tpl.entry_fee === 0,
                entry_fee:  tpl.entry_fee,
                prize_pool: calcPrizePool(tpl.capacity, tpl.entry_fee),
                prizes:     calcPrizes(tpl.capacity, tpl.entry_fee),
                capacity:   tpl.capacity,
                players:    [],
                status:     "OPEN",
                spawned:    true,
                created_at: admin.firestore.FieldValue.serverTimestamp(),
            });
            created++;
        }
        await batch.commit();
    }

    await db.collection("configuracion").doc("spawner").set({
        last_run:     admin.firestore.FieldValue.serverTimestamp(),
        last_created: created,
    }, { merge: true });

    console.log(`[Spawner] Ciclo completo. Salas nuevas: ${created}`);
    return { created, checked: SPAWN_TEMPLATES.length };
}

// Trigger automático cada hora
exports.autoSpawnHorario = onSchedule({
    schedule:  "0 * * * *",
    timeZone:  "America/Buenos_Aires",
    region:    "us-central1",
}, async () => {
    await runSpawnCycle();
});

// Trigger también cuando una sala se llena (reposición inmediata)
exports.reponerSalaArena = onDocumentUpdated("tournaments/{id}", async (event) => {
    const antes   = event.data.before.data();
    const despues = event.data.after.data();

    // Solo cuando pasa de OPEN a FULL o CLOSED
    if (antes.status !== "OPEN" || despues.status === "OPEN") return;
    if (!despues.spawned) return; // Solo salas auto-spawned

    try {
        const tpl = SPAWN_TEMPLATES.find(t =>
            t.game      === despues.game      &&
            t.mode      === despues.mode      &&
            t.entry_fee === despues.entry_fee &&
            t.capacity  === despues.capacity  &&
            t.region    === despues.region
        );
        if (!tpl) return;

        const snap = await db.collection("tournaments")
            .where("game",      "==", tpl.game)
            .where("mode",      "==", tpl.mode)
            .where("entry_fee", "==", tpl.entry_fee)
            .where("capacity",  "==", tpl.capacity)
            .where("region",    "==", tpl.region)
            .where("status",    "==", "OPEN")
            .get();

        const needed = Math.max(0, 2 - snap.size);
        if (needed === 0) return;

        const batch = db.batch();
        for (let i = 0; i < needed; i++) {
            const ref = db.collection("tournaments").doc();
            batch.set(ref, {
                game:       tpl.game,
                mode:       tpl.mode,
                region:     tpl.region,
                tier:       tpl.tier,
                free:       tpl.entry_fee === 0,
                entry_fee:  tpl.entry_fee,
                prize_pool: calcPrizePool(tpl.capacity, tpl.entry_fee),
                prizes:     calcPrizes(tpl.capacity, tpl.entry_fee),
                capacity:   tpl.capacity,
                players:    [],
                status:     "OPEN",
                spawned:    true,
                created_at: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
        await batch.commit();
        console.log(`[ReponerSala] ${needed} sala(s) reemplazadas para ${tpl.game}/${tpl.mode}/${tpl.tier}`);
    } catch (e) {
        console.error("[ReponerSala] Error:", e.message);
    }
});

// Endpoint HTTP para que el CEO dispare el spawn manualmente
exports.manualSpawn = functions.https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    if (req.method === "OPTIONS") {
        res.set("Access-Control-Allow-Methods", "POST");
        res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
        return res.status(204).send("");
    }
    try {
        const uid = await verificarIdentidad(req);
        await verificarAdmin(uid);
        const result = await runSpawnCycle();
        return res.json({ ok: true, ...result });
    } catch (e) {
        return res.status(403).json({ ok: false, error: e.message });
    }
});
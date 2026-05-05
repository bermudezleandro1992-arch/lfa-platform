/* eslint-disable */
// ligaPro.js — Liga 1vs1 PRO Cloud Functions (UTF-8)
// Required from index.js: require('./ligaPro')

const admin = require('firebase-admin');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule }         = require('firebase-functions/v2/scheduler');
const { FieldValue }         = require('firebase-admin/firestore');

const db = admin.firestore();
const CEO_UID_LIGA = '2bOrFxTAcPgFPoHKJHQfYxoQJpw1';

/** Round Robin bracket builder */
function buildRoundRobin(players) {
    const n     = players.length % 2 === 0 ? players.length : players.length + 1;
    const fixed = players[0];
    const rest  = players.slice(1);
    const rounds = [];
    for (let r = 0; r < n - 1; r++) {
        const round = [];
        const rRotated = [...rest.slice(r), ...rest.slice(0, r)];
        const all = [fixed, ...rRotated];
        for (let i = 0; i < n / 2; i++) {
            const home = all[i];
            const away = all[n - 1 - i];
            if (!home || !away || home.uid === undefined || away.uid === undefined) continue;
            round.push({ home, away });
        }
        rounds.push(round);
    }
    return rounds;
}

/** CEO-only: generate Round Robin fixture for a league */
exports.generateLeagueFixture = onCall({ region: 'us-central1' }, async (request) => {
    if (!request.auth || request.auth.uid !== CEO_UID_LIGA) {
        throw new HttpsError('permission-denied', 'Solo el CEO puede generar fixtures.');
    }
    const { leagueId } = request.data;
    if (!leagueId) throw new HttpsError('invalid-argument', 'leagueId requerido.');

    const leagueRef  = db.collection('leagues').doc(leagueId);
    const leagueSnap = await leagueRef.get();
    if (!leagueSnap.exists) throw new HttpsError('not-found', 'Liga no encontrada.');

    const league = leagueSnap.data();
    if (league.status !== 'inscripcion') {
        throw new HttpsError('failed-precondition', 'La liga no esta en inscripcion.');
    }

    const partSnap = await leagueRef.collection('participants').get();
    if (partSnap.size < 2) throw new HttpsError('failed-precondition', 'Minimo 2 participantes.');

    const players = partSnap.docs.map(d => ({ uid: d.id, ...d.data() }));
    const rounds  = buildRoundRobin(players);
    const batch   = db.batch();
    let matchCount = 0;

    rounds.forEach((roundMatches, roundIdx) => {
        roundMatches.forEach(({ home, away }) => {
            const mRef = db.collection('league_matches').doc();
            batch.set(mRef, {
                league_id: leagueId,
                round: roundIdx + 1,
                player1_uid: home.uid,
                player2_uid: away.uid,
                player1_name: home.display_name || '',
                player2_name: away.display_name || '',
                player1_team: home.team_name || '',
                player2_team: away.team_name || '',
                player1_logo: home.logo_url || '',
                player2_logo: away.logo_url || '',
                player1_whatsapp: home.whatsapp || '',
                player2_whatsapp: away.whatsapp || '',
                player1_platform_id: home.platform_id || '',
                player2_platform_id: away.platform_id || '',
                status: 'pending',
                score: null,
                winner_uid: null,
                photo_url: null,
                ocr_score: null,
                ocr_confidence: null,
                reported_by: null,
                validation_deadline: null,
                room_code: null,
                dispute_reason: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            });
            matchCount++;
        });
    });

    batch.update(leagueRef, {
        status: 'activa',
        current_round: 1,
        total_rounds: rounds.length,
    });

    await batch.commit();
    return { success: true, rounds: rounds.length, matches: matchCount };
});

/** Scheduled: auto-close validating matches that passed their deadline */
exports.autoCloseLeagueMatches = onSchedule({
    schedule: 'every 10 minutes',
    region:   'us-central1',
    timeZone: 'America/Buenos_Aires',
}, async () => {
    const now  = Date.now();
    const snap = await db.collection('league_matches')
        .where('status', '==', 'validating')
        .get();

    const expired = snap.docs.filter(d => {
        const dl = d.data().validation_deadline;
        return dl && dl <= now;
    });

    if (!expired.length) return;

    const batch = db.batch();

    for (const docSnap of expired) {
        const m  = docSnap.data();
        const s1 = (m.score && m.score[m.player1_uid]) || 0;
        const s2 = (m.score && m.score[m.player2_uid]) || 0;
        const w  = s1 > s2 ? m.player1_uid : s2 > s1 ? m.player2_uid : 'draw';

        batch.update(docSnap.ref, {
            status: 'closed',
            winner_uid: w,
            auto_closed: true,
            updated_at: new Date().toISOString(),
        });

        const lr  = db.collection('leagues').doc(m.league_id);
        const p1  = lr.collection('participants').doc(m.player1_uid);
        const p2  = lr.collection('participants').doc(m.player2_uid);

        batch.update(p1, {
            pj:  FieldValue.increment(1),
            gf:  FieldValue.increment(s1),
            gc:  FieldValue.increment(s2),
            pg:  FieldValue.increment(w === m.player1_uid ? 1 : 0),
            pe:  FieldValue.increment(w === 'draw' ? 1 : 0),
            pp:  FieldValue.increment(w === m.player2_uid ? 1 : 0),
            pts: FieldValue.increment(w === m.player1_uid ? 3 : w === 'draw' ? 1 : 0),
        });

        batch.update(p2, {
            pj:  FieldValue.increment(1),
            gf:  FieldValue.increment(s2),
            gc:  FieldValue.increment(s1),
            pg:  FieldValue.increment(w === m.player2_uid ? 1 : 0),
            pe:  FieldValue.increment(w === 'draw' ? 1 : 0),
            pp:  FieldValue.increment(w === m.player1_uid ? 1 : 0),
            pts: FieldValue.increment(w === m.player2_uid ? 3 : w === 'draw' ? 1 : 0),
        });
    }

    await batch.commit();
    console.log('[autoCloseLeagueMatches] Cerrados ' + expired.length + ' partidos expirados.');
});

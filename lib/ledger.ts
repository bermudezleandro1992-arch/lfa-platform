/**
 * lib/ledger.ts — Sistema de Libro Contable (Ledger) para LFA
 *
 * PRINCIPIOS:
 *  - Cada movimiento de coins genera una fila INMUTABLE en `transactions`.
 *  - El saldo del usuario es el resultado de sus transacciones (campo `balance_after`).
 *  - Toda operación es ATÓMICA: el saldo y el registro de tx se escriben juntos.
 *  - Race conditions eliminadas: nunca se usa FieldValue.increment en lógica con saldo
 *    variable; dentro de un runTransaction se lee y luego se escribe el valor absoluto.
 *  - Integrity check suave: si `number` difiere del último `balance_after`, se genera
 *    una alerta en `alertas_ceo` pero no se bloquea al usuario (migracion gradual).
 *
 * CAMPOS obligatorios por transacción:
 *  userId        — UID del usuario afectado
 *  type          — enum LedgerType
 *  amount        — positivo = crédito, negativo = débito (en LFA Coins)
 *  status        — 'pending' | 'completed' | 'rejected'
 *  balance_after — saldo del usuario luego de aplicar esta transacción
 *  reference_id  — ID externo (tournamentId, matchId, TxID Binance, etc.)
 *  description   — texto legible por humanos
 *  created_at    — serverTimestamp
 *  updated_at    — serverTimestamp (cambia cuando el status cambia)
 *  timestamp     — alias de created_at para compatibilidad con queries antiguos
 */

import { FieldValue, type Transaction, type DocumentReference } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';

// ── Tipos ──────────────────────────────────────────────────────────────────────

export type LedgerType =
  | 'TOURNAMENT_ENTRY'    // Débito: inscripción a torneo pago
  | 'FREE_ENTRY'          // Sin movimiento: registro de entrada a sala gratuita
  | 'TOURNAMENT_PRIZE'    // Crédito: premio ganado en torneo
  | 'REFUND'              // Crédito: reembolso por salida de torneo
  | 'DEPOSIT'             // Crédito: recarga de saldo (Binance, MP, etc.)
  | 'WITHDRAWAL_PENDING'  // Débito: retiro solicitado (estado inicial)
  | 'WITHDRAWAL_COMPLETED'// (sin movimiento extra) — solo cambia status
  | 'WITHDRAWAL_REFUND'   // Crédito: reembolso por retiro fallido
  | 'REFERRAL_BONUS'      // Crédito: bono por referido que jugó torneo pago
  | 'PLATFORM_FEE'        // Débito: fee de plataforma separado del entry fee
  | 'TREASURY_SWEEP'      // Débito: barrido de fondos al tesoro CEO
  | 'ADMIN_ADJUSTMENT';   // Ajuste manual por CEO/admin (requiere motivo)

export type LedgerStatus = 'pending' | 'completed' | 'rejected';

export interface LedgerEntryInput {
  type: LedgerType;
  /** Positivo = crédito, negativo = débito (en LFA Coins) */
  amount: number;
  /** Por defecto 'completed'. Usar 'pending' para retiros hasta confirmar Binance. */
  status?: LedgerStatus;
  /** ID externo: torneoId, matchId, TxID Binance, retiroId, etc. */
  reference_id?: string;
  /** Texto legible para el usuario/CEO en historial */
  description?: string;
}

export interface LedgerResult {
  newBalance: number;
  /** ID del documento en la colección `transactions` */
  ledgerTxId: string;
}

// ── writeLedgerEntry: helper INLINE para usar dentro de runTransaction ─────────

/**
 * Aplica una entrada de ledger DENTRO de un runTransaction existente.
 *
 * - Escribe el documento en `transactions` con todos los campos del ledger.
 * - Actualiza `number` en el documento del usuario al valor absoluto calculado.
 * - Lanza error si el balance resultante sería negativo.
 *
 * @param tx             — Objeto Transaction de Firestore
 * @param userRef        — Referencia al documento del usuario
 * @param userId         — UID del usuario
 * @param currentBalance — Saldo leído DENTRO de esta misma transacción
 * @param entry          — Datos del movimiento
 * @returns { newBalance, ledgerTxId }
 */
export function writeLedgerEntry(
  tx: Transaction,
  userRef: DocumentReference,
  userId: string,
  currentBalance: number,
  entry: LedgerEntryInput,
): LedgerResult {
  const newBalance = currentBalance + entry.amount;

  if (newBalance < 0) {
    throw new Error(
      `Saldo insuficiente. Disponible: ${currentBalance.toLocaleString()} coins.`,
    );
  }

  const ledgerRef = adminDb.collection('transactions').doc();
  const now = FieldValue.serverTimestamp();

  tx.set(ledgerRef, {
    userId,
    type:          entry.type,
    amount:        entry.amount,
    status:        entry.status ?? 'completed',
    balance_after: newBalance,
    reference_id:  entry.reference_id ?? '',
    description:   entry.description ?? '',
    // `timestamp` se mantiene para compatibilidad con queries/índices anteriores
    timestamp:     now,
    created_at:    now,
    updated_at:    now,
  });

  // Usamos el valor absoluto (no increment) porque estamos dentro de un runTransaction
  // que ya leyó el saldo — el driver reintentará si hay conflicto concurrente.
  tx.update(userRef, { number: newBalance });

  return { newBalance, ledgerTxId: ledgerRef.id };
}

// ── ledgerEntry: versión standalone (crea su propia transacción) ───────────────

/**
 * Crea o débita el balance de un usuario en una transacción Firestore independiente.
 * Incluye un integrity check suave: si `number` difiere del último `balance_after`
 * registrado, genera una alerta en `alertas_ceo` (sin bloquear al usuario).
 *
 * Usar cuando NO hay un runTransaction preexistente al que sumarse.
 */
export async function ledgerEntry(
  userId: string,
  entry: LedgerEntryInput,
): Promise<LedgerResult> {
  const userRef   = adminDb.collection('usuarios').doc(userId);
  const ledgerRef = adminDb.collection('transactions').doc();
  let newBalance  = 0;

  await adminDb.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) throw new Error('Usuario no encontrado.');

    const data           = userSnap.data()!;
    const currentBalance = (data.number ?? data.coins ?? 0) as number;
    newBalance           = currentBalance + entry.amount;

    if (newBalance < 0) {
      throw new Error(
        `Saldo insuficiente. Disponible: ${currentBalance.toLocaleString()} coins.`,
      );
    }

    // ── Integrity check suave ──────────────────────────────────────────────
    // Se hace FUERA del objeto `tx` para evitar lecturas extra en la transacción
    // (podría fallar si el índice no existe aún). El try/catch absorbe el error.
    integrityCheckAsync(userId, currentBalance).catch(() => {});

    const now = FieldValue.serverTimestamp();
    tx.set(ledgerRef, {
      userId,
      type:          entry.type,
      amount:        entry.amount,
      status:        entry.status ?? 'completed',
      balance_after: newBalance,
      reference_id:  entry.reference_id ?? '',
      description:   entry.description ?? '',
      timestamp:     now,
      created_at:    now,
      updated_at:    now,
    });

    tx.update(userRef, { number: newBalance });
  });

  return { newBalance, ledgerTxId: ledgerRef.id };
}

// ── updateLedgerStatus: cambia el status de una entrada pendiente ──────────────

/**
 * Actualiza el estado de una entrada de ledger existente.
 * Uso típico: WITHDRAWAL_PENDING → 'completed' cuando Binance confirma.
 *
 * @param transactionId — ID del documento en `transactions`
 * @param status        — Nuevo estado
 * @param extra         — Campos adicionales a actualizar (ej: reference_id con TxID Binance)
 */
export async function updateLedgerStatus(
  transactionId: string,
  status: LedgerStatus,
  extra?: Record<string, unknown>,
): Promise<void> {
  await adminDb.collection('transactions').doc(transactionId).update({
    status,
    updated_at: FieldValue.serverTimestamp(),
    ...extra,
  });
}

// ── integrityCheckAsync: verificación asíncrona fuera de transacción ───────────

/**
 * Verifica que el saldo actual del usuario coincida con el último `balance_after`
 * registrado en el ledger. Si difiere, genera una alerta en `alertas_ceo`.
 * Esta función es fire-and-forget (no lanza excepciones).
 */
async function integrityCheckAsync(userId: string, currentBalance: number): Promise<void> {
  try {
    const lastTxSnap = await adminDb
      .collection('transactions')
      .where('userId', '==', userId)
      .orderBy('created_at', 'desc')
      .limit(1)
      .get();

    if (lastTxSnap.empty) return; // primer movimiento, nada que verificar

    const lastTx = lastTxSnap.docs[0].data();
    if (lastTx.balance_after === undefined) return; // tx antigua sin balance_after

    if (lastTx.balance_after !== currentBalance) {
      const diff = currentBalance - (lastTx.balance_after as number);
      console.warn(
        `[Ledger] ⚠️ Discrepancy for ${userId}: ` +
        `current=${currentBalance}, last_balance_after=${lastTx.balance_after}, diff=${diff}`,
      );
      await adminDb.collection('alertas_ceo').add({
        tipo:               'LEDGER_DISCREPANCY',
        userId,
        currentBalance,
        lastTxId:           lastTxSnap.docs[0].id,
        lastTxBalanceAfter: lastTx.balance_after,
        diff,
        fecha:              FieldValue.serverTimestamp(),
        revisado:           false,
      });
    }
  } catch {
    // El índice compuesto puede no existir aún — ignorar silenciosamente
  }
}

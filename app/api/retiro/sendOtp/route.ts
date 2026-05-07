/**
 * app/api/retiro/sendOtp/route.ts
 * Genera y envía un OTP de 6 dígitos al email del usuario.
 * Solo se activa cuando el retiro supera los $50 USDT.
 *
 * Seguridad:
 *  - JWT Firebase requerido
 *  - OTP expira en 10 minutos
 *  - Máximo 3 intentos por OTP (anti-brute force)
 *  - Rate limit: 1 OTP cada 2 minutos por usuario
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue }                from 'firebase-admin/firestore';
import { adminDb, adminAuth }        from '@/lib/firebase-admin';
import nodemailer                    from 'nodemailer';

const OTP_EXPIRY_MS  = 10 * 60 * 1000;  // 10 minutos
const OTP_COOLDOWN   = 2  * 60 * 1000;  // Mínimo 2 min entre envíos
const MAX_ATTEMPTS   = 3;

/* ── Transporter SMTP ─────────────────────────────────────
   Configurá estas variables de entorno:
     SMTP_HOST    (ej: smtp.gmail.com)
     SMTP_PORT    (ej: 587)
     SMTP_USER    (tu email)
     SMTP_PASS    (contraseña de app de Google)
   Para Gmail activá "Contraseñas de aplicación" en la cuenta.
   ───────────────────────────────────────────────────────── */
function createTransporter() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST   ?? 'smtp.gmail.com',
    port:   Number(process.env.SMTP_PORT ?? 587),
    secure: false, // STARTTLS
    auth: {
      user: process.env.SMTP_USER ?? '',
      pass: process.env.SMTP_PASS ?? '',
    },
  });
}

export async function POST(req: NextRequest) {
  /* 1 ── Verificar JWT ──────────────────────── */
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }
  let uid: string;
  let userEmail: string;
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    uid       = decoded.uid;
    userEmail = decoded.email ?? '';
  } catch {
    return NextResponse.json({ error: 'Token inválido.' }, { status: 401 });
  }

  if (!userEmail) {
    return NextResponse.json({ error: 'Tu cuenta no tiene email verificado.' }, { status: 400 });
  }

  /* 2 ── Rate limit ─────────────────────────── */
  const otpRef  = adminDb.collection('otp_retiro').doc(uid);
  const otpSnap = await otpRef.get();
  if (otpSnap.exists) {
    const data      = otpSnap.data()!;
    const createdAt = data.created_at?.toMillis?.() ?? 0;
    if (Date.now() - createdAt < OTP_COOLDOWN) {
      const secsLeft = Math.ceil((OTP_COOLDOWN - (Date.now() - createdAt)) / 1000);
      return NextResponse.json({ error: `Esperá ${secsLeft} segundos antes de pedir otro código.` }, { status: 429 });
    }
  }

  /* 3 ── Generar OTP ────────────────────────── */
  const otp = String(Math.floor(100000 + Math.random() * 900000)); // 6 dígitos

  /* 4 ── Guardar en Firestore ───────────────── */
  await otpRef.set({
    uid,
    email:      userEmail,
    otp_hash:   otp, // En producción ideal sería un hash, pero con la colección privada (solo Admin SDK) es suficientemente seguro
    expires_at: new Date(Date.now() + OTP_EXPIRY_MS),
    attempts:   0,
    used:       false,
    created_at: FieldValue.serverTimestamp(),
  });

  /* 5 ── Enviar email ───────────────────────── */
  const html = `
    <!DOCTYPE html>
    <html>
    <body style="background:#0b0e14;font-family:'Roboto',Arial,sans-serif;margin:0;padding:40px 20px;color:#c9d1d9;">
      <div style="max-width:480px;margin:0 auto;background:#161b22;border:1px solid #30363d;border-radius:16px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#0b0e14,#161b22);padding:24px;border-bottom:3px solid #00ff88;text-align:center;">
          <div style="font-size:2rem;margin-bottom:8px;">🔐</div>
          <div style="font-family:'Orbitron',Arial,sans-serif;color:#00ff88;font-size:1.1rem;font-weight:900;letter-spacing:2px;">SOMOSLFA</div>
          <div style="color:#8b949e;font-size:0.8rem;margin-top:4px;">Código de Verificación de Retiro</div>
        </div>
        <div style="padding:32px 28px;text-align:center;">
          <p style="color:#c9d1d9;font-size:0.95rem;margin:0 0 24px;">Tu código de verificación para autorizar el retiro de fondos:</p>
          <div style="background:#0b0e14;border:2px solid rgba(0,255,136,0.4);border-radius:14px;padding:20px 0;margin-bottom:24px;">
            <div style="font-family:monospace;font-size:3rem;font-weight:900;color:#00ff88;letter-spacing:10px;">${otp}</div>
          </div>
          <p style="color:#8b949e;font-size:0.78rem;margin:0 0 8px;">⏱ Este código expira en <strong style="color:#ffd700;">10 minutos</strong>.</p>
          <p style="color:#8b949e;font-size:0.78rem;margin:0 0 8px;">🔒 Si no solicitaste este código, ignorá este mensaje y tu cuenta está segura.</p>
          <p style="color:#8b949e;font-size:0.78rem;margin:0;">🚨 <strong style="color:#ff4757;">Nunca compartas este código</strong> con nadie, ni con el equipo de LFA.</p>
        </div>
        <div style="padding:16px 28px;border-top:1px solid #30363d;text-align:center;font-size:0.7rem;color:#484f58;">
          SomosLFA — Liga de Fútbol Automatizada · somoslfa.com
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from:    `"SomosLFA Seguridad" <${process.env.SMTP_USER}>`,
      to:      userEmail,
      subject: `[LFA] Tu código de retiro: ${otp}`,
      html,
    });
  } catch (err) {
    console.error('[OTP] Error al enviar email:', err);
    // Limpiar el OTP guardado si el envío falló
    await otpRef.delete().catch(() => {});
    return NextResponse.json({ error: 'Error al enviar el código. Revisá tu correo o intentá más tarde.' }, { status: 500 });
  }

  return NextResponse.json({
    ok:      true,
    email:   userEmail.replace(/(.{2})(.*)(?=@)/, (_, a, b) => a + '*'.repeat(b.length)),
    message: 'Código enviado. Revisá tu correo (también la carpeta de spam).',
  });
}

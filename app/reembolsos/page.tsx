'use client';
import LegalLayout from '@/app/_components/LegalLayout';

export default function ReembolsosPage() {
  return (
    <LegalLayout title="POLÍTICA DE REEMBOLSOS Y CANCELACIONES" emoji="⚖️" accentColor="#00ff88" h2Color="#ffd700" date="Abril 2026">

      <p className="legal-p">La presente Política de Reembolsos y Cancelaciones forma parte integral de los Términos y Condiciones de LFA y debe leerse en conjunto con ellos. Al realizar cualquier depósito o inscripción, el usuario declara haber leído y aceptado esta política.</p>

      <h2 className="legal-h2">1. REEMBOLSO DE LFA COINS — COMPRAS NO UTILIZADAS</h2>
      <ul className="legal-ul">
        <li>Si adquiriste LFA Coins y <strong>no utilizaste ninguna</strong> de las monedas de ese pack, podés solicitar el reembolso del <strong>100% del importe abonado</strong> dentro de los <strong>14 días calendario</strong> posteriores a la fecha de la compra.</li>
        <li>El reembolso se procesará al <strong>mismo método de pago utilizado</strong> para la compra original (CBU/CVU, billetera virtual o Binance). El tiempo de acreditación dependerá del procesador de pago y puede demorar entre 3 y 10 días hábiles.</li>
        <li>LFA podrá deducir del reembolso los <strong>costos de transacción no recuperables</strong> cobrados por los procesadores de pago (comisiones bancarias, tarifas de red blockchain, etc.), informando el monto exacto al usuario antes de procesar la solicitud.</li>
        <li>Las solicitudes de reembolso deben realizarse exclusivamente a través del correo <strong>somoslfasoporte@gmail.com</strong>, indicando el número de comprobante de pago provisto por dLocal Go o Binance Pay, el ID de usuario LFA y el motivo de la solicitud.</li>
      </ul>

      <h2 className="legal-h2">2. COMPRAS UTILIZADAS — SIN DERECHO A REEMBOLSO</h2>
      <ul className="legal-ul">
        <li>Si utilizaste una parte o la totalidad de las LFA Coins adquiridas para inscribirte en torneos o cualquier otra acción dentro de la Plataforma, <strong>perdés automáticamente el derecho a reembolso</strong> sobre las monedas consumidas.</li>
        <li>Las LFA Coins consumidas no son reembolsables bajo ninguna circunstancia, incluyendo cambios de opinión, resultados adversos en torneos o abandono voluntario de la plataforma.</li>
      </ul>

      <h2 className="legal-h2">3. CANCELACIÓN DE INSCRIPCIÓN A TORNEOS</h2>
      <ul className="legal-ul">
        <li><strong>Cancelación anticipada:</strong> Podés solicitar la devolución de tus LFA Coins de inscripción siempre que la sala del torneo <strong>no esté completa</strong> o falten <strong>más de 24 horas</strong> para el inicio programado. Las monedas se acreditan de forma inmediata en tu Billetera LFA, sin costo adicional.</li>
        <li><strong>Torneo iniciado o llaves cerradas:</strong> Una vez que la sala se completa, se generan los enfrentamientos (bracket) o el torneo da inicio, <strong>no se realizarán reembolsos de inscripción</strong>.</li>
        <li><strong>No presentación (W.O.):</strong> Si no te presentás a jugar tu partido dentro del tiempo límite establecido, perderás la ronda por W.O. (Walkover) y no serán devueltas las LFA Coins de inscripción.</li>
        <li><strong>Cancelación por LFA:</strong> Si LFA cancela un torneo por no alcanzar el mínimo de participantes, falla técnica o causas de fuerza mayor, se devolverá el <strong>100%</strong> de las LFA Coins de inscripción a todos los participantes sin descuento ni demora.</li>
      </ul>

      <h2 className="legal-h2">4. SUSPENSIONES, BANNEOS Y PÉRDIDA DE FONDOS</h2>
      <p className="legal-p">Si tu cuenta es suspendida o baneada permanentemente por violar el Reglamento Oficial (incluyendo, sin limitarse a: uso de VPN, falsificación de pruebas en el sistema VAR, toxicidad grave, múltiples cuentas o colusión), <strong>perderás el acceso a la totalidad de tu saldo de LFA Coins y no serás elegible para ningún tipo de reembolso ni retiro de fondos.</strong> Esta medida responde a la necesidad de proteger la integridad competitiva y los fondos de los demás participantes de la comunidad.</p>

      <h2 className="legal-h2">5. RETIROS DE GANANCIAS — ACLARACIÓN</h2>
      <p className="legal-p">Los retiros de LFA Coins hacia tu cuenta bancaria o billetera cripto <strong>no constituyen reembolsos</strong>, sino <strong>extracción de ganancias legítimas</strong> obtenidas en torneos. Están sujetos a la auditoría de seguridad de LFA para verificar que las monedas fueron ganadas de manera legítima y no mediante fraude o violaciones al Reglamento. El procesamiento toma de <strong>24 a 72 horas hábiles</strong> tras la aprobación.</p>

      <h2 className="legal-h2">6. POLÍTICA DE CONTRACARGOS (CHARGEBACKS)</h2>
      <p className="legal-p">LFA se reserva el derecho de <strong>suspender preventivamente</strong> la cuenta de un usuario que inicie un contracargo (chargeback) ante su entidad financiera o procesador de pago, hasta que la situación sea resuelta. La apertura de un contracargo fraudulento (por compras efectivamente realizadas y cuyo servicio fue prestado) resultará en el baneo permanente de la cuenta y la pérdida del saldo disponible, además de las acciones legales que correspondan.</p>

      <h2 className="legal-h2">7. CÓMO SOLICITAR UN REEMBOLSO</h2>
      <p className="legal-p">Para iniciar una solicitud de reembolso sobre una compra no utilizada dentro del plazo habilitado, seguí estos pasos:</p>
      <ul className="legal-ul">
        <li>Enviá un correo a <strong>somoslfasoporte@gmail.com</strong> con el asunto: <em>&quot;Solicitud de Reembolso — [tu ID de usuario LFA]&quot;</em>.</li>
        <li>Adjuntá el comprobante de pago original provisto por dLocal Go o Binance Pay.</li>
        <li>Indicá el motivo de la solicitud y el método de pago al que deseas recibir el reembolso.</li>
        <li>LFA te responderá en un plazo máximo de <strong>72 horas hábiles</strong> confirmando o rechazando la solicitud con la fundamentación correspondiente.</li>
      </ul>

      <div style={{ marginTop: 40, paddingTop: 20, borderTop: '1px solid #30363d', fontSize: '0.85rem', color: '#8b949e', textAlign: 'center' }}>
        <strong>Versión vigente:</strong> Abril 2026. Soporte: <strong>somoslfasoporte@gmail.com</strong> — La presente política cumple con la Ley N° 24.240 de Defensa del Consumidor de la República Argentina.
      </div>

    </LegalLayout>
  );
}

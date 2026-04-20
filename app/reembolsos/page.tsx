'use client';
import LegalLayout from '@/app/_components/LegalLayout';

// export const metadata = { title: 'Política de Reembolsos | SomosLFA' };

export default function ReembolsosPage() {
  return (
    <LegalLayout title="POLÍTICA DE REEMBOLSOS Y CANCELACIONES" emoji="⚖️" accentColor="#00ff88" h2Color="#ffd700" date="Marzo 2026">

      <h2 className="legal-h2">1. Reembolso de LFA Coins (Moneda Virtual)</h2>
      <ul className="legal-ul">
        <li><b>Compras No Utilizadas:</b> Si compraste un pack de LFA Coins por error, podés solicitar el reembolso del 100% de tu dinero dentro de los <b>primeros 14 días</b> posteriores a la compra, <b>siempre y cuando NO hayas gastado ninguna moneda</b> de ese pack. El dinero se devolverá al mismo método de pago utilizado.</li>
        <li><b>Compras Utilizadas:</b> Si compraste LFA Coins y utilizaste una parte o la totalidad para inscribirte en torneos, comprar mejoras o cualquier otra acción dentro de la plataforma, <b>perdés automáticamente el derecho a reembolso</b>. Las monedas virtuales consumidas no son reembolsables bajo ninguna circunstancia.</li>
      </ul>

      <h2 className="legal-h2">2. Cancelación de Inscripciones a Torneos</h2>
      <ul className="legal-ul">
        <li><b>Antes del cierre de llaves:</b> Si te inscribiste en un torneo usando tus LFA Coins, podés cancelar tu inscripción y recibir tus monedas de vuelta en tu Billetera LFA siempre que falten al menos <b>24 horas para el inicio</b> o la sala aún no se haya llenado.</li>
        <li><b>Torneo en curso o llaves cerradas:</b> Una vez que la sala se llena, se generan los cruces (bracket) o el torneo comienza, <b>no se realizarán reembolsos de inscripción</b>. Si no te presentás a jugar, perderás el partido por W.O. (Walkover) y no se te devolverán las LFA Coins.</li>
      </ul>

      <h2 className="legal-h2">3. Suspensiones y Banneos (Trust Factor)</h2>
      <p className="legal-p">Si tu cuenta es suspendida o baneada permanentemente por violar el Reglamento Oficial (ej. uso de VPN, falsificación de pruebas en el VAR, toxicidad, múltiples cuentas), <b>perderás el acceso a todo tu saldo de LFA Coins y NO serás elegible para ningún tipo de reembolso</b> ni retiro de dinero.</p>

      <h2 className="legal-h2">4. Retiros de Ganancias (Withdrawals)</h2>
      <p className="legal-p">Los retiros de LFA Coins hacia tu cuenta bancaria (dinero real) no se consideran reembolsos, sino &quot;Extracción de Ganancias&quot;. Estos están sujetos a la auditoría de nuestro equipo de seguridad para verificar que las monedas fueron ganadas legítimamente en torneos y no mediante fraude.</p>

      <h2 className="legal-h2">5. ¿Cómo solicitar un reembolso?</h2>
      <p className="legal-p">Para iniciar una solicitud sobre una compra no utilizada, debes contactar a nuestro soporte a través del chat en vivo del Dashboard o enviando un correo a <b>somoslfasoporte@gmail.com</b> indicando tu ID de Jugador y el número de comprobante de pago proporcionado por dLocal GO o Binance Pay.</p>

    </LegalLayout>
  );
}

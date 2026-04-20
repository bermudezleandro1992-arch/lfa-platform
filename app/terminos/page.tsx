'use client';
import LegalLayout from '@/app/_components/LegalLayout';

// metadata solo funciona en server components; el título se setea via document.title en client
// export const metadata = { title: 'Términos y Condiciones | SomosLFA' };

export default function TerminosPage() {
  return (
    <LegalLayout title="TÉRMINOS Y CONDICIONES DE USO" emoji="📋" accentColor="#ffd700" h2Color="#00ff88" date="Marzo 2026">

      <h2 className="legal-h2">1. ACEPTACIÓN Y CAPACIDAD LEGAL</h2>
      <p className="legal-p">Al acceder, registrarse y utilizar la plataforma de Liga de Fútbol Automatizada (en adelante, &quot;LFA&quot;), el usuario declara ser <strong>mayor de 18 años</strong> y tener la capacidad legal necesaria para aceptar estos Términos y Condiciones. El acceso a menores de edad está estrictamente prohibido y resultará en la clausura inmediata de la cuenta y retención de fondos.</p>

      <h2 className="legal-h2">2. NATURALEZA DEL SERVICIO (JUEGOS DE HABILIDAD)</h2>
      <p className="legal-p">LFA es una plataforma que facilita la organización de torneos competitivos de videojuegos (eSports). Los premios obtenidos en LFA se basan única y exclusivamente en la <strong>habilidad y destreza del jugador</strong>. LFA no ofrece juegos de azar, apuestas deportivas tradicionales ni loterías.</p>

      <h2 className="legal-h2">3. LFA COINS Y COMISIONES</h2>
      <ul className="legal-ul">
        <li><strong>Valor:</strong> La moneda virtual de la plataforma es la &quot;LFA Coin&quot;. Su valor base equivale a 1 USD (Dólar Cripto/USDT).</li>
        <li><strong>Uso:</strong> Las LFA Coins solo pueden ser utilizadas para abonar inscripciones a torneos dentro de la plataforma.</li>
        <li><strong>Comisión de Plataforma (Fee):</strong> LFA retiene de forma automática una comisión del <strong>10% sobre el pozo total</strong> acumulado de cada torneo en concepto de uso de infraestructura, mantenimiento de servidores y arbitraje de Inteligencia Artificial. El 90% restante se reparte entre los ganadores según la escala del torneo.</li>
        <li><strong>Depósitos:</strong> Los fondos ingresados (vía dLocal Go, Binance Pay, etc.) se acreditarán en la billetera del usuario tras la confirmación de la red.</li>
      </ul>

      <h2 className="legal-h2">4. POLÍTICA DE RETIROS DE FONDOS</h2>
      <ul className="legal-ul">
        <li>El usuario podrá solicitar el retiro de sus ganancias desde el Dashboard. <strong>El monto mínimo de retiro es de 15 LFA Coins.</strong></li>
        <li>LFA se reserva el derecho de <strong>auditar la cuenta</strong> y los resultados históricos antes de liberar un pago para verificar que no haya existido fraude, uso de VPNs, colusión o trampas.</li>
        <li>Los retiros se procesarán vía CBU/CVU, billeteras virtuales o Binance, y pueden demorar de 24 a 72 horas hábiles tras la auditoría de seguridad.</li>
        <li>LFA deducirá las comisiones correspondientes a impuestos, costos de transferencia bancaria o tarifas de la red blockchain (en caso de criptomonedas) del monto retirado.</li>
      </ul>

      <h2 className="legal-h2">5. RESPONSABILIDAD DE LA PLATAFORMA</h2>
      <p className="legal-p">LFA no está afiliada, asociada ni patrocinada por EA Sports, Konami, Sony PlayStation, Microsoft Xbox ni cualquier desarrollador de los videojuegos utilizados para competir. LFA actúa únicamente como un servicio de emparejamiento (matchmaking) y gestión de premios (escrow) entre los jugadores.</p>

    </LegalLayout>
  );
}

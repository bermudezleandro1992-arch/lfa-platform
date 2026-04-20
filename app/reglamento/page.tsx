'use client';
import LegalLayout from '@/app/_components/LegalLayout';

// export const metadata = { title: 'Reglamento Oficial | SomosLFA' };

export default function ReglamentoPage() {
  return (
    <LegalLayout title="REGLAMENTO OFICIAL DE JUEGO LFA" emoji="📜" accentColor="#00ff88" h2Color="#ffd700" date="Marzo 2026">

      <h2 className="legal-h2">1. DISPOSICIONES GENERALES Y MODOS DE JUEGO</h2>
      <ul className="legal-ul">
        <li>La Liga de Fútbol Automatizada (LFA) organiza torneos en EA SPORTS FC 26 (Crossplay) y eFootball (Consolas/PC y Mobile).</li>
        <li>En FC 26, los torneos se juegan en modo &quot;Ultimate Team&quot; o &quot;Global 95&quot; (todos los jugadores con media 95).</li>
        <li>En eFootball, los torneos se dividen en &quot;Dream Team&quot; y &quot;Equipos Genuinos&quot;.</li>
      </ul>

      <h2 className="legal-h2">2. CONDUCTA Y JUEGO LIMPIO (TRUST FACTOR)</h2>
      <ul className="legal-ul">
        <li><strong>Tolerancia Cero a la Toxicidad:</strong> Insultos o actitudes antideportivas resultarán en el baneo de la cuenta.</li>
        <li><strong>Rage Quit (Abandono Intencional):</strong> Desconectarse antes del silbatazo final conlleva la pérdida automática (3-0 en contra).</li>
        <li>El sistema de <strong>Fair Play (Trust Factor)</strong> evalúa tu comportamiento. Bajar del 60% congelará temporalmente tu billetera para retiros. <strong>¿Cómo subirlo?</strong> Jugando de forma limpia. El sistema te premia automáticamente con puntos positivos de Fair Play cada vez que finalizas un torneo sin reportes en contra.</li>
      </ul>

      <h2 className="legal-h2">3. SISTEMA DE REGIONES Y CONEXIÓN</h2>
      <div className="warning-box">
        <strong style={{ color: '#ff4757' }}>ESTRICTAMENTE PROHIBIDO:</strong> El uso de VPNs, Proxies o manipulación de red para evadir los bloqueos regionales resultará en la expulsión inmediata. El VAR audita la IP de los jugadores.
      </div>
      <ul className="legal-ul">
        <li>Si un jugador experimenta lag extremo debido a la conexión de su rival, debe grabar la pantalla (mostrando el medidor de ping) y abandonar el partido <strong>antes del minuto 15 del primer tiempo en el juego</strong>. Si se abandona después de ese límite, el resultado parcial será válido.</li>
      </ul>

      <h2 className="legal-h2">4. REPORTE DE RESULTADOS Y SISTEMA VAR (IA)</h2>
      <ul className="legal-ul">
        <li>Solo el <strong>GANADOR</strong> debe subir la foto del resultado. Si hay empate durante las rondas eliminatorias, se debe definir por <strong>Penales directos</strong> (Sin tiempo extra). Solo en la <strong>Gran Final</strong> se jugará con Tiempo Extra y Penales.</li>
        <li><strong>Prueba Obligatoria:</strong> La foto debe mostrar claramente los ID de ambos jugadores y el marcador final. No debe estar editada, recortada ni tapada por notificaciones de la consola/batería.</li>
        <li><strong>Penalización por Fraude:</strong> Subir intencionalmente una foto donde el marcador indica una derrota, o una foto falsa/vieja para intentar engañar al BOT IA, resultará en una multa automática de <strong>-15% en los puntos de Fair Play</strong>.</li>
        <li>En caso de discrepancia (Disputa Oficial), el Staff revisará las pruebas. Si se detecta que un jugador miente para ganar tiempo, será sancionado. Las decisiones de la Administración son inapelables.</li>
      </ul>

      <div style={{ marginTop: 40, paddingTop: 20, borderTop: '1px solid #30363d', fontSize: '0.85rem', color: '#8b949e', textAlign: 'center' }}>
        <strong>Nota Legal:</strong> LFA se reserva el derecho de modificar, actualizar o ampliar este reglamento en cualquier momento para preservar la integridad competitiva de la plataforma. Es responsabilidad del jugador mantenerse informado sobre las normativas vigentes.
      </div>

    </LegalLayout>
  );
}

'use client';
import LegalLayout from '@/app/_components/LegalLayout';

export default function ReglamentoPage() {
  return (
    <LegalLayout title="REGLAMENTO OFICIAL DE JUEGO LFA" emoji="📜" accentColor="#00ff88" h2Color="#ffd700" date="Abril 2026">

      <h2 className="legal-h2">1. DISPOSICIONES GENERALES</h2>
      <ul className="legal-ul">
        <li>La Liga de Fútbol Automatizada (<strong>LFA</strong>), operada bajo el dominio <strong>somoslfa.com</strong>, organiza torneos competitivos de videojuegos en las plataformas EA SPORTS FC 26 (Crossplay) y eFootball (Consolas, PC y Mobile).</li>
        <li>La participación en cualquier torneo implica la <strong>aceptación plena, expresa e incondicional</strong> del presente Reglamento, los Términos y Condiciones, la Política de Privacidad y la Política de Reembolsos.</li>
        <li>LFA se reserva el derecho de modificar este Reglamento en cualquier momento. Los cambios serán publicados en somoslfa.com y entrarán en vigencia desde su publicación. Es responsabilidad exclusiva del jugador mantenerse informado.</li>
        <li>El acceso y la participación están <strong>estrictamente reservados a mayores de 18 años</strong>. Cualquier cuenta de menor de edad será clausurada y los fondos retenidos hasta que el titular acredite su mayoría de edad o se gestione el reembolso con un representante legal.</li>
      </ul>

      <h2 className="legal-h2">2. MODOS DE JUEGO Y FORMATOS DE TORNEO</h2>
      <ul className="legal-ul">
        <li><strong>EA SPORTS FC 26:</strong> Los torneos se disputan en modo <em>Ultimate Team</em> o <em>Global 95</em> (todos los jugadores con media 95), según lo especificado en la sala del torneo.</li>
        <li><strong>eFootball:</strong> Los torneos se dividen en modalidad <em>Dream Team</em> y <em>Equipos Genuinos</em>, según lo indicado en la sala.</li>
        <li>El formato del torneo (eliminación directa, grupos + playoffs, etc.), la cantidad de participantes, el pozo de premios y el desglose de ganancias se detallan en cada sala de torneo antes de la inscripción.</li>
        <li>LFA podrá cancelar un torneo si no alcanza el mínimo de participantes requerido, devolviendo las LFA Coins a todos los inscritos sin descuentos.</li>
      </ul>

      <h2 className="legal-h2">3. ELEGIBILIDAD E IDENTIDAD DEL JUGADOR</h2>
      <ul className="legal-ul">
        <li>Cada usuario solo puede poseer <strong>una (1) cuenta registrada</strong>. La detección de cuentas múltiples resultará en el baneo permanente de todas las cuentas involucradas y la pérdida total del saldo.</li>
        <li>El <strong>ID de Consola / PC / GamerTag</strong> ingresado al registrarse debe ser real, activo y de propiedad del usuario. Está prohibido usar el ID de otra persona.</li>
        <li>LFA podrá solicitar verificación adicional de identidad (captura de pantalla del perfil de la plataforma de juego) en cualquier momento, especialmente ante retiros de montos elevados o disputas activas.</li>
      </ul>

      <h2 className="legal-h2">4. CONDUCTA Y JUEGO LIMPIO — TRUST FACTOR</h2>
      <ul className="legal-ul">
        <li><strong>Tolerancia Cero a la Toxicidad:</strong> Insultos, acoso, discriminación o actitudes antideportivas dentro o fuera de la plataforma (incluyendo redes sociales relacionadas con LFA) resultarán en suspensión temporal o baneo permanente según la gravedad.</li>
        <li><strong>Rage Quit (Abandono Intencional):</strong> Desconectarse deliberadamente antes del final del partido conlleva la <strong>pérdida automática por 3-0</strong> y una penalización de Fair Play.</li>
        <li>El sistema de <strong>Trust Factor</strong> evalúa el historial de comportamiento de cada jugador. Si el Trust Factor cae por debajo del <strong>60%</strong>, la billetera quedará congelada para retiros hasta que se recupere el nivel mínimo.</li>
        <li>El Trust Factor sube automáticamente al completar torneos sin reportes en contra y con sportsmanship positivo.</li>
        <li>Está <strong>prohibida la colusión</strong> entre jugadores (acuerdo para manipular resultados). La detección de patrones de colusión mediante el sistema de análisis de LFA resultará en baneo permanente y pérdida de fondos.</li>
      </ul>

      <h2 className="legal-h2">5. SISTEMA DE REGIONES Y CONEXIÓN</h2>
      <div className="warning-box">
        <strong style={{ color: '#ff4757' }}>ESTRICTAMENTE PROHIBIDO:</strong> El uso de VPNs, Proxies, servidores DNS alternativos o cualquier método de manipulación de red para evadir los controles regionales. El sistema VAR de LFA audita la dirección IP en cada sesión. La primera detección resultará en suspensión; la reincidencia en baneo permanente.
      </div>
      <ul className="legal-ul">
        <li>Los torneos pueden estar restringidos a regiones geográficas específicas para garantizar la calidad de conexión entre los participantes.</li>
        <li>Si un jugador experimenta <strong>lag extremo verificable</strong> por culpa de la conexión del rival, debe <strong>grabar la pantalla mostrando el medidor de ping</strong> y retirarse del partido <strong>antes del minuto 15 del primer tiempo</strong> (tiempo de juego). Si el abandono ocurre después de ese límite, el resultado parcial será tomado como válido.</li>
        <li>Los problemas de conexión propios (corte de luz, internet, consola) no son motivo válido para solicitar la repetición del partido ni el reembolso de la inscripción.</li>
      </ul>

      <h2 className="legal-h2">6. REPORTE DE RESULTADOS Y SISTEMA VAR (IA)</h2>
      <ul className="legal-ul">
        <li>Solo el <strong>GANADOR</strong> está obligado a subir la foto del resultado en la sala del partido dentro del tiempo límite estipulado.</li>
        <li>En rondas eliminatorias con empate, el resultado se define por <strong>penales directos</strong> (sin tiempo extra). En la <strong>Gran Final</strong>, se jugará tiempo extra y, de persistir el empate, penales.</li>
        <li><strong>Requisitos de la prueba:</strong> La captura de pantalla debe mostrar con total claridad los <em>IDs de ambos jugadores</em> y el <em>marcador final</em>. No debe estar editada digitalmente, recortada de forma que omita información clave ni bloqueada por notificaciones del sistema.</li>
        <li>Las imágenes son procesadas por el <strong>Sistema VAR basado en Inteligencia Artificial</strong> (Google Cloud Vision API). La decisión del VAR es vinculante y ejecutada de forma automática.</li>
        <li><strong>Penalización por Fraude:</strong> Subir una imagen manipulada, falsa o de un resultado anterior para engañar al sistema resultará en una multa automática de <strong>-15 puntos de Trust Factor</strong> y puede derivar en baneo permanente con pérdida de fondos.</li>
        <li>En caso de <strong>Disputa Oficial</strong>, ambas partes deben presentar sus pruebas al Staff dentro de las <strong>24 horas</strong> posteriores al partido. El Staff resolverá en un plazo máximo de 72 horas. <strong>Las decisiones de la Administración son inapelables.</strong></li>
      </ul>

      <h2 className="legal-h2">7. TABLA DE SANCIONES</h2>
      <ul className="legal-ul">
        <li><strong>Lag / Abandono antes del min. 15:</strong> Repetición del partido (con prueba válida).</li>
        <li><strong>Rage Quit / Abandono injustificado:</strong> Derrota por 3-0 + penalización Trust Factor.</li>
        <li><strong>Falsificación de prueba (1ra vez):</strong> -15% Trust Factor + advertencia formal.</li>
        <li><strong>Falsificación de prueba (reincidencia):</strong> Baneo permanente + pérdida de saldo.</li>
        <li><strong>Uso de VPN (1ra vez):</strong> Suspensión de 7 días + congelamiento de billetera.</li>
        <li><strong>Uso de VPN (reincidencia):</strong> Baneo permanente + pérdida de saldo.</li>
        <li><strong>Colusión comprobada:</strong> Baneo permanente de todas las cuentas involucradas + pérdida de saldo.</li>
        <li><strong>Múltiples cuentas:</strong> Baneo permanente de todas las cuentas + pérdida de saldo.</li>
        <li><strong>Toxicidad / Acoso grave:</strong> Baneo permanente.</li>
      </ul>

      <div style={{ marginTop: 40, paddingTop: 20, borderTop: '1px solid #30363d', fontSize: '0.85rem', color: '#8b949e', textAlign: 'center' }}>
        <strong>Versión vigente:</strong> Abril 2026. LFA se reserva el derecho de modificar, actualizar o ampliar este Reglamento en cualquier momento para preservar la integridad competitiva de la plataforma. La versión actualizada siempre estará disponible en somoslfa.com/reglamento.
      </div>

    </LegalLayout>
  );
}

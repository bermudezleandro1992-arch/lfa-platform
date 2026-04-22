'use client';
import LegalLayout from '@/app/_components/LegalLayout';

export default function TerminosPage() {
  return (
    <LegalLayout title="TÉRMINOS Y CONDICIONES DE USO" emoji="📋" accentColor="#ffd700" h2Color="#00ff88" date="Abril 2026">

      <h2 className="legal-h2">1. ACEPTACIÓN Y CAPACIDAD LEGAL</h2>
      <p className="legal-p">Al acceder, registrarse y utilizar la plataforma de Liga de Fútbol Automatizada (en adelante, <strong>&quot;LFA&quot;</strong> o <strong>&quot;la Plataforma&quot;</strong>), el usuario (<strong>&quot;Jugador&quot;</strong>) declara ser <strong>mayor de 18 años</strong>, tener la capacidad legal plena para obligarse contractualmente y haber leído, comprendido y aceptado en su totalidad los presentes Términos y Condiciones, el Reglamento Oficial, la Política de Privacidad y la Política de Reembolsos. El acceso a menores de edad está prohibido. La detección de una cuenta menor de edad resultará en su clausura inmediata y la retención de fondos hasta la acreditación de mayoría o la gestión de reembolso mediante representante legal debidamente acreditado.</p>

      <h2 className="legal-h2">2. NATURALEZA DEL SERVICIO — JUEGOS DE HABILIDAD</h2>
      <p className="legal-p">LFA es una plataforma tecnológica que facilita la organización de torneos competitivos de videojuegos (eSports). Los premios obtenidos dependen <strong>única y exclusivamente de la habilidad, destreza y desempeño del jugador</strong> en el videojuego. <strong>LFA no ofrece juegos de azar, apuestas deportivas, loterías ni ningún producto regulado bajo legislación de juego de azar.</strong> LFA actúa exclusivamente como intermediario de emparejamiento (matchmaking) y gestor del pozo de premios (escrow) entre los participantes.</p>

      <h2 className="legal-h2">3. REGISTRO Y SEGURIDAD DE LA CUENTA</h2>
      <ul className="legal-ul">
        <li>Cada persona física puede registrar <strong>una única cuenta</strong>. La titularidad es personal e intransferible.</li>
        <li>El usuario es responsable de mantener la confidencialidad de sus credenciales de acceso. LFA no se responsabiliza por accesos no autorizados derivados de negligencia del usuario en la custodia de sus credenciales.</li>
        <li>El usuario debe notificar de inmediato al soporte (somoslfasoporte@gmail.com) si detecta acceso no autorizado a su cuenta.</li>
        <li>LFA podrá requerir verificación adicional de identidad antes de procesar retiros o ante indicios de fraude.</li>
      </ul>

      <h2 className="legal-h2">4. LFA COINS — MONEDA VIRTUAL DE LA PLATAFORMA</h2>
      <ul className="legal-ul">
        <li><strong>Valor de referencia:</strong> La LFA Coin tiene un valor de referencia equivalente a <strong>1 USD (dólar estadounidense)</strong>, expresado y operado en su equivalente en la moneda local vigente o en USDT (dólar cripto), según el método de pago disponible.</li>
        <li><strong>Uso exclusivo:</strong> Las LFA Coins solo pueden utilizarse para abonar inscripciones a torneos dentro de la Plataforma. No tienen valor fuera de la misma ni pueden transferirse entre usuarios.</li>
        <li><strong>Comisión de Plataforma (Fee de Servicio):</strong> LFA retiene automáticamente el <strong>10% del pozo total acumulado</strong> por torneo, en concepto de uso de infraestructura tecnológica, mantenimiento de servidores, arbitraje por Inteligencia Artificial y costos operativos. El <strong>90% restante</strong> se distribuye entre los ganadores según la escala de premios publicada en la sala del torneo.</li>
        <li><strong>Acreditación de depósitos:</strong> Los fondos se acreditarán una vez confirmada la transacción por el procesador de pago (dLocal Go, Binance Pay u otros disponibles). LFA no se responsabiliza por demoras imputables a los procesadores de pago o a las redes blockchain.</li>
        <li>LFA se reserva el derecho de modificar los métodos de pago disponibles y las tarifas de conversión con previo aviso en la Plataforma.</li>
      </ul>

      <h2 className="legal-h2">5. RETIROS DE FONDOS</h2>
      <ul className="legal-ul">
        <li>El <strong>monto mínimo de retiro</strong> es de <strong>10,000 LFA Coins (equivalente a $10 USDT)</strong>.</li>
        <li>El <strong>límite máximo de retiro automático</strong> es de <strong>$200 USDT por transacción</strong> y <strong>$500 USDT por día calendario</strong>. Montos superiores a $200 USDT requieren aprobación manual del equipo LFA en un plazo de 24 a 72 horas.</li>
        <li>Se permite <strong>un único retiro cada 24 horas</strong> por cuenta de usuario, como medida de seguridad antifraude.</li>
        <li>Los retiros automáticos se procesan <strong>instantáneamente</strong> a la dirección Binance USDT (TRC20/BEP20) registrada por el usuario, una vez superadas todas las validaciones de seguridad.</li>
        <li>Todo retiro está sujeto a una <strong>auditoría automática</strong> que verifica saldo real, Fair Play mínimo (15%), ausencia de cousión, uso de VPN u otras infracciones al Reglamento.</li>
        <li>LFA deducirá del monto a retirar las comisiones de red blockchain (gas fees) aplicables.</li>
        <li>LFA se reserva el derecho de <strong>suspender o denegar un retiro</strong> si se detectan indicios de actividad fraudulenta, hasta que se resuelva la investigación interna. <strong>La decisión del sistema y/o del equipo administrativo de LFA es definitiva e inapelable.</strong></li>
      </ul>

      <h2 className="legal-h2">6. PROPIEDAD INTELECTUAL</h2>
      <p className="legal-p">Todos los contenidos, marcas, logos, diseños, código fuente, nombre comercial &quot;LFA&quot;, &quot;SomosLFA&quot; y cualquier otro elemento de la Plataforma son de propiedad exclusiva de LFA o de sus licenciantes, y están protegidos por la legislación de propiedad intelectual aplicable. Queda prohibida su reproducción, distribución o uso sin autorización escrita expresa. LFA no es titular de los derechos de los videojuegos EA SPORTS FC 26 ni eFootball; es responsabilidad del usuario cumplir con los términos de servicio de cada desarrollador de videojuegos.</p>

      <h2 className="legal-h2">7. LIMITACIÓN DE RESPONSABILIDAD Y CARÁCTER INAPELABLE DE DECISIONES</h2>
      <p className="legal-p">LFA no será responsable por: (i) pérdidas económicas indirectas, lucro cesante o daños consecuentes derivados del uso de la Plataforma; (ii) interrupciones del servicio por causas de fuerza mayor, fallos de terceros proveedores o ataques cibernéticos; (iii) decisiones tomadas por el sistema VAR basado en IA, las cuales son ejecutadas de manera automática y tienen carácter vinculante; (iv) pérdidas derivadas del incumplimiento por parte del usuario de las normas del Reglamento Oficial. La responsabilidad total acumulada de LFA frente al usuario no podrá superar el saldo en LFA Coins que el usuario tenga en su billetera al momento del reclamo.</p>
      <p className="legal-p" style={{ marginTop: 12, padding: '12px 16px', background: 'rgba(255,215,0,0.06)', border: '1px solid rgba(255,215,0,0.2)', borderRadius: 10 }}><strong style={{ color: '#ffd700' }}>⚠️ DECISIÓN DEFINITIVA E INAPELABLE:</strong> Toda resolución emitida por el sistema automático de LFA (incluyendo el sistema VAR-IA, el motor de detección de fraude, el motor de retiros y el motor de sanciones) y/o por el equipo administrativo de LFA ante cualquier disputa, reclamo o situación extraordinaria, es <strong>definitiva, vinculante e inapelable</strong>. El usuario acepta expresamente esta condición al registrarse en la Plataforma y no podrá iniciar acciones legales por decisiones tomadas dentro del marco operativo establecido en estos Términos y el Reglamento Oficial.</p>

      <h2 className="legal-h2">8. CONDUCTAS PROHIBIDAS</h2>
      <ul className="legal-ul">
        <li>Usar la Plataforma con fines de lavado de dinero, financiamiento de actividades ilícitas o evasión fiscal.</li>
        <li>Intentar hackear, manipular, alterar o realizar ingeniería inversa sobre la Plataforma.</li>
        <li>Crear bots, scripts automatizados o cualquier herramienta que automatice acciones dentro de la Plataforma.</li>
        <li>Publicar, transmitir o compartir contenido ilegal, difamatorio, obsceno o que viole derechos de terceros.</li>
        <li>Cualquier conducta que, a criterio de LFA, comprometa la integridad de la competencia o la seguridad de otros usuarios.</li>
      </ul>

      <h2 className="legal-h2">9. MODIFICACIÓN Y TERMINACIÓN DEL SERVICIO</h2>
      <p className="legal-p">LFA se reserva el derecho de modificar, suspender o discontinuar la Plataforma, total o parcialmente, en cualquier momento y sin previo aviso, por razones técnicas, legales o comerciales. Ante una discontinuación definitiva, LFA notificará a los usuarios con al menos <strong>30 días de anticipación</strong> y habilitará el retiro de los saldos disponibles en las billeteras.</p>

      <h2 className="legal-h2">10. RESCISIÓN Y BANEO DE CUENTAS</h2>
      <p className="legal-p">LFA podrá suspender o cancelar la cuenta de un usuario en forma temporal o permanente, sin previo aviso, ante la violación de los presentes Términos, el Reglamento Oficial o cualquier normativa vigente. El usuario baneado permanentemente pierde el derecho a recuperar el saldo de LFA Coins conforme a lo establecido en la Política de Reembolsos.</p>

      <h2 className="legal-h2">11. LEY APLICABLE Y JURISDICCIÓN</h2>
      <p className="legal-p">Los presentes Términos y Condiciones se rigen por las leyes de la <strong>República Argentina</strong>, incluyendo pero no limitándose a la Ley N° 24.240 (Defensa del Consumidor), la Ley N° 25.326 (Protección de Datos Personales) y demás normativa aplicable. Para cualquier controversia derivada del uso de la Plataforma, las partes se someten a la jurisdicción de los <strong>Tribunales Ordinarios de la Ciudad Autónoma de Buenos Aires</strong>, renunciando expresamente a cualquier otro fuero o jurisdicción.</p>

      <h2 className="legal-h2">12. RESOLUCIÓN DE CONFLICTOS</h2>
      <p className="legal-p">Ante cualquier inconveniente, el usuario deberá contactar en primera instancia al soporte de LFA a través del canal de chat del Dashboard o al correo <strong>somoslfasoporte@gmail.com</strong>. LFA se compromete a responder en un plazo máximo de <strong>72 horas hábiles</strong>. Si no se alcanza una solución satisfactoria, el usuario podrá recurrir a los organismos de defensa del consumidor correspondientes a su jurisdicción.</p>

      <div style={{ marginTop: 40, paddingTop: 20, borderTop: '1px solid #30363d', fontSize: '0.85rem', color: '#8b949e', textAlign: 'center' }}>
        <strong>Versión vigente:</strong> Abril 2026. Estos Términos y Condiciones reemplazan cualquier versión anterior. La continuación en el uso de la Plataforma implica la aceptación de la versión vigente.
      </div>

    </LegalLayout>
  );
}

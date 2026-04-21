'use client';
import LegalLayout from '@/app/_components/LegalLayout';

export default function PrivacidadPage() {
  return (
    <LegalLayout title="POLÍTICAS DE PRIVACIDAD" emoji="🔒" accentColor="#009ee3" h2Color="#ffffff" date="Abril 2026">

      <h2 className="legal-h2">1. RESPONSABLE DEL TRATAMIENTO DE DATOS</h2>
      <p className="legal-p">El responsable del tratamiento de los datos personales recopilados a través de la Plataforma <strong>somoslfa.com</strong> es <strong>Liga de Fútbol Automatizada (LFA)</strong>, contactable a través del correo electrónico <strong>somoslfasoporte@gmail.com</strong>. Esta Política de Privacidad se rige por la <strong>Ley N° 25.326 de Protección de Datos Personales de la República Argentina</strong> y sus normas complementarias, así como por los principios del Reglamento General de Protección de Datos de la Unión Europea (RGPD/GDPR) en cuanto resulten aplicables a usuarios de otras jurisdicciones.</p>

      <h2 className="legal-h2">2. DATOS PERSONALES QUE RECOPILAMOS</h2>
      <p className="legal-p">Para el correcto funcionamiento de la Plataforma, LFA recopila los siguientes datos:</p>
      <ul className="legal-ul">
        <li><strong>Datos de identidad y cuenta:</strong> Correo electrónico, nombre de usuario (o nombre provisto por el proveedor de identidad: Google o Facebook), foto de perfil (cuando aplica por el proveedor OAuth).</li>
        <li><strong>Datos de juego:</strong> Identificadores de consola y/o PC (ID de PlayStation Network, Gamertag de Xbox, Steam ID, Konami ID, Mobile ID) ingresados voluntariamente por el usuario.</li>
        <li><strong>Evidencia visual:</strong> Capturas de pantalla subidas como comprobante de resultados en las salas de partido.</li>
        <li><strong>Datos técnicos de auditoría (Sistema Satélite LFA):</strong> Dirección IP, código de país y ciudad aproximada, tipo de dispositivo, navegador y huella digital de sesión. Estos datos se recopilan exclusivamente con el fin de prevenir el uso de VPNs, detectar cuentas múltiples y garantizar la integridad competitiva.</li>
        <li><strong>Datos financieros:</strong> Historial de transacciones de LFA Coins (depósitos, gastos e inscripciones) y datos de métodos de pago proporcionados por los procesadores externos (dLocal Go, Binance Pay), los cuales LFA no almacena directamente.</li>
      </ul>

      <h2 className="legal-h2">3. FINALIDAD Y BASE LEGAL DEL TRATAMIENTO</h2>
      <ul className="legal-ul">
        <li><strong>Ejecución del servicio:</strong> Gestión de cuentas, billeteras, inscripciones a torneos, distribución de premios e historial competitivo. Base legal: ejecución de contrato.</li>
        <li><strong>Seguridad y prevención del fraude:</strong> Detección de VPNs, cuentas múltiples, colusión y falsificación de resultados. Base legal: interés legítimo de LFA y cumplimiento de obligaciones legales.</li>
        <li><strong>Arbitraje automatizado por IA:</strong> Las capturas de pantalla son procesadas por <strong>Google Cloud Vision API</strong> para extraer automáticamente el marcador y validar resultados de forma imparcial. Base legal: consentimiento (otorgado al aceptar estos términos) y ejecución del servicio.</li>
        <li><strong>Comunicación:</strong> Notificaciones sobre el estado de torneos, disputas, retiros y actualizaciones de la Plataforma. Base legal: ejecución del contrato e interés legítimo.</li>
        <li><strong>Cumplimiento normativo:</strong> Conservación de registros para atender requerimientos de autoridades competentes. Base legal: obligación legal.</li>
      </ul>

      <h2 className="legal-h2">4. TERCEROS QUE RECIBEN TUS DATOS</h2>
      <ul className="legal-ul">
        <li><strong>Google Firebase (Google LLC):</strong> Infraestructura de base de datos, autenticación y almacenamiento de archivos. Datos almacenados en servidores seguros bajo los estándares de Google Cloud.</li>
        <li><strong>Google Cloud Vision API:</strong> Procesamiento de imágenes para extracción automática de resultados. Las imágenes no se usan para entrenamiento de modelos de terceros.</li>
        <li><strong>dLocal Go / Binance Pay:</strong> Procesadores de pago. Tratamiento de datos financieros bajo sus propias políticas de privacidad y normativas PCI-DSS.</li>
        <li><strong>Crisp (chat de soporte):</strong> Herramienta de comunicación en vivo. Solo procesa datos de conversación para gestión de soporte.</li>
        <li>LFA <strong>no vende, alquila ni comercializa</strong> los datos personales de los usuarios a terceros con fines publicitarios o comerciales.</li>
      </ul>

      <h2 className="legal-h2">5. CONSERVACIÓN DE LOS DATOS</h2>
      <p className="legal-p">Los datos personales se conservarán durante el tiempo en que la cuenta esté activa y, una vez solicitada la eliminación, por un período adicional de hasta <strong>12 meses</strong> para atender posibles reclamos legales o requerimientos de autoridades. Los datos de auditoría técnica (IP, huella de dispositivo) se conservan por un máximo de <strong>6 meses</strong> desde su recopilación.</p>

      <h2 className="legal-h2">6. TUS DERECHOS SOBRE TUS DATOS</h2>
      <p className="legal-p">En cumplimiento de la Ley N° 25.326 y el RGPD, el usuario tiene los siguientes derechos:</p>
      <ul className="legal-ul">
        <li><strong>Acceso:</strong> Solicitar una copia de los datos personales que LFA tiene sobre vos.</li>
        <li><strong>Rectificación:</strong> Corregir datos inexactos o incompletos.</li>
        <li><strong>Supresión (derecho al olvido):</strong> Solicitar la eliminación permanente de tu cuenta y datos asociados. Para hacerlo, debés vaciar tu billetera de LFA Coins y enviar la solicitud a <strong>somoslfasoporte@gmail.com</strong>. LFA procesará la solicitud en un plazo máximo de <strong>30 días hábiles</strong>.</li>
        <li><strong>Oposición y limitación:</strong> Oponerte al tratamiento de tus datos o solicitar su limitación en determinadas circunstancias.</li>
        <li><strong>Portabilidad:</strong> Recibir tus datos en un formato estructurado y de uso común.</li>
        <li>Para ejercer cualquiera de estos derechos, contactá a <strong>somoslfasoporte@gmail.com</strong> indicando tu solicitud y tu ID de usuario LFA.</li>
      </ul>

      <h2 className="legal-h2">7. SEGURIDAD DE LOS DATOS</h2>
      <p className="legal-p">LFA implementa medidas técnicas y organizativas adecuadas para proteger tus datos contra acceso no autorizado, pérdida, alteración o divulgación. Entre ellas: autenticación segura mediante Firebase Auth (OAuth 2.0), reglas de acceso a la base de datos (Firestore Security Rules), transmisión encifrada vía HTTPS/TLS y control de acceso por roles. Sin embargo, ningún sistema es completamente infalible. En caso de detectar una brecha de seguridad que afecte a los usuarios, LFA notificará a los afectados en un plazo máximo de <strong>72 horas</strong>.</p>

      <h2 className="legal-h2">8. COOKIES Y ALMACENAMIENTO LOCAL</h2>
      <p className="legal-p">LFA utiliza <strong>cookies de sesión estrictamente necesarias</strong> y tecnologías de almacenamiento local (<code style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: 4 }}>localStorage</code> / <code style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: 4 }}>sessionStorage</code>) para mantener la sesión activa, preservar preferencias de idioma y generar la huella de dispositivo anti-cuentas múltiples. No se utilizan cookies de seguimiento publicitario ni de terceros con fines de marketing.</p>

      <h2 className="legal-h2">9. TRANSFERENCIAS INTERNACIONALES DE DATOS</h2>
      <p className="legal-p">Al utilizar infraestructura de Google (Firebase, Cloud Vision), los datos pueden ser procesados en servidores ubicados fuera de Argentina. Google LLC participa en el Marco de Privacidad de Datos UE-EE.UU. y cumple con los estándares de la OCDE. LFA garantiza que dichas transferencias se realizan bajo salvaguardas adecuadas conforme a la legislación vigente.</p>

      <h2 className="legal-h2">10. CAMBIOS EN ESTA POLÍTICA</h2>
      <p className="legal-p">LFA podrá modificar esta Política de Privacidad en cualquier momento. Los cambios serán publicados en somoslfa.com/privacidad con la nueva fecha de vigencia. Si los cambios son sustanciales, se notificará a los usuarios registrados por correo electrónico.</p>

      <div style={{ marginTop: 40, paddingTop: 20, borderTop: '1px solid #30363d', fontSize: '0.85rem', color: '#8b949e', textAlign: 'center' }}>
        <strong>Versión vigente:</strong> Abril 2026. Para consultas sobre privacidad: <strong>somoslfasoporte@gmail.com</strong>
      </div>

    </LegalLayout>
  );
}

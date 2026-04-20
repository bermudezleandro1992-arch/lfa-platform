'use client';
import LegalLayout from '@/app/_components/LegalLayout';

// export const metadata = { title: 'Políticas de Privacidad | SomosLFA' };

export default function PrivacidadPage() {
  return (
    <LegalLayout title="POLÍTICAS DE PRIVACIDAD" emoji="🔒" accentColor="#009ee3" h2Color="#ffffff" date="Marzo 2026">

      <h2 className="legal-h2">1. INFORMACIÓN QUE RECOPILAMOS</h2>
      <p className="legal-p">Para garantizar la seguridad de la plataforma y el correcto funcionamiento de las billeteras, LFA recopila los siguientes datos:</p>
      <ul className="legal-ul">
        <li><strong>Datos de cuenta:</strong> Correo electrónico, nombre de usuario y proveedor de identidad.</li>
        <li><strong>Datos de juego:</strong> Identificadores de consola (ID de PlayStation Network, Gamertag de Xbox, Steam ID, Konami ID).</li>
        <li><strong>Evidencia Visual:</strong> Las capturas de pantalla subidas a las salas de partido como comprobante de resultados.</li>
        <li><strong>Datos de auditoría técnica (Satélite LFA):</strong> Dirección IP, código de país, tipo de dispositivo y navegador, con el único fin de evitar el uso de VPNs y garantizar el emparejamiento regional correcto.</li>
      </ul>

      <h2 className="legal-h2">2. USO DE LOS DATOS Y PROCESAMIENTO IA</h2>
      <p className="legal-p">Tus datos son almacenados de forma segura utilizando la infraestructura de Google Firebase. LFA no vende ni comercializa tu información personal. Utilizamos tus datos exclusivamente para:</p>
      <ul className="legal-ul">
        <li>Procesar los ingresos y retiros de LFA Coins.</li>
        <li>Mantener el historial de títulos, copas y estadísticas de tu perfil.</li>
        <li><strong>Análisis por Inteligencia Artificial:</strong> Las imágenes subidas como resultado son procesadas automáticamente mediante servicios de visión por computadora (Google Cloud Vision API) para extraer el marcador y validar a los ganadores de forma imparcial.</li>
        <li>Auditar partidas y prevenir el fraude dentro del ecosistema del juego.</li>
        <li>Contactarte en caso de disputas vía chat de soporte (Crisp).</li>
      </ul>

      <h2 className="legal-h2">3. TUS DERECHOS Y ELIMINACIÓN DE DATOS</h2>
      <p className="legal-p">En cumplimiento con las normativas internacionales de protección de datos, todo usuario tiene derecho a solicitar la eliminación permanente de su cuenta y sus datos asociados. Para hacerlo, el usuario debe vaciar su billetera de LFA Coins y comunicarse con el Soporte Oficial para gestionar la baja en la base de datos.</p>

      <h2 className="legal-h2">4. SEGURIDAD Y COOKIES</h2>
      <p className="legal-p">LFA utiliza cookies de sesión y almacenamiento local (<code style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: 4 }}>localStorage</code> / <code style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: 4 }}>sessionStorage</code>) estrictamente necesarios para mantener tu sesión activa y generar tu &quot;Huella Digital de Dispositivo&quot; para evitar cuentas múltiples o malintencionadas.</p>

    </LegalLayout>
  );
}

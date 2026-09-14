import type { Metadata } from "next";
import Link from "next/link";
import { LegalContact, LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Política de privacidad | Terra",
  description: "Información sobre los datos utilizados por el catálogo y el asistente de WhatsApp de Terra.",
  alternates: { canonical: "https://terracolchonesymuebles.online/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Política de privacidad">
      <section>
        <h2>Quién presta el servicio</h2>
        <p>Esta política describe el tratamiento de datos en el catálogo de Terra Colchones y Muebles y en su asistente de atención y ventas por WhatsApp.</p>
        <LegalContact />
      </section>
      <section>
        <h2>Qué información se procesa</h2>
        <ul>
          <li>El número de WhatsApp, el nombre de perfil disponible y los mensajes que intercambias con Terra.</li>
          <li>Los productos y variantes seleccionados, la referencia del pedido y el estado de su atención.</li>
          <li>La ubicación o dirección que compartes para coordinar un pedido.</li>
          <li>La información de los comprobantes que envías y el estado de su revisión por el equipo. Recibir un comprobante no significa aprobar el pago.</li>
          <li>Referencias técnicas de mensajes, entregas y errores necesarias para operar y proteger el servicio.</li>
        </ul>
        <p>No envíes contraseñas, códigos de verificación, números completos de tarjeta ni datos de otras personas que no sean necesarios para tu solicitud.</p>
      </section>
      <section>
        <h2>Para qué se utiliza</h2>
        <p>Para responder consultas, conservar el contexto de la atención, vincular la selección del catálogo con tu conversación, gestionar pedidos, coordinar entregas y permitir la revisión humana de pagos o incidencias.</p>
        <p>Puedes pedir atención de una persona. Las respuestas automáticas pueden contener errores; las condiciones particulares de una compra deben confirmarse con Terra.</p>
      </section>
      <section>
        <h2>Proveedores que intervienen</h2>
        <p>El servicio utiliza WhatsApp Business Platform de Meta, alojamiento de servidor y servicios de catálogo y almacenamiento de Supabase. Para generar respuestas automáticas, el texto y el contexto de la conversación se pueden transmitir a proveedores de inteligencia artificial.</p>
        <p>La integración de IA utiliza actualmente OpenRouter y un modelo de la familia Gemini de Google. Las condiciones de tratamiento y conservación de esos proveedores son propias de cada servicio; esta página no promete que todos eliminen los datos de forma inmediata ni que todos apliquen la misma política.</p>
        <p>No vendemos tus datos personales. Consulta también la <a href="https://openrouter.ai/privacy">política de privacidad de OpenRouter</a>.</p>
      </section>
      <section>
        <h2>Conservación y protección</h2>
        <p>La conversación y los registros asociados al pedido pueden almacenarse por separado. Borrar un chat no equivale, por sí solo, a eliminar todos los datos de un pedido, su ubicación o las copias que pudieran existir.</p>
        <p>Las solicitudes de eliminación requieren revisión del equipo. Si algún registro necesita conservarse para atender un pedido o por una obligación aplicable, solicita que Terra te informe qué datos se conservan y el motivo.</p>
        <p>El servicio utiliza conexiones HTTPS y controles de acceso para sus herramientas internas. Ningún sistema permite garantizar una seguridad absoluta.</p>
      </section>
      <section id="eliminacion-de-datos">
        <h2>Acceso, corrección y eliminación</h2>
        <LegalContact />
        <p>Encontrarás el procedimiento en las <Link href="/data-deletion">instrucciones para solicitar la eliminación de datos</Link>. No necesitas una cuenta de desarrollador de Meta para presentar tu solicitud.</p>
      </section>
    </LegalPage>
  );
}

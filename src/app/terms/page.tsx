import type { Metadata } from "next";
import Link from "next/link";
import { LegalContact, LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Condiciones de uso | Terra",
  description: "Condiciones de uso del catálogo y del asistente de atención de Terra Colchones y Muebles.",
  alternates: { canonical: "https://terracolchonesymuebles.online/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage title="Condiciones de uso">
      <section>
        <h2>Alcance del servicio</h2>
        <p>Terra Colchones y Muebles ofrece un catálogo web y atención por WhatsApp para consultar productos, seleccionar variantes y continuar la gestión de un pedido con su equipo.</p>
        <p>Estas condiciones se refieren al uso del sitio y del asistente. No sustituyen las condiciones particulares de una compra ni los derechos que correspondan al consumidor.</p>
      </section>
      <section>
        <h2>Información y atención automatizada</h2>
        <p>El asistente combina respuestas automáticas con atención humana. Una respuesta de IA puede ser incompleta o incorrecta; pide a un asesor que confirme cualquier dato que sea importante para tu compra.</p>
        <p>La referencia para cada producto es su ficha publicada. Los precios, disponibilidad, medidas y variantes deben corresponder a la selección que confirmes con Terra.</p>
      </section>
      <section>
        <h2>Pedidos y pagos</h2>
        <p>El catálogo permite registrar una selección y continuar por WhatsApp. Durante la atención pueden solicitarse los datos necesarios para coordinar la entrega y revisar el pago.</p>
        <p>Enviar un comprobante o recibir un mensaje automático no constituye una confirmación de pago aprobado. Esa revisión corresponde al equipo de Terra.</p>
        <p>Consulta con un asesor las condiciones de entrega, facturación, garantías, cambios, cancelaciones y devoluciones aplicables a tu pedido. Esta página no establece plazos, costos ni garantías adicionales a los que Terra confirme y a los derechos aplicables.</p>
      </section>
      <section>
        <h2>Uso responsable</h2>
        <p>Utiliza los canales para consultas o pedidos legítimos. No compartas contraseñas, códigos de acceso ni datos de terceros innecesarios. Antes de pagar, verifica con Terra el pedido y las instrucciones recibidas.</p>
        <p>El funcionamiento depende también de WhatsApp, del alojamiento y de los proveedores tecnológicos. Si la atención automática no está disponible o tienes dudas, solicita atención humana.</p>
      </section>
      <section>
        <h2>Datos personales y contacto</h2>
        <p>El tratamiento de información se explica en la <Link href="/privacy">política de privacidad</Link>. Puedes solicitar su eliminación siguiendo el <Link href="/data-deletion">procedimiento de atención</Link>.</p>
        <LegalContact />
      </section>
    </LegalPage>
  );
}

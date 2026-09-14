import type { Metadata } from "next";
import Link from "next/link";
import { LegalContact, LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Eliminación de datos | Terra",
  description: "Cómo solicitar la eliminación de datos relacionados con el catálogo y el asistente de WhatsApp de Terra.",
  alternates: { canonical: "https://terracolchonesymuebles.online/data-deletion" },
};

export default function DataDeletionPage() {
  return (
    <LegalPage title="Eliminación de datos">
      <section>
        <h2>Cómo presentar una solicitud</h2>
        <LegalContact />
        <ol className="mt-4">
          <li>Escribe al correo de contacto indicado arriba con el asunto «Solicitud de eliminación de datos», o pide hablar con un asesor desde tu conversación con Terra y solicita la eliminación de tus datos personales.</li>
          <li>Indica si la solicitud comprende la conversación, los datos de un pedido, la ubicación compartida u otra información. Si tienes una referencia de pedido, puedes indicarla sin reenviar comprobantes ni datos bancarios.</li>
          <li>Solicita confirmación de recepción y del resultado de la revisión. La solicitud debe atenderla una persona; una respuesta automática no confirma que los datos hayan sido eliminados.</li>
        </ol>
      </section>
      <section>
        <h2>Verificación y alcance</h2>
        <p>Presentar la solicitud desde el número que utilizaste facilita localizar la atención y comprobar que se refiere a tus datos. Si escribes por correo, indica el número con el que contactaste a Terra o la referencia del pedido para ayudar al equipo a localizar la solicitud y verificarla. Nunca envíes tu contraseña de Facebook, claves ni códigos de verificación.</p>
        <p>La conversación, el pedido y la ubicación pueden ser registros separados. La revisión debe contemplar el alcance que solicitas; borrar únicamente el chat del panel no acredita la eliminación de todos esos registros.</p>
      </section>
      <section>
        <h2>Qué debes tener en cuenta</h2>
        <p>Esta página contiene instrucciones de atención: no es un botón de borrado automático. Si hay datos que deban conservarse para atender un pedido o por una obligación aplicable, pide que Terra identifique esos datos y explique el motivo.</p>
        <p>Eliminar datos gestionados por Terra no elimina por sí mismo tu cuenta de WhatsApp o Facebook, las copias de tu dispositivo ni los registros que Meta u otros proveedores gestionen por su cuenta.</p>
        <p>Consulta la <Link href="/privacy">política de privacidad</Link> para conocer la información utilizada por el servicio.</p>
      </section>
    </LegalPage>
  );
}

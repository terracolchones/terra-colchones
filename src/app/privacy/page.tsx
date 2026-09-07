import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de privacidad | Terra",
  description: "Política de privacidad del asistente de WhatsApp de Terra.",
};

export default function PrivacyPage() {
  return (
    <main
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "48px 24px 72px",
        lineHeight: 1.65,
      }}
    >
      <p style={{ color: "#64748b", margin: 0 }}>Terra</p>
      <h1 style={{ fontSize: 32, margin: "8px 0 24px" }}>Política de privacidad</h1>
      <p>Última actualización: 6 de septiembre de 2026.</p>

      <h2>Información que procesamos</h2>
      <p>
        Cuando una persona escribe al asistente de WhatsApp de Terra, procesamos el número de
        teléfono, el nombre de perfil disponible en WhatsApp y el contenido de la conversación.
      </p>

      <h2>Cómo usamos la información</h2>
      <p>
        Usamos esta información únicamente para responder consultas, mantener el contexto de la
        conversación y prestar atención al cliente. El servicio utiliza WhatsApp Business Platform
        y un proveedor de inteligencia artificial para generar respuestas.
      </p>

      <h2>Conservación y protección</h2>
      <p>
        Conservamos los datos solo durante el tiempo necesario para atender la conversación y
        operar el servicio. Aplicamos medidas razonables para proteger la información contra
        accesos no autorizados.
      </p>

      <h2>Compartición de datos</h2>
      <p>
        No vendemos datos personales. Compartimos la información solo con los proveedores
        necesarios para operar este servicio, como WhatsApp Business Platform y el proveedor de IA.
      </p>

      <h2>Tus derechos y contacto</h2>
      <p>
        Puedes solicitar acceso, corrección o eliminación de tus datos escribiendo al mismo canal
        de WhatsApp por el que contactaste a Terra.
      </p>
    </main>
  );
}

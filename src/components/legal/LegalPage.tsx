import Link from "next/link";
import type { ReactNode } from "react";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-10 text-base leading-7 text-stone-800 sm:px-8 sm:py-14">
      <header className="border-b border-stone-200 pb-6">
        <Link href="/catalogo" className="font-bold text-[#8f1519] underline underline-offset-4">Terra Colchones y Muebles</Link>
        <h1 className="mt-5 text-3xl font-bold leading-tight tracking-tight text-stone-950">{title}</h1>
        <p className="mt-3 text-sm text-stone-500">Última actualización: 14 de septiembre de 2026.</p>
      </header>
      <article className="mt-7 space-y-7 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-stone-950 [&_p+p]:mt-3 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:space-y-3 [&_ol]:pl-6 [&_a]:text-[#8f1519] [&_a]:underline [&_a]:underline-offset-4">{children}</article>
      <footer className="mt-10 border-t border-stone-200 pt-5">
        <nav aria-label="Información legal" className="flex flex-wrap gap-x-5 gap-y-3 text-sm font-medium text-[#8f1519] underline underline-offset-4">
          <Link href="/privacy">Privacidad</Link>
          <Link href="/terms">Condiciones de uso</Link>
          <Link href="/data-deletion">Eliminación de datos</Link>
          <Link href="/catalogo">Volver al catálogo</Link>
        </nav>
      </footer>
    </main>
  );
}

export function LegalContact() {
  return (
    <p>Puedes escribir a <a href="mailto:automatizacionterra@gmail.com" className="break-words">automatizacionterra@gmail.com</a> o contactar desde el WhatsApp de atención que aparece en el <Link href="/catalogo">catálogo oficial</Link>. Para solicitudes sobre tus datos, indica si necesitas acceso, corrección o eliminación. La atención de estas solicitudes corresponde a una persona del equipo de Terra.</p>
  );
}

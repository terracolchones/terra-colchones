import Link from "next/link";

export default function ProductNotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#faf9f7] px-6 text-center text-stone-900">
      <div>
        <p className="text-xs font-bold tracking-[0.15em] text-[#9a2022]">CATÁLOGO TERRA</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Este producto no está disponible.</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-stone-500">Puede haber sido ocultado o actualizado. Explora los productos publicados.</p>
        <Link href="/catalogo" className="mt-6 inline-flex rounded-xl bg-stone-900 px-5 py-3 text-sm font-bold text-white">Volver al catálogo</Link>
      </div>
    </main>
  );
}

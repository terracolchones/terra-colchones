"use client";
import { useRef,useState } from "react";
import type { MessageAsset } from "@/lib/panel/contracts";
import { locationUrl } from "@/lib/panel/contracts";

export function PanelAsset({asset,onUpdated}:{asset:MessageAsset;onUpdated?:()=>void}) {
  const modal=useRef<HTMLDialogElement>(null);const [error,setError]=useState(false);const [retrying,setRetrying]=useState(false);const [recovered,setRecovered]=useState(false);
  if(asset.kind==="location"){
    const url=asset.latitude!==null&&asset.longitude!==null?locationUrl(asset.latitude,asset.longitude):null;
    return <div className="my-2 rounded-lg border border-[#cadbd0] bg-[#f6faf7] p-3 text-[#174d3b]"><strong className="block text-sm">📍 Ubicación recibida</strong>{url&&<a href={url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs underline">Abrir ubicación ↗</a>}</div>;
  }
  async function retry(){setRetrying(true);try{const r=await fetch(`/api/panel/assets/${asset.id}`,{method:"POST",headers:{"X-Terra-Panel":"1"}});if(!r.ok||!(await r.json()).ok)throw new Error();setError(false);setRecovered(true);onUpdated?.();}catch{setError(true);}finally{setRetrying(false);}}
  const url=recovered?`/api/panel/assets/${asset.id}`:asset.url;
  const canDisplay=(asset.state==="ready"||recovered)&&url;
  return <div className="my-2 min-w-0">
    {canDisplay&&asset.kind==="image" ? <>
      <button type="button" onClick={()=>modal.current?.showModal()} className="block w-56 max-w-full overflow-hidden rounded-lg border border-[#cadbd0] bg-[#f3f5f4] text-left" aria-label={`Ampliar ${asset.filename}`}>
        {/* Authenticated private media is deliberately served directly, without the public image optimizer. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url!} alt={asset.filename} width={224} height={160} onError={()=>setError(true)} className="h-40 w-full object-contain"/>
        <span className="block truncate px-2 py-1 text-xs text-[#52695f]">{asset.filename} · Ampliar</span>
      </button>
      <dialog ref={modal} className="m-auto max-h-[90dvh] w-[min(640px,92vw)] rounded-2xl bg-white p-4 text-[#172b25] shadow-xl backdrop:bg-black/50">
        <div className="mb-3 flex items-center justify-between gap-3"><strong className="min-w-0 truncate text-sm">{asset.filename}</strong><button type="button" onClick={()=>modal.current?.close()} className="rounded-lg border px-3 py-2">Cerrar</button></div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url!} alt={asset.filename} className="max-h-[65dvh] w-full object-contain"/>
        <a href={url!.startsWith("/api/")?`${url}?download=1`:url!} download className="mt-3 inline-block rounded-lg bg-[#008069] px-4 py-2 text-sm text-white">Descargar imagen</a>
      </dialog>
    </> : canDisplay ? <a href={url!} download className="flex items-center gap-2 rounded-lg border border-[#cadbd0] bg-white px-3 py-3 text-sm text-[#006b57]">📎 <span className="min-w-0 break-all">{asset.filename}<small className="block text-xs text-[#667781]">Descargar PDF</small></span></a> : <div className="rounded-lg border border-[#cadbd0] bg-white p-3 text-xs text-[#667781]">{asset.state==="failed"?"No se pudo guardar el archivo.":"Archivo pendiente de descarga."}</div>}
    {asset.caption&&<p className="mt-2 whitespace-pre-wrap break-words text-sm">{asset.caption}</p>}
    {((asset.state!=="ready"&&!recovered)||error)&&<button type="button" onClick={()=>void retry()} disabled={retrying} className="mt-2 text-xs text-[#006b57] underline">{retrying?"Recuperando…":"Reintentar recuperación"}</button>}
    {error&&<p className="mt-1 text-xs text-amber-800">No se pudo mostrar el archivo.</p>}
  </div>;
}

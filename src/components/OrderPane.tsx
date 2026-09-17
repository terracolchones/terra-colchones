"use client";
import { useEffect,useState } from "react";
import type { OrderDetails } from "@/lib/panel/contracts";
import { locationUrl } from "@/lib/panel/contracts";
import { PanelAsset } from "./PanelAsset";

const labels={awaiting_chat_confirmation:"Confirmación pendiente",awaiting_location:"Ubicación pendiente",awaiting_payment:"Pago pendiente",payment_proof_received:"Comprobante en revisión",payment_confirmed:"Pago confirmado"};
export function OrderPane({conversationId,publicCode,onClose}:{conversationId?:number;publicCode?:string;onClose?:()=>void}){
  const [order,setOrder]=useState<OrderDetails|null>(null),[loaded,setLoaded]=useState(false),[error,setError]=useState<string|null>(null);
  const [editing,setEditing]=useState(false),[name,setName]=useState(""),[saving,setSaving]=useState(false),[revision,setRevision]=useState(0);
  useEffect(()=>{const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
    async function load(){try{const response=await fetch(publicCode?`/api/panel/dossier/${encodeURIComponent(publicCode)}`:`/api/panel/orders/${conversationId}`,{cache:"no-store",signal:controller.signal});if(!response.ok)throw new Error();const result=await response.json();if(controller.signal.aborted)return;setOrder(result.order);setLoaded(true);setError(null);}catch{if(!controller.signal.aborted)setError("No se pudo actualizar la ficha.");}finally{if(!controller.signal.aborted)timer=setTimeout(()=>void load(),4000);}}
    void load();return()=>{controller.abort();clearTimeout(timer);};},[conversationId,publicCode,revision]);
  async function save(){if(!order||saving||!conversationId)return;setSaving(true);try{const response=await fetch(`/api/panel/orders/${conversationId}`,{method:"PATCH",headers:{"Content-Type":"application/json","X-Terra-Panel":"1"},body:JSON.stringify({publicCode:order.publicCode,customerName:name})});if(!response.ok)throw new Error();setEditing(false);setRevision(v=>v+1);}catch{setError("No se pudo guardar el nombre. Comprueba los datos.");}finally{setSaving(false);}}
  const map=order?.location?locationUrl(order.location.latitude,order.location.longitude):null;
  return <section aria-label="Ficha del pedido" className="flex h-full min-h-0 flex-col bg-white text-[#172b25]">
    <header className="flex shrink-0 items-center justify-between border-b border-[#dce3e2] px-4 py-4"><h2 className="text-sm font-semibold">Ficha del pedido</h2>{onClose&&<button type="button" onClick={onClose} className="rounded-lg border px-2 py-1 text-xs lg:hidden">Volver al chat</button>}</header>
    <div className="min-h-0 flex-1 overflow-y-auto px-4 text-sm">
      {error&&<p role="status" className="my-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{error} <button type="button" onClick={()=>setRevision(v=>v+1)} className="underline">Reintentar</button></p>}
      {!loaded&&!error&&<p className="py-6 text-[#667781]">Cargando pedido…</p>}
      {loaded&&!order&&<p className="py-6 text-[#667781]">Esta conversación todavía no tiene un pedido asociado.</p>}
      {order&&<>
        <div className="border-b border-[#e3e9e6] py-4"><p className="mb-1 text-xs text-[#667781]">Pedido más reciente</p><strong className="block text-lg">#{order.publicCode}</strong><span className="mt-2 inline-block rounded-md bg-[#fff1cc] px-2 py-1 text-xs text-[#805a17]">{labels[order.status]}</span><p className="mt-4 font-medium">{order.productName}</p><p className="mt-1 text-xs text-[#667781]">{order.variantLabel||"Variante no especificada"}</p>{order.price!==null&&<p className="mt-3 flex justify-between gap-2"><span>Total</span><strong>Bs {order.price.toLocaleString("es-BO",{minimumFractionDigits:2})}</strong></p>}</div>
        <div className="border-b border-[#e3e9e6] py-4"><div className="flex justify-between gap-2"><h3 className="font-semibold">Nombre completo</h3>{conversationId&&<button type="button" onClick={()=>{setName(order.customerName||"");setEditing(!editing);}} className="text-xs text-[#008069] underline">{editing?"Cancelar":"Editar"}</button>}</div>
          {editing?<form onSubmit={e=>{e.preventDefault();void save();}}><label className="mt-2 block text-xs text-[#667781]">Nombre aportado por el cliente<input value={name} onChange={e=>setName(e.target.value)} maxLength={150} required minLength={3} className="mt-2 w-full rounded-lg border p-2 text-base text-[#172b25]"/></label><button disabled={saving} className="mt-2 rounded-lg bg-[#008069] px-3 py-2 text-xs text-white">{saving?"Guardando…":"Guardar nombre"}</button></form>:<p className="mt-2 text-sm text-[#667781]">{order.customerName||"Pendiente de confirmar en el chat"}</p>}
        </div>
        <div className="border-b border-[#e3e9e6] py-4"><h3 className="mb-2 font-semibold">Archivos recibidos</h3>{order.attachments.length?order.attachments.map(asset=><PanelAsset key={asset.id} asset={asset} onUpdated={()=>setRevision(v=>v+1)}/>):<p className="text-xs text-[#667781]">Sin archivos guardados para este pedido. Los avisos antiguos no incluyen la imagen original.</p>}</div>
        <div className="border-b border-[#e3e9e6] py-4"><h3 className="font-semibold">Ubicación de entrega</h3>{map?<><p className="mt-2 text-xs text-[#667781]">{order.location?.address||"Punto GPS recibido por WhatsApp"}</p><a href={map} target="_blank" rel="noopener noreferrer" className="mt-3 block rounded-lg border border-[#bed6c8] px-3 py-2 text-center text-xs font-semibold text-[#006b57]">📍 Abrir ubicación ↗</a></>:<p className="mt-2 text-xs text-[#667781]">Esperando la ubicación del cliente.</p>}</div>
        <div className="py-4"><p className="mb-3 text-xs text-[#667781]">{order.commerce.provider==="terra"?"Pedido de la tienda actual de Terra":"Pedido vinculado a Shopify"}</p>{order.commerce.adminUrl?<a href={order.commerce.adminUrl} target="_blank" rel="noopener noreferrer" className="block rounded-lg bg-[#008069] px-3 py-3 text-center text-xs font-semibold text-white">Ver pedido en Shopify ↗</a>:<p className="rounded-lg bg-[#f0f2f5] p-3 text-xs text-[#667781]">Shopify pendiente de conexión. Este pedido funciona con Terra.</p>}{conversationId&&<a href={`/pedidos/${encodeURIComponent(order.publicCode)}`} target="_blank" rel="noopener noreferrer" className="mt-3 block text-xs text-[#008069] underline">Abrir ficha privada ↗</a>}<p className="mt-3 text-xs text-[#667781]">Recibir un comprobante no confirma el pago.</p></div>
      </>}
    </div>
  </section>;
}

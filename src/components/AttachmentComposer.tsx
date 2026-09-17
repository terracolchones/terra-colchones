"use client";
import { useEffect,useRef,useState } from "react";
import type { ConversationView } from "@/components/types";
import { ALLOWED_MIME,MAX_FILE_BYTES } from "@/lib/panel/contracts";

export function AttachmentComposer({conversation,onSent}:{conversation:ConversationView;onSent:()=>Promise<void>}) {
  const picker=useRef<HTMLInputElement>(null),modal=useRef<HTMLDialogElement>(null);
  const [file,setFile]=useState<File|null>(null),[preview,setPreview]=useState<string|null>(null),[caption,setCaption]=useState("");
  const [sending,setSending]=useState(false),[error,setError]=useState<string|null>(null),[locked,setLocked]=useState(false);
  const requestId=useRef<string>("");
  useEffect(()=>{if(!file)return;const url=URL.createObjectURL(file);const timer=window.setTimeout(()=>setPreview(url),0);return()=>{URL.revokeObjectURL(url);window.clearTimeout(timer);setPreview(null);};},[file]);
  function choose(next:File|undefined){
    if(!next)return;
    if(!ALLOWED_MIME.some(m=>m===next.type)||next.size===0||next.size>MAX_FILE_BYTES){setError("Elige una imagen JPG/PNG o PDF de hasta 5 MB.");return;}
    setFile(next);setCaption("");setError(null);setLocked(false);requestId.current=crypto.randomUUID();modal.current?.showModal();
  }
  async function send(){
    if(!file||sending||locked||conversation.mode!=="HUMAN")return;setSending(true);setError(null);
    try{
      const response=await fetch(`/api/panel/attachments/${conversation.id}`,{method:"POST",headers:{"X-Terra-Panel":"1","X-Request-Id":requestId.current,"Content-Type":file.type,"X-File-Name":encodeURIComponent(file.name),"X-File-Caption":encodeURIComponent(caption)},body:file});
      const result=await response.json() as {ok?:boolean;state?:string;error?:string};
      if(result.ok){modal.current?.close();setFile(null);}
      else if(result.state){setLocked(true);setError(result.state==="failed"?"El archivo no llegó a enviarse. Cierra y vuelve a adjuntarlo para intentarlo de nuevo.":"El envío no está confirmado. Revisa el chat antes de intentar enviarlo otra vez.");}
      else setError(result.error||"No se pudo preparar el archivo.");
    }catch{setError("Se perdió la respuesta. Reintentar comprobará la misma solicitud sin duplicar el envío.");}
    finally{setSending(false);await onSent();}
  }
  return <>
    <input ref={picker} type="file" accept="image/jpeg,image/png,application/pdf" className="hidden" aria-label="Seleccionar archivo" onChange={e=>{choose(e.target.files?.[0]);e.target.value="";}}/>
    <button type="button" disabled={conversation.mode!=="HUMAN"||sending} onClick={()=>picker.current?.click()} className="mt-3 rounded-lg border border-[#b6d7c6] bg-white px-3 py-2 text-xs font-semibold text-[#006b57] disabled:opacity-50">📎 Adjuntar</button>
    {error&&!file&&<p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    <dialog ref={modal} onCancel={event=>{if(sending)event.preventDefault();}} className="m-auto max-h-[90dvh] w-[min(440px,92vw)] overflow-y-auto rounded-2xl bg-white p-5 text-[#172b25] shadow-2xl backdrop:bg-black/50">
      <div className="flex items-center justify-between gap-3"><strong>Enviar archivo</strong><button type="button" disabled={sending} onClick={()=>{modal.current?.close();setFile(null);}} className="rounded-lg border px-3 py-2 text-sm">Cerrar</button></div>
      <div className="my-4 rounded-lg bg-[#e7f3ec] p-3 text-sm">Para <strong>{conversation.name||conversation.phone}</strong><span className="block text-xs">{conversation.phone}</span></div>
      {file?.type.startsWith("image/")&&preview ?
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Vista previa del archivo a enviar" className="h-48 w-full rounded-lg border object-contain"/> : <div className="grid h-36 place-items-center rounded-lg border bg-[#f0f2f5] text-lg">📄 Documento PDF</div>}
      <p className="mt-2 break-all text-xs text-[#667781]">{file?.name} · {Math.ceil((file?.size||0)/1024)} KB</p>
      <label className="mt-4 block text-sm">Mensaje opcional<textarea value={caption} onChange={e=>setCaption(e.target.value)} maxLength={1024} disabled={sending||locked} rows={2} className="mt-2 w-full rounded-lg border p-3 text-base"/></label>
      {error&&<p role="alert" className="my-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
      <button type="button" disabled={sending||locked||conversation.mode!=="HUMAN"} onClick={()=>void send()} className="mt-4 w-full rounded-lg bg-[#008069] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{sending?"Enviando…":"Enviar archivo"}</button>
    </dialog>
  </>;
}

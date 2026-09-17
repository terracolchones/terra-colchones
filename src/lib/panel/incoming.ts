import type { PanelRepository } from "./repository";
import { ALLOWED_MIME, safeFilename } from "./contracts";

export interface IncomingAssetInput {
  messageId: number; conversationId: number; orderId: string | null; message: Record<string,unknown>;
}
export function createIncomingCapture(deps: { repository:()=>PanelRepository; download:(id:string,mime:string)=>Promise<Uint8Array>; store:(id:string,bytes:Uint8Array)=>Promise<void> }) {
  async function retry(id: string, force=false) {
    const repository=deps.repository();const row=repository.asset(id);
    if(!row||(!force&&row.state==="ready")||!row.provider_id||row.kind==="location")return;
    try{const bytes=await deps.download(row.provider_id,row.mime);await deps.store(row.id,bytes);repository.setAssetState(id,"ready");}
    catch{repository.setAssetState(id,"failed");}
  }
  async function capture(input: IncomingAssetInput) {
    const repository=deps.repository();const kind=input.message.type;
    const raw=input.message[String(kind)];
    if(!raw||typeof raw!=="object")return;
    const value=raw as Record<string,unknown>;
    const common={message_id:input.messageId,conversation_id:input.conversationId,order_id:input.orderId,caption:typeof value.caption==="string"?value.caption.slice(0,1024):""};
    if(kind==="location"){
      if(typeof value.latitude!=="number"||typeof value.longitude!=="number"||!Number.isFinite(value.latitude)||!Number.isFinite(value.longitude)||Math.abs(value.latitude)>90||Math.abs(value.longitude)>180)return;
      repository.addAsset({...common,kind:"location",filename:"Ubicación recibida",mime:"",provider_id:null,state:"ready",latitude:value.latitude,longitude:value.longitude});return;
    }
    const mime=typeof value.mime_type==="string"?value.mime_type:"";
    if(!ALLOWED_MIME.some(m=>m===mime)||typeof value.id!=="string"||!/^\d{1,100}$/.test(value.id))return;
    const row=repository.addAsset({...common,kind:mime==="application/pdf"?"document":"image",filename:safeFilename(typeof value.filename==="string"?value.filename:"archivo",mime),mime,provider_id:value.id,state:"pending",latitude:null,longitude:null});
    await retry(row.id);
  }
  return {capture,retry};
}

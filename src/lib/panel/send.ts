import { createHash } from "node:crypto";
import type { PanelRepository } from "./repository";
import { safeFilename,validateFile } from "./contracts";

export interface PanelSendInput { key:string;conversationId:number;bytes:Uint8Array;mime:string;filename:string;caption:string }
export function createPanelSender(deps:{repository:()=>PanelRepository;conversation:(id:number)=>{phone:string;mode:string}|undefined;
  store:(id:string,bytes:Uint8Array)=>Promise<void>;upload:(bytes:Uint8Array,mime:string,filename:string)=>Promise<string>;
  send:(phone:string,providerId:string,mime:string,filename:string,caption:string)=>Promise<{wa_message_id:string}>}) {
  return async function send(input:PanelSendInput) {
    if(!/^[a-zA-Z0-9_-]{16,100}$/.test(input.key)||input.caption.length>1024)throw new Error("Archivo o descripción inválidos.");
    validateFile(input.bytes,input.mime);
    const repository=deps.repository(),filename=safeFilename(input.filename,input.mime);
    const fingerprint=createHash("sha256").update(input.bytes).update(JSON.stringify([input.mime,filename,input.caption])).digest("hex");
    const {row,created}=repository.reserveSend(input.key,input.conversationId,fingerprint,input.caption||filename);
    if(row.conversation_id!==input.conversationId||row.fingerprint!==fingerprint)throw new Error("La solicitud corresponde a otro archivo.");
    if(!created)return {messageId:row.message_id,state:row.state,ok:row.state==="sent"};
    let attempted=false;
    try {
      const asset=repository.addAsset({message_id:row.message_id,conversation_id:input.conversationId,order_id:null,kind:input.mime==="application/pdf"?"document":"image",filename,mime:input.mime,caption:input.caption,state:"pending",provider_id:null,latitude:null,longitude:null});
      await deps.store(asset.id,input.bytes);repository.setAssetState(asset.id,"ready");
      if(deps.conversation(input.conversationId)?.mode!=="HUMAN")throw new Error("Modo cambiado");
      const providerId=await deps.upload(input.bytes,input.mime,filename);
      const conversation=deps.conversation(input.conversationId);
      if(conversation?.mode!=="HUMAN")throw new Error("Modo cambiado");
      repository.setSendState(input.key,"sending");attempted=true;
      const result=await deps.send(conversation.phone,providerId,input.mime,filename,input.caption);
      repository.setSendState(input.key,"sent",result.wa_message_id);
      return {messageId:row.message_id,state:"sent" as const,ok:true};
    }catch{
      const state=attempted?"uncertain":"failed";
      // Even an accepted send followed by a local write failure must not resend.
      try{repository.setSendState(input.key,state);}catch{}
      return {messageId:row.message_id,state,ok:false};
    }
  };
}

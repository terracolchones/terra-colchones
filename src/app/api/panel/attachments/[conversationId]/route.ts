import { NextResponse,type NextRequest } from "next/server";
import { getConversationById,getPanelRepository } from "@/lib/db";
import { sendPanelMedia,uploadPanelMedia } from "@/lib/meta/client";
import { createPanelSender } from "@/lib/panel/send";
import { readBoundedBody,storePrivateFile } from "@/lib/panel/files";
import { panelAuth,panelId,privateHeaders } from "@/lib/panel/http";
export const dynamic="force-dynamic";
export const runtime="nodejs";
const sender=createPanelSender({repository:getPanelRepository,conversation:getConversationById,store:storePrivateFile,upload:uploadPanelMedia,send:sendPanelMedia});
export async function POST(request:NextRequest,{params}:{params:Promise<{conversationId:string}>}){
  const denied=panelAuth(request,true);if(denied)return denied;
  const id=panelId((await params).conversationId),conversation=id?getConversationById(id):undefined;
  if(!id||!conversation)return NextResponse.json({error:"Conversación no encontrada"},{status:404});
  if(conversation.mode!=="HUMAN")return NextResponse.json({error:"Activa HUMANO antes de enviar archivos."},{status:409});
  try {
    const result=await sender({key:request.headers.get("x-request-id")||"",conversationId:id,bytes:await readBoundedBody(request),mime:request.headers.get("content-type")||"",filename:decodeURIComponent(request.headers.get("x-file-name")||"archivo"),caption:decodeURIComponent(request.headers.get("x-file-caption")||"")});
    return NextResponse.json(result,{status:result.ok?200:409,headers:privateHeaders});
  }catch{return NextResponse.json({error:"No se pudo preparar el archivo. Usa JPG, PNG o PDF de hasta 5 MB y una descripción de hasta 1024 caracteres."},{status:400,headers:privateHeaders});}
}

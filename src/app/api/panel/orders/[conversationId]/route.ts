import { NextResponse,type NextRequest } from "next/server";
import { getConversationById,getPanelRepository } from "@/lib/db";
import { panelAuth,panelId,privateHeaders } from "@/lib/panel/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{conversationId:string}>};
export async function GET(request:NextRequest,{params}:Context){
  const denied=panelAuth(request);if(denied)return denied;
  const id=panelId((await params).conversationId);
  if(!id||!getConversationById(id))return NextResponse.json({error:"Conversación no encontrada"},{status:404,headers:privateHeaders});
  return NextResponse.json({order:getPanelRepository().orderDetails(id)},{headers:privateHeaders});
}
export async function PATCH(request:NextRequest,{params}:Context){
  const denied=panelAuth(request,true);if(denied)return denied;
  const id=panelId((await params).conversationId);
  if(!id||!getConversationById(id))return NextResponse.json({error:"Conversación no encontrada"},{status:404});
  let input:unknown;try{input=await request.json();}catch{return NextResponse.json({error:"Datos inválidos"},{status:400});}
  if(!input||typeof input!=="object")return NextResponse.json({error:"Datos inválidos"},{status:400});
  const {publicCode,customerName}=input as Record<string,unknown>;
  if(typeof publicCode!=="string"||typeof customerName!=="string"||customerName.trim().length<3||customerName.length>150||/[\x00-\x1f]/.test(customerName))return NextResponse.json({error:"Introduce el nombre completo aportado por el cliente."},{status:400});
  const result=getPanelRepository().saveName(id,publicCode,customerName.trim());
  return NextResponse.json({ok:Number(result.changes)>0},{status:Number(result.changes)>0?200:404,headers:privateHeaders});
}

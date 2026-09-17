import { NextResponse,type NextRequest } from "next/server";
import { getPanelRepository } from "@/lib/db";
import { panelAuth,privateHeaders } from "@/lib/panel/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest,{params}:{params:Promise<{publicCode:string}>}){
  const denied=panelAuth(request);if(denied)return denied;
  const code=(await params).publicCode;
  if(!/^T-[A-Z0-9-]{6,32}$/.test(code))return NextResponse.json({error:"Pedido no encontrado"},{status:404,headers:privateHeaders});
  const order=getPanelRepository().dossier(code);
  return NextResponse.json({order},{status:order?200:404,headers:privateHeaders});
}

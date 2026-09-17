import { NextResponse,type NextRequest } from "next/server";
import { getPanelRepository } from "@/lib/db";
import { readPrivateFile } from "@/lib/panel/files";
import { incomingAssets } from "@/lib/panel/service";
import { panelAuth,privateHeaders } from "@/lib/panel/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{assetId:string}>};
export async function GET(request:NextRequest,{params}:Context){
  const denied=panelAuth(request);if(denied)return denied;
  const id=(await params).assetId;
  if(!/^[a-f0-9]{32}$/.test(id))return new NextResponse(null,{status:404});
  const row=getPanelRepository().asset(id);
  if(!row||row.state!=="ready"||row.kind==="location")return NextResponse.json({error:"Archivo no disponible"},{status:404,headers:privateHeaders});
  try{return new NextResponse(new Uint8Array(await readPrivateFile(id)),{headers:{...privateHeaders,"Content-Type":row.mime,"Content-Security-Policy":"default-src 'none'; sandbox","Content-Disposition":`${row.mime==="application/pdf"||request.nextUrl.searchParams.has("download")?"attachment":"inline"}; filename="${row.filename}"`}});}
  catch{return NextResponse.json({error:"No se encontró el archivo guardado"},{status:404,headers:privateHeaders});}
}
export async function POST(request:NextRequest,{params}:Context){
  const denied=panelAuth(request,true);if(denied)return denied;
  const id=(await params).assetId;
  if(!/^[a-f0-9]{32}$/.test(id))return new NextResponse(null,{status:404});
  const row=getPanelRepository().asset(id);
  if(!row||!row.provider_id)return new NextResponse(null,{status:404});
  await incomingAssets.retry(id,true);
  return NextResponse.json({ok:getPanelRepository().asset(id)?.state==="ready"},{headers:privateHeaders});
}

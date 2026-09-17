import { NextResponse,type NextRequest } from "next/server";
import { requireDashboardAuth } from "@/lib/dashboard-auth";
export const privateHeaders={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
export function panelAuth(request:NextRequest,write=false) {
  const denied=requireDashboardAuth(request);if(denied)return denied;
  if(write&&(request.headers.get("x-terra-panel")!=="1"||request.headers.get("sec-fetch-site")==="cross-site"||
    (request.headers.get("origin")&&request.headers.get("origin")!==request.nextUrl.origin)))return NextResponse.json({error:"Origen no permitido"},{status:403,headers:privateHeaders});
  return null;
}
export function panelId(value:string):number|null {return /^[1-9]\d{0,14}$/.test(value)&&Number.isSafeInteger(Number(value))?Number(value):null;}

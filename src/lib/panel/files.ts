import { mkdir, writeFile, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { MAX_FILE_BYTES } from "./contracts";

function privatePath(id: string) {
  if (!/^[a-f0-9]{32}$/.test(id)) throw new Error("Archivo inválido");
  return path.join(process.cwd(), "data", "panel-media", id);
}
export async function storePrivateFile(id: string, bytes: Uint8Array) {
  const destination=privatePath(id);
  await mkdir(path.dirname(destination),{recursive:true,mode:0o700});
  const temporary=destination+"."+randomBytes(8).toString("hex")+".tmp";
  try {
    await writeFile(temporary,bytes,{flag:"wx",mode:0o600});
    await rename(temporary,destination);
  } finally {
    await unlink(temporary).catch(()=>{});
  }
}
export async function readPrivateFile(id: string) { return readFile(privatePath(id)); }
export async function readBoundedBody(response: Response | Request, limit=MAX_FILE_BYTES): Promise<Uint8Array> {
  if(Number(response.headers.get("content-length"))>limit)throw new Error("Archivo demasiado grande");
  if(!response.body)throw new Error("Archivo vacío");
  const reader=response.body.getReader();let size=0;const parts:Uint8Array[]=[];
  try {
    while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;
      if(size>limit)throw new Error("Archivo demasiado grande");parts.push(value);}
  }catch(error){await reader.cancel().catch(()=>{});throw error;}
  const result=new Uint8Array(size);let offset=0;for(const p of parts){result.set(p,offset);offset+=p.length;}return result;
}

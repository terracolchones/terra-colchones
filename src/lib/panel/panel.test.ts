import { DatabaseSync } from "node:sqlite";
import { afterEach,describe,expect,it,vi } from "vitest";
import { createPanelRepository } from "./repository";
import { createIncomingCapture } from "./incoming";
import { createPanelSender } from "./send";
import { shopifyAdminUrl,locationUrl,validateFile,MAX_FILE_BYTES,safeFilename } from "./contracts";
import { readBoundedBody } from "./files";

const databases:DatabaseSync[]=[];
afterEach(()=>{databases.splice(0).forEach(db=>db.close());});
function setup(){const db=new DatabaseSync(":memory:");databases.push(db);db.exec(`
PRAGMA foreign_keys=ON;
CREATE TABLE conversations(id INTEGER PRIMARY KEY,phone TEXT,mode TEXT,last_message_at INTEGER);
CREATE TABLE messages(id INTEGER PRIMARY KEY,conversation_id INTEGER REFERENCES conversations(id),role TEXT,content TEXT,wa_message_id TEXT,created_at INTEGER DEFAULT(unixepoch()));
CREATE TABLE catalog_orders(id TEXT PRIMARY KEY,public_code TEXT,conversation_id INTEGER,product_name TEXT,variant_label TEXT,price REAL,status TEXT,latitude REAL,longitude REAL,location_address TEXT,created_at INTEGER);
INSERT INTO conversations VALUES(1,'12025550100','HUMAN',0),(2,'12025550101','AI',0);
INSERT INTO catalog_orders VALUES('order-one','T-DEMO-0001',1,'Producto de prueba',NULL,2490,'payment_proof_received',0,0,'Prueba',1),('order-two','T-DEMO-0002',2,'Otro producto',NULL,50,'awaiting_location',NULL,NULL,NULL,1);
INSERT INTO messages VALUES(1,1,'user','Imagen ficticia','fixture-one',1),(2,2,'user','Otro cliente','fixture-two',1);`);
return {db,repository:createPanelRepository(db)};}
const bytes=new Uint8Array([137,80,78,71,13,10,26,10]);
const incoming={messageId:1,conversationId:1,orderId:"order-one",message:{type:"image",image:{id:"12345",mime_type:"image/png"}}};
const sendInput={key:"test-send-request-00001",conversationId:1,bytes,mime:"image/png",filename:"producto.png",caption:"Mensaje de prueba"};

describe("private evidence shared by Terra and Shopify",()=>{
  it("persists incoming media once, decorates only its message and keeps payment unchanged",async()=>{
    const {repository,db}=setup();const download=vi.fn(async()=>bytes),store=vi.fn(async()=>{});
    const capture=createIncomingCapture({repository:()=>repository,download,store});
    await capture.capture(incoming);await capture.capture(incoming);
    expect(download).toHaveBeenCalledTimes(1);expect(store).toHaveBeenCalledTimes(1);
    expect(repository.orderDetails(1)?.attachments).toHaveLength(1);
    expect(repository.orderDetails(2)?.attachments).toHaveLength(0);
    expect(repository.orderDetails(1)?.status).toBe("payment_proof_received");
    const rows=repository.decorate([{id:1,conversation_id:1,role:"user",content:"Prueba",wa_message_id:"fixture-one",created_at:1}]);
    expect(rows[0]).toMatchObject({asset:{state:"ready",kind:"image",url:expect.stringMatching(/^\/api\/panel\/assets\/[a-f0-9]{32}$/)}});
    db.prepare("DELETE FROM messages WHERE id=1").run();expect(repository.orderDetails(1)?.attachments).toHaveLength(0);
  });
  it("retains a failed download and recovers it without changing message or order",async()=>{
    const {repository}=setup();const download=vi.fn<()=>Promise<Uint8Array>>().mockRejectedValueOnce(new Error("private provider detail")).mockResolvedValue(bytes);
    const capture=createIncomingCapture({repository:()=>repository,download,store:async()=>{}});
    await capture.capture(incoming);const asset=repository.orderDetails(1)!.attachments[0];expect(asset.state).toBe("failed");expect(asset.url).toBeNull();
    await capture.retry(asset.id);expect(repository.orderDetails(1)!.attachments[0]).toMatchObject({id:asset.id,state:"ready"});
  });
  it("keeps ambiguous evidence in its chat without assigning another order",async()=>{
    const {repository}=setup();const capture=createIncomingCapture({repository:()=>repository,download:async()=>bytes,store:async()=>{}});
    await capture.capture({...incoming,orderId:null});expect(repository.orderDetails(1)?.attachments).toHaveLength(0);
    expect(repository.incomingMessage("fixture-one","12025550101")).toBeUndefined();
  });
  it("binds Shopify references without changing current Terra data or requiring Shopify",()=>{
    const {repository}=setup();expect(repository.orderDetails(1)?.commerce).toEqual({provider:"terra",adminUrl:null});
    repository.linkShopifyOrder("order-one","terra-demo.myshopify.com","gid://shopify/DraftOrder/123");
    expect(repository.orderDetails(1)?.commerce.adminUrl).toBe("https://admin.shopify.com/store/terra-demo/draft_orders/123");
    repository.saveName(1,"T-DEMO-0001","Cliente Ejemplo");repository.saveName(2,"T-DEMO-0001","Incorrecto");
    expect(repository.orderDetails(1)?.customerName).toBe("Cliente Ejemplo");
    expect(repository.dossier("T-DEMO-0001")?.customerName).toBe("Cliente Ejemplo");
    expect(repository.dossier("T-XXXX-XXXX")).toBeNull();
    expect(()=>repository.linkShopifyOrder("order-one","evil.example","gid://shopify/Order/1")).toThrow();
    expect(shopifyAdminUrl("terra.myshopify.com.evil.test","gid://shopify/Order/1")).toBeNull();
  });
  it("rejects attaching another customer's message or order",async()=>{
    const {repository}=setup();const capture=createIncomingCapture({repository:()=>repository,download:async()=>bytes,store:async()=>{}});
    await expect(capture.capture({...incoming,conversationId:2})).rejects.toThrow();
    await expect(capture.capture({...incoming,orderId:"order-two"})).rejects.toThrow();
    expect(repository.orderDetails(1)?.attachments).toHaveLength(0);
    expect(repository.orderDetails(2)?.attachments).toHaveLength(0);
  });
});

describe("manual attachment sends",()=>{
  function senderFixture(){const {repository,db}=setup();let mode="HUMAN";
    const upload=vi.fn(async()=>"12345"),send=vi.fn(async()=>({wa_message_id:"accepted-fixture"})),store=vi.fn(async()=>{});
    const sender=createPanelSender({repository:()=>repository,conversation:()=>({phone:"12025550100",mode}),upload,send,store});
    return {sender,repository,db,upload,send,store,setMode:(value:string)=>{mode=value;}};}
  it("sends once for a repeated request and rejects key reuse for another payload",async()=>{
    const {sender,send}=senderFixture();expect(await sender(sendInput)).toMatchObject({ok:true,state:"sent"});
    expect(await sender(sendInput)).toMatchObject({ok:true,state:"sent"});expect(send).toHaveBeenCalledTimes(1);
    await expect(sender({...sendInput,caption:"changed"})).rejects.toThrow();
  });
  it("does not send twice after uncertain network failure",async()=>{
    const {sender,send}=senderFixture();send.mockRejectedValueOnce(new Error("private detail"));
    expect(await sender(sendInput)).toMatchObject({state:"uncertain",ok:false});
    expect(await sender(sendInput)).toMatchObject({state:"uncertain",ok:false});expect(send).toHaveBeenCalledTimes(1);
  });
  it("does not retry an accepted send after persistence fails",async()=>{
    const {sender,repository,send}=senderFixture();const original=repository.setSendState;
    vi.spyOn(repository,"setSendState").mockImplementation((key,state,wamid)=>{if(state==="sent")throw new Error("disk failure");original(key,state,wamid);});
    expect(await sender(sendInput)).toMatchObject({state:"uncertain"});await sender(sendInput);expect(send).toHaveBeenCalledTimes(1);
  });
  it("rechecks HUMAN after upload and before sending",async()=>{
    const {sender,upload,setMode,send}=senderFixture();upload.mockImplementationOnce(async()=>{setMode("AI");return "12345";});
    expect(await sender(sendInput)).toMatchObject({state:"failed"});expect(send).not.toHaveBeenCalled();
  });
  it("does not reserve or write when the conversation is in AI",async()=>{
    const {sender,db,upload,store}=senderFixture();db.prepare("UPDATE conversations SET mode='AI' WHERE id=1").run();
    await expect(sender(sendInput)).rejects.toThrow(/HUMANO/);expect(upload).not.toHaveBeenCalled();expect(store).not.toHaveBeenCalled();
    expect(db.prepare("SELECT count(*) AS n FROM panel_sends").get()?.n).toBe(0);
  });
});
describe("input validation",()=>{
  it("rejects executable/HTML payloads, misleading MIME types and oversized files",()=>{
    expect(()=>validateFile(new TextEncoder().encode('<script>alert(1)</script>'),"image/png")).toThrow();
    expect(()=>validateFile(bytes,"text/html")).toThrow();expect(()=>validateFile(new Uint8Array(MAX_FILE_BYTES+1),"image/png")).toThrow();
    expect(()=>validateFile(bytes,"image/png")).not.toThrow();expect(safeFilename('../../x\r\n.pdf',"application/pdf")).toBe("x.pdf");
    expect(locationUrl(91,0)).toBeNull();expect(locationUrl(Number.NaN,0)).toBeNull();expect(locationUrl(0,0)).toContain("query=0%2C0");
  });
  it("bounds streamed uploads even without a content-length",async()=>{
    const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array(6));controller.close();}});
    await expect(readBoundedBody(new Response(stream),5)).rejects.toThrow(/grande/);
  });
});

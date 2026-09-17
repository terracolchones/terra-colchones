import { OrderPane } from "@/components/OrderPane";
export const dynamic="force-dynamic";
export default async function OrderPage({params}:{params:Promise<{publicCode:string}>}){
  const {publicCode}=await params;
  return <main className="flex h-dvh flex-col bg-[#efeae2] text-[#172b25]"><header className="bg-[#008069] px-5 py-4 text-white"><h1 className="font-semibold">Terra · Revisión del pedido</h1></header><div className="mx-auto min-h-0 w-full max-w-2xl flex-1"><OrderPane publicCode={publicCode}/></div></main>;
}

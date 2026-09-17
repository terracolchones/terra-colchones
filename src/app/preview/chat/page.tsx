import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ChatPreview } from "@/components/preview/ChatPreview";

export const dynamic = "force-dynamic";

export default async function ChatPreviewPage() {
  if (process.env.NODE_ENV !== "development" || process.env.TERRA_CHAT_PREVIEW !== "1") notFound();
  const host = (await headers()).get("host") ?? "";
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) notFound();
  return <ChatPreview />;
}

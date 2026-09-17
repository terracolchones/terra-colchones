import type { MessageView } from "@/components/types";
import { PanelAsset } from "./PanelAsset";

interface MessageBubbleProps {
  message: MessageView;
}

function timestamp(seconds: number): string {
  return new Intl.DateTimeFormat("es", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(seconds * 1000));
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const outgoing = message.role !== "user";
  const failed = outgoing && !message.wa_message_id;
  const style = outgoing ? "rounded-tr-sm bg-[#d9fdd3] text-[#172b25]" : "rounded-tl-sm bg-white text-[#172b25]";

  return (
    <div data-message-id={message.id} className={`flex ${outgoing ? "justify-end" : "justify-start"}`}>
      <div className={`min-w-0 max-w-[92%] rounded-xl px-3.5 py-2 shadow-sm sm:max-w-[78%] ${style}`}>
        {message.asset&&<PanelAsset asset={message.asset}/>}
        {message.content !== message.asset?.caption && <p className="whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">{message.content}</p>}
        <div className="mt-1 flex flex-wrap items-center justify-end gap-1 text-[11px] text-[#52695f]">
          {message.role === "assistant" ? "IA" : message.role === "human" ? "Asesor" : "Cliente"}
          <span>·</span>
          <span>{timestamp(message.created_at)}</span>
          {failed && <span title="No hay confirmación local del envío; revisa su estado antes de intentar enviarlo otra vez">{message.asset?.sendState==="failed"?"⚠ No enviado":message.asset?.sendState==="preparing"?"Preparando archivo…":"⚠ Envío sin confirmar"}</span>}
        </div>
      </div>
    </div>
  );
}

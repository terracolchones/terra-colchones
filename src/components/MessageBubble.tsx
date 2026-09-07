import type { MessageView } from "@/components/types";

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
  const style =
    message.role === "assistant"
      ? "bg-emerald-600 text-white"
      : message.role === "human"
        ? "bg-amber-300 text-amber-950"
        : "border border-slate-200 bg-white text-slate-800";

  return (
    <div className={`flex ${outgoing ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[82%] rounded-2xl px-4 py-2.5 shadow-sm ${style}`}>
        <p className="whitespace-pre-wrap break-words text-sm leading-5">{message.content}</p>
        <div className={`mt-1 flex items-center gap-1 text-[10px] ${outgoing ? "justify-end" : "justify-start"} opacity-75`}>
          {message.role === "assistant" ? "IA" : message.role === "human" ? "Humano" : "Cliente"}
          <span>·</span>
          <span>{timestamp(message.created_at)}</span>
          {failed && <span title="El mensaje no pudo enviarse a WhatsApp">⚠ No enviado</span>}
        </div>
      </div>
    </div>
  );
}

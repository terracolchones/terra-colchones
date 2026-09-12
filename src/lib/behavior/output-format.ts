/** Internal minimization markers are never meaningful customer-facing information. */
export function containsInternalPlaceholder(value: string): boolean {
  return /\[[^\]\n]{0,90}(?:omitid[oa]s?|redactad[oa]s?)[^\]\n]{0,30}\]|\[(?:pedido|identificador|dato privado)\]/i.test(value);
}

function isWhatsAppUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "whatsapp.com" || host.endsWith(".whatsapp.com")
      || /^(?:www\.)?wa\.(?:me|link)$/.test(host);
  } catch { return false; }
}

/** Plain text only; approved map links remain intact, including approved short URLs. */
export function formatAssistantText(value: string): string {
  return value
    .replace(/\[([^\]\n]*)\]\((https?:\/\/[^\s)]+)\)/gi, (_whole, label: string, url: string) => {
      if (isWhatsAppUrl(url)) return "";
      return !label || label === url ? url : `${label}: ${url}`;
    })
    .replace(/(?:WhatsApp:\s*)?https?:\/\/[^\s]+/gi, (match) => {
      const url = match.replace(/^WhatsApp:\s*/i, "");
      return isWhatsAppUrl(url.replace(/[.,;]+$/, "")) ? "" : match;
    })
    .replace(/(?:WhatsApp:\s*)?(?<![\w/.])(?:www\.)?wa\.(?:me|link)\/[^\s]+/gi, "")
    .replace(/\*/g, "")
    .replace(/```(?:\w+)?\s*|`/g, "")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .split(/\r?\n/).map((line) => line.trim().replace(/^(?:WhatsApp:)?\s*$/, ""))
    .join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Mixed answers may phrase facts naturally, but cannot invent or swap the selected advisors' numbers. */
export function hasUnsupportedPublicContact(value: string, evidence: string): boolean {
  const normalize = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es");
  const contacts = evidence.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([^:\n]{1,60}):\s*(\+?\d[\d ().-]*\d)$/);
    if (!match || match[2].replace(/\D/g, "").length < 7) return [];
    return [{ name: normalize(match[1]), digits: match[2].replace(/\D/g, "") }];
  });
  for (const line of value.replace(/https?:\/\/\S+/gi, "").split(/\r?\n/)) {
    for (const phone of line.matchAll(/(?:\+?\d[ ().-]*){7,}/g)) {
      const digits = phone[0].replace(/\D/g, "");
      const allowed = contacts.filter((contact) => contact.digits === digits);
      if (!allowed.length) return true;
      const label = normalize(line.slice(0, phone.index)).trim().replace(/:\s*$/, "").replace(/^[-•]\s*/, "");
      if (label ? !allowed.some((contact) => contact.name === label)
        : !allowed.some((contact) => /^(?:telefono|contacto|celular)$/.test(contact.name))) return true;
    }
  }
  return false;
}

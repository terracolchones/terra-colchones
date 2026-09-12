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

const BRANCH_REPLY_LIMIT = 4096;
const BRANCH_FALLBACK = 'Te comparto las ubicaciones publicadas. Para el otro detalle, escribe "asesor" y te ayudamos.';

function branchLabel(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es")
    .replace(/^\s*📍\s*/, "").replace(/\s*[-–—]\s*/g, " - ").replace(/\s+/g, " ").replace(/[:.]+$/, "").trim();
}

/** Compare branch/map pairs, not merely membership in a list of otherwise valid URLs. */
function hasUnsupportedBranchMap(value: string, blocks: string[]): boolean {
  const approved = blocks.map((block) => {
    const lines = block.split("\n");
    return { title: branchLabel(lines[0]), url: /^https?:\/\//i.test(lines[1] ?? "") ? lines[1] : null };
  });
  const urls = new Set(approved.flatMap((branch) => branch.url ? [branch.url] : []));
  let currentBranch: (typeof approved)[number] | undefined;
  for (const line of value.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const lineUrls = [...line.matchAll(/https?:\/\/[^\s<>\]]+/gi)].map((match) => match[0].replace(/[).,;!]+$/, ""));
    if (/^\s*📍|\bsucursal\b/i.test(line)) {
      const label = branchLabel(line.replace(/https?:\/\/\S+/gi, ""));
      currentBranch = approved.find((branch) => branch.title === label);
      if (!currentBranch) return true;
    }
    for (const url of lineUrls) {
      if (currentBranch && currentBranch.url !== url) return true;
      const mapReference = /\b(?:mapas?|ubicaci[oó]n)\b/i.test(line)
        || /(?:maps\.|\/maps(?:\/|\?|$)|goo\.gl|bit\.ly)/i.test(url);
      if (mapReference && !urls.has(url)) return true;
    }
  }
  return false;
}

/** Preserve only verified branch/map pairs, within a single WhatsApp text message. */
export function appendMissingBranchBlocks(value: string, blocks: string[] = []): string {
  if (blocks.length === 0) return value;
  const base = hasUnsupportedBranchMap(value, blocks) ? BRANCH_FALLBACK : value;
  const missing = blocks.filter((block) => !base.includes(block.split("\n").slice(0, 2).join("\n")));
  const candidate = missing.length ? `${base}\n\n${missing.join("\n\n")}` : base;
  if (candidate.length <= BRANCH_REPLY_LIMIT) return candidate;
  const compact = `${BRANCH_FALLBACK}\n\n${blocks.join("\n\n")}`;
  if (compact.length <= BRANCH_REPLY_LIMIT) return compact;
  // Do not cut a link or send only an arbitrary subset when the directory itself is too large.
  return "Tengo varias sucursales para compartirte. ¿De qué ciudad necesitas la ubicación?";
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

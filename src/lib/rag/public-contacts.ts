import type { Message } from "@/lib/db";
import { hasSensitiveCommerceData, isPublicContactQuestion, isPublicDirectoryQuestion, requestsCheckoutAction } from "@/lib/message-routing";
import { ADVISOR_NOTICE } from "@/lib/behavior/instructions";
import type { KnowledgeChunk, RetrievedSource } from "./core";

interface Contact { name: string; phone: string; }
interface Office { title: string; address?: string; map?: string; }
interface DirectoryCity { name: string; contacts: Contact[]; offices: Office[]; hours: string[]; }
export interface DirectoryReply { content: string; sources: RetrievedSource[]; branchBlocks?: string[]; }

function normalize(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es");
}

function cleanLine(value: string): string {
  return value.replace(/^\s*(?:#{1,6}\s+|[-*•]\s+)/, "").replace(/\*/g, "").trim();
}

function headingCity(line: string): { city: string; kind: "contacts" | "office" | "hours" } | null {
  const heading = cleanLine(line);
  const match = heading.match(/^(pedidos e informaci[oó]n|contactos?|asesores?|tel[eé]fonos?|sucursal[^:–—]*|horarios?(?: de atenci[oó]n)?)\s+[-–—:]\s+([\p{L}][\p{L}\s.'-]{1,59})$/iu);
  if (!match) return null;
  const kind = /^sucursal/i.test(match[1]) ? "office" : /^horario/i.test(match[1]) ? "hours" : "contacts";
  return { city: match[2].trim(), kind };
}

/** Reassemble each published version before reading headings: a chunk boundary is not a new city. */
function publishedDocuments(chunks: KnowledgeChunk[]): string[] {
  const documents = new Map<string, { index: number; content: string }[]>();
  for (const chunk of chunks) {
    const match = chunk.id.match(/^published-(.+)-(\d+)$/);
    if (!match) continue;
    const parts = documents.get(match[1]) ?? [];
    parts.push({ index: Number(match[2]), content: chunk.content });
    documents.set(match[1], parts);
  }
  return [...documents.values()].map((parts) => {
    const sorted = parts.sort((a, b) => a.index - b.index);
    return sorted.map((part, index) => {
      // Legacy chunks can hard-cut a field. Reject an ambiguous split phone instead of emitting its prefix.
      const next = sorted[index + 1]?.content;
      return /\d$/.test(part.content) && next && /^\d/.test(next) ? `${part.content} [campo dividido]` : part.content;
    }).join("\n");
  });
}

/** Only explicit city sections and labelled phone fields are authority for contact ownership. */
export function parsePublishedDirectory(chunks: KnowledgeChunk[]): DirectoryCity[] {
  const cities = new Map<string, DirectoryCity>();
  for (const document of publishedDocuments(chunks)) {
    let city: DirectoryCity | undefined;
    let kind: "contacts" | "office" | "hours" | undefined;
    let office: Office | undefined;
    const cityNames = new Set(document.split(/\r?\n/).map(headingCity).filter((item) => item !== null).map((item) => normalize(item.city)));
    for (const raw of document.split(/\r?\n/)) {
      const line = cleanLine(raw);
      if (!line) continue;
      const heading = headingCity(line);
      if (heading) {
        const key = normalize(heading.city);
        city = cities.get(key) ?? { name: heading.city, contacts: [], offices: [], hours: [] };
        cities.set(key, city);
        kind = heading.kind;
        office = kind === "office" ? { title: line } : undefined;
        if (office) city.offices.push(office);
        continue;
      }
      if (cityNames.has(normalize(line))) { city = undefined; kind = undefined; office = undefined; continue; }
      if (!city || !kind) continue;
      if (kind === "contacts") {
        const match = line.match(/^([\p{L}][\p{L}\s.'-]{0,59}):\s*(\+?\d[\d\s().-]*\d)(?:\s*(?:[.;,]?\s*WhatsApp:).*)?$/iu);
        if (match) {
          const phone = match[2].trim().replace(/[.;,]+$/, "");
          const digits = phone.replace(/\D/g, "");
          if (digits.length >= 7 && digits.length <= 15 && !/\b(?:cuenta|bancari[oa]|tarjeta|pedido|codigo|pin|cvv|nit|ci|documento|identidad)\b/.test(normalize(match[1]))) {
            city.contacts.push({ name: match[1].trim(), phone });
          }
          continue;
        }
      }
      if (kind === "office" && office) {
        if (/^direcci[oó]n:\s*\S/i.test(line)) { office.address = line.replace(/^direcci[oó]n:\s*/i, ""); continue; }
        if (/^ubicaci[oó]n:/i.test(line)) {
          const url = line.match(/https?:\/\/[^\s)\]]+/i)?.[0];
          if (url && !/(?:wa\.me|wa\.link|api\.whatsapp\.com|web\.whatsapp\.com)/i.test(url)) office.map = url;
          continue;
        }
      }
      if (kind === "hours" && /\b(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bados?|domingos?)\b/i.test(line) && /\d/.test(line)) {
        city.hours.push(line); continue;
      }
      // An unrelated heading ends the section; do not borrow a following policy/phone from it.
      if (!/^[-*•]/.test(raw.trim())) { kind = undefined; office = undefined; }
    }
  }
  return [...cities.values()].map((city) => ({
    ...city,
    contacts: [...new Map(city.contacts.map((contact) => [`${normalize(contact.name)}:${contact.phone.replace(/\D/g, "")}`, contact])).values()],
    hours: [...new Set(city.hours)],
  }));
}

function hasName(text: string, name: string): boolean {
  const escaped = normalize(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z])${escaped}(?:$|[^a-z])`).test(normalize(text));
}

function namesIn(text: string, cities: DirectoryCity[]): string[] {
  return [...new Set(cities.flatMap((city) => city.contacts.map((contact) => contact.name)))]
    .filter((name) => !/^(?:telefono|contacto|celular|pedidos|informacion)$/i.test(normalize(name)))
    .filter((name) => hasName(text, name));
}

function citiesIn(text: string, cities: DirectoryCity[]): DirectoryCity[] {
  const exact = cities.filter((city) => hasName(text, city.name)
    || (normalize(city.name) === "cochabamba" && hasName(text, "cocha")));
  if (exact.length) return exact;
  const words = normalize(text).match(/[a-z]{5,}/g) ?? [];
  // Accept one substitution/transposition only when it identifies one published city.
  const matches = cities.filter((city) => {
    const name = normalize(city.name);
    if (!/^[a-z]{5,}$/.test(name)) return false;
    return words.some((word) => word.length === name.length && ([...word].filter((letter, index) => letter !== name[index]).length === 1
      || [...word].some((_, index) => index + 1 < word.length && `${word.slice(0, index)}${word[index + 1]}${word[index]}${word.slice(index + 2)}` === name)));
  });
  return matches.length === 1 ? matches : [];
}

const OTHER_TOPIC = /\b(?:precios?|cuanto|cuesta|cotizacion|stock|disponible|garantias?|pagos?|pagar|qr|comprobantes?|entregas?|entregan|envios?|envian|colchon(?:es)?|sillon(?:es)?|almohadas?|muebles?|productos?|catalogos?)\b/;
function explicitDirectoryQuestion(content: string): boolean {
  return isPublicDirectoryQuestion(content);
}

function branchName(office: Office, city: DirectoryCity): string {
  return office.title.replace(/\s+[-–—:]\s+[^-–—:]+$/, "").replace(/^sucursal\s*(?:\d+\s*)?/i, "").trim() || city.name;
}

function branchNamesIn(query: string, cities: DirectoryCity[]): string[] {
  return [...new Set(cities.flatMap((city) => city.offices.map((office) => branchName(office, city))))]
    .filter((name) => hasName(query, name));
}

function repeatDirectoryRequest(query: string): boolean {
  return /\b(?:nuevamente|de nuevo|otra vez)\b/.test(normalize(query))
    && /\b(?:dar|dame|pasar|pasame|enviar|enviame|mandar|mandame|compartir|mostrar|ver)\b/.test(normalize(query))
    && !OTHER_TOPIC.test(normalize(query));
}

function bareDirectoryContinuation(query: string, previous: Message[]): boolean {
  const text = normalize(query).replace(/[¿?!.]/g, "").trim();
  return /^[a-z]+(?:\s+[a-z]+){0,2}$/.test(text) && !OTHER_TOPIC.test(text)
    && !/\b(?:gracias|hola|adios|bien|luego|bueno|perfecto|vale|ok|entendido|listo|estoy|estas|quiero|necesito|puedo|puedes|si|no)\b/.test(text)
    && !hasSensitiveCommerceData(query) && !requestsCheckoutAction(query)
    && previous.some((message) => message.role === "user" && explicitDirectoryQuestion(message.content));
}

/** No customer values are retrieved. The caller supplies already minimized history. */
export function shouldRetrievePublicDirectory(history: Message[]): boolean {
  const userMessages = history.filter((message) => message.role === "user");
  const latest = userMessages.at(-1)?.content ?? "";
  if (explicitDirectoryQuestion(latest)) return true;
  if (hasSensitiveCommerceData(latest) || requestsCheckoutAction(latest)) return false;
  // A short city answer can complete a directory clarification. The resolver still must match a published city.
  return /^[\p{L}\s¿?!.]{2,60}$/u.test(latest) && !OTHER_TOPIC.test(normalize(latest))
    && userMessages.slice(-3, -1).some((message) => explicitDirectoryQuestion(message.content));
}

export function hasOtherCommerceQuestion(query: string): boolean { return OTHER_TOPIC.test(normalize(query)); }

function isClearFollowup(query: string, previous: Message[]): boolean {
  if (/^[\p{L}\s]{2,40}$/u.test(query.trim()) && !OTHER_TOPIC.test(normalize(query))
    && !/\b(?:gracias|hola|adios|bien|luego|bueno|perfecto)\b/.test(normalize(query))
    && previous.at(-1)?.role === "assistant" && /\bde que ciudad\b/.test(normalize(previous.at(-1)!.content))) return true;
  return !OTHER_TOPIC.test(normalize(query)) && !/\b(?:gracias|hola|adios|bien|estas|luego|bueno|perfecto)\b/.test(normalize(query))
    && /^(?:¿?\s*y\s+|(?:el|la|los|las)\s+de\b)[\p{L}\s¿?!.]{1,50}$/iu.test(query.trim())
    && previous.some((message) => message.role === "user" && explicitDirectoryQuestion(message.content));
}

function hasUnknownTarget(query: string, cities: DirectoryCity[]): boolean {
  let target = normalize(query).match(/\b(?:numeros?|telefonos?|celulares?|contactos?|whatsapp)\s+(?:de|del|para)\s+(.+)/)?.[1]
    ?? normalize(query).match(/\b(?:direccion(?:es)?|ubicacion(?:es)?|mapas?|datos|sucursal(?:es)?|oficinas?)\s+(?:de|del|en|para)\s+(.+)/)?.[1]
    ?? normalize(query).match(/^(?:¿?\s*y\s+)?(?:el\s+|la\s+)?de\s+(.+)/)?.[1]
    ?? normalize(query).match(/^¿?\s*y\s+(.+)/)?.[1];
  if (!target) return false;
  target = target.split(/\s+y\s+(?:cuanto|que|como|cuando|formas?|metodos?|envios?|entregas?|pagos?|garantias?)|[?!;]/)[0];
  for (const city of cities) {
    const names = [city.name, ...city.contacts.map((contact) => contact.name), ...city.offices.map((office) => branchName(office, city)),
      ...(normalize(city.name) === "cochabamba" ? ["cocha"] : [])];
    for (const name of names) {
      const escaped = normalize(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      target = target.replace(new RegExp(`(^|[^a-z])${escaped}(?=$|[^a-z])`, "g"), "$1 ");
    }
  }
  // An accepted city typo is still a known target; never echo the misspelling in the answer.
  if (citiesIn(query, cities).length === 1) {
    const name = normalize(citiesIn(query, cities)[0].name);
    target = target.replace(/\b[a-z]{5,}\b/g, (word) => word.length === name.length
      && ([...word].filter((letter, index) => letter !== name[index]).length <= 1
        || [...word].some((_, index) => `${word.slice(0, index)}${word[index + 1] ?? ""}${word[index]}${word.slice(index + 2)}` === name)) ? " " : word);
  }
  return target.replace(/\b(?:y|el|la|los|las|un|una|de|del|en|para|a|su|sus|ese|esa|este|esta|esos|esas|estos|estas|ella|ellas|ellos|ahi|alli|alla|aqui|contacto|contactos|numero|numeros|telefono|telefonos|celular|celulares|asesor|asesora|asesores|asesoras|atencion|horarios?|direccion(?:es)?|ubicacion(?:es)?|mapas?|datos|oficina|oficinas|sucursal|sucursales|ciudad|ciudades|tienda|local|terra|ustedes|tanto|por|favor)\b/g, " ").replace(/[^a-z]/g, "").length > 0;
}

function requestedFields(query: string) {
  const text = normalize(query);
  const contacts = isPublicContactQuestion(query);
  const offices = /\b(?:direccion(?:es)?|ubicacion(?:es)?|sucursal(?:es)?|oficinas?|mapas?)\b|\b(?:donde estan|como llego)\b/.test(text)
    || (/\bgps\b/.test(text) && explicitDirectoryQuestion(query));
  const hours = /\bhorarios?\b/.test(text);
  const details = !contacts && !offices && !hours && /\b(?:datos|informacion|detalles)\b/.test(text) && explicitDirectoryQuestion(query);
  return {
    contacts: contacts || details,
    offices: offices || details,
    hours: hours || details,
  };
}

/** Contacts are rendered from the current published record, never copied back from assistant history. */
export function buildPublicDirectoryReply(history: Message[], chunks: KnowledgeChunk[]): DirectoryReply | null {
  const latestIndex = history.findLastIndex((message) => message.role === "user");
  const query = history[latestIndex]?.content ?? "";
  const contactQuestion = isPublicContactQuestion(query);
  const previousHistory = history.slice(Math.max(0, latestIndex - 6), latestIndex);
  const clearFollowup = isClearFollowup(query, previousHistory);
  const cities = parsePublishedDirectory(chunks);
  if (cities.length === 0) {
    return contactQuestion || clearFollowup || bareDirectoryContinuation(query, previousHistory) || requestedFields(query).offices || (repeatDirectoryRequest(query) && previousHistory.some((message) => message.role === "user" && explicitDirectoryQuestion(message.content)))
      ? { content: contactQuestion || previousHistory.some((message) => message.role === "user" && isPublicContactQuestion(message.content))
        ? `No tengo un contacto publicado que pueda confirmar ahora. ${ADVISOR_NOTICE}` : `No pude consultar la información publicada de las sucursales ahora. ${ADVISOR_NOTICE}`, sources: [] } : null;
  }
  const directCities = citiesIn(query, cities);
  if (hasName(query, "cocha") && !cities.some((city) => normalize(city.name) === "cochabamba")) {
    return { content: `No encuentro datos publicados para esa sucursal. ${ADVISOR_NOTICE}`, sources: [] };
  }
  const requestedBranches = branchNamesIn(query, cities);
  let names = namesIn(query, cities);
  let fields = requestedFields(query);
  if (!fields.contacts && !fields.offices && !fields.hours) {
    // Only a known city may inherit the previous question; "gracias" must not repeat the directory.
    if (hasOtherCommerceQuestion(query)) return null;
    const bare = normalize(query).replace(/[¿?!.]/g, "").replace(/^(?:y\s+)?(?:(?:el|la|los|las)\s+)?(?:de\s+)?/, "").trim();
    const isBareKnownTarget = [...directCities.map((city) => city.name), ...names, ...requestedBranches].some((name) => normalize(name) === bare)
      || (directCities.length === 1 && /^[a-z]+$/.test(bare) && citiesIn(bare, cities).length === 1);
    const repeatedKnownTarget = repeatDirectoryRequest(query) && (directCities.length > 0 || requestedBranches.length > 0);
    if (!isBareKnownTarget && !clearFollowup && !repeatedKnownTarget) return null;
    if (!isBareKnownTarget && names.length === 0 && directCities.length === 0 && requestedBranches.length === 0
      && !/\b(?:alli|ahi|alla|aqui|ella|el|esa|ese|esta|este|su)\b/.test(normalize(query))) {
      return { content: `No encuentro ese contacto en la información publicada. ${ADVISOR_NOTICE}`, sources: [] };
    }
    const prior = history.slice(0, latestIndex).reverse().find((message) => message.role === "user" && explicitDirectoryQuestion(message.content));
    if (!prior) return null;
    fields = requestedFields(prior.content);
  }
  let selected = directCities;
  if (selected.length === 0 && names.length > 0) selected = cities.filter((city) => city.contacts.some((contact) => names.includes(contact.name)));
  // An explicit but unknown destination/person must not inherit a previous city.
  const unknownTarget = hasUnknownTarget(query, cities);
  if (unknownTarget) {
    return { content: fields.contacts ? `No encuentro ese contacto en la información publicada. ${ADVISOR_NOTICE}` : `No encuentro datos publicados para esa sucursal. ${ADVISOR_NOTICE}`, sources: [] };
  }
  if (selected.length === 0 && /\b(?:todos|todas)\b/.test(normalize(query))) selected = cities;
  if (selected.length === 0) {
    const matchingBranchCities = cities.filter((city) => city.offices.some((office) => requestedBranches.includes(branchName(office, city))));
    if (matchingBranchCities.length === 1) selected = matchingBranchCities;
  }
  if (selected.length === 0) {
    // User-selected city/name takes priority over an assistant message listing several contacts.
    const previousMessages = [...previousHistory.filter((message) => message.role === "user").reverse(),
      ...previousHistory.filter((message) => message.role !== "user").reverse()];
    for (const previous of previousMessages) {
      const matches = citiesIn(previous.content, cities);
      if (matches.length > 1) {
        if (previous.role === "user") break;
        continue;
      }
      if (matches.length === 1) { selected = matches; names = namesIn(previous.content, cities); break; }
      if (previous.role === "user") {
        const previousNames = namesIn(previous.content, cities);
        const matchingCities = cities.filter((city) => city.contacts.some((contact) => previousNames.includes(contact.name)));
        if (matchingCities.length === 1) { selected = matchingCities; names = previousNames; break; }
      }
    }
  }
  if (selected.length === 0) {
    return { content: fields.contacts ? "¿De qué ciudad necesitas los números de contacto?" : "¿De qué ciudad necesitas la información de la sucursal?", sources: [] };
  }
  if (names.length && selected.length > 1 && directCities.length === 0) {
    return { content: "Ese nombre aparece en más de una ciudad. ¿De qué ciudad necesitas el contacto?", sources: [] };
  }
  const sections: string[] = [];
  const branchBlocks: string[] = [];
  for (const city of selected) {
    const lines: string[] = [];
    if (fields.offices) {
      const offices = city.offices.filter((office) => requestedBranches.length === 0 || requestedBranches.includes(branchName(office, city)));
      for (const office of offices) {
        const block = [`📍 ${office.title}`, office.map ?? "No tengo un enlace de mapa publicado para esta sucursal.",
          ...(office.address ? [`Dirección: ${office.address}`] : [])].join("\n");
        lines.push(block);
        branchBlocks.push(block);
      }
      if (offices.length === 0) lines.push(`No tengo una dirección publicada para esa sucursal de ${city.name}.`);
    }
    if (fields.hours) lines.push(`${city.name}\n${(city.hours.length ? city.hours : ["No tengo un horario publicado para esta sucursal."]).join("\n")}`);
    if (fields.contacts) {
      const contacts = city.contacts.filter((contact) => names.length === 0 || names.includes(contact.name));
      const conflicting = contacts.some((contact) => !/^(?:telefono|contacto|celular)$/i.test(normalize(contact.name))
        && contacts.some((other) => normalize(other.name) === normalize(contact.name) && other.phone.replace(/\D/g, "") !== contact.phone.replace(/\D/g, "")));
      if (conflicting) lines.push(`${city.name}\nHay datos de contacto distintos para el mismo asesor y necesito confirmarlos. ${ADVISOR_NOTICE}`);
      else if (contacts.length) lines.push(`${city.name}\n${contacts.map((contact) => `${contact.name}: ${contact.phone}`).join("\n")}`);
      else lines.push(`${city.name}\nNo tengo un número publicado para este contacto. ${ADVISOR_NOTICE}`);
    }
    sections.push(lines.join("\n\n"));
  }
  const intro = fields.offices ? "Claro 😊, te comparto la información de nuestras sucursales:" : "Claro 😊, te comparto la información:";
  const content = `${intro}\n\n${sections.join("\n\n")}`;
  // Keep only the facts selected for this answer as model-visible evidence.
  const sources: RetrievedSource[] = [{ id: "published-directory-selection", kind: "knowledge", label: "Contactos y sucursales publicados", content, score: 1 }];
  return { content, sources, ...(branchBlocks.length ? { branchBlocks } : {}) };
}

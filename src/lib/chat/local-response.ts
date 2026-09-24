import { ORG } from "@/lib/config";
import type { ChatLanguagePreference } from "@/lib/chat/language";
import type {
  ChatResponse,
  ChatSource,
  SourceManifestEntry,
} from "@/lib/knowledge/types";

const OFFICIAL_HOME_SOURCE: ChatSource = {
  id: "autrey-mill-official-home",
  title: "Autrey Mill Nature Preserve & Heritage Center — Official Website",
  url: `${ORG.canonicalOrigin}/`,
  sourceType: "official_website",
};

function normalizeConversationalMessage(message: string): string {
  return message
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const DOCUMENT_MATCH_STOP_WORDS = new Set([
  "document",
  "official",
  // The organization name appears in document titles and ordinary questions
  // alike, so it cannot identify a specific document.
  "autrey",
  "mill",
  "the",
  "version",
]);

function words(value: string): string[] {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .match(/[a-z0-9]+/g) ?? [];
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? right.length;
}

function approximatelyMatchesWord(value: string, expected: string): boolean {
  if (value === expected) return true;
  if (Math.min(value.length, expected.length) < 5) return false;
  const maximumDistance = Math.max(value.length, expected.length) >= 8 ? 2 : 1;
  if (Math.abs(value.length - expected.length) > maximumDistance) return false;
  return editDistance(value, expected) <= maximumDistance;
}

function squashedWord(value: string): string {
  return value.replace(/(.)\1+/g, "$1");
}

function conversationalWordMatches(value: string, expected: string): boolean {
  return (
    approximatelyMatchesWord(value, expected) ||
    approximatelyMatchesWord(squashedWord(value), expected)
  );
}

function isGreetingWord(value: string): boolean {
  return ["hi", "hey", "hello", "howdy"].some((greeting) => {
    const squashed = squashedWord(value);
    return (
      value === greeting ||
      squashed === greeting ||
      (Math.min(value.length, greeting.length) >= 4 &&
        editDistance(value, greeting) <= 1) ||
      (Math.min(squashed.length, greeting.length) >= 4 &&
        editDistance(squashed, greeting) <= 1)
    );
  });
}

function greetingPrefixWordCount(message: string): number {
  const messageWords = words(message);
  if (messageWords.length === 0) return 0;
  if (isGreetingWord(messageWords[0] ?? "")) {
    return conversationalWordMatches(messageWords[1] ?? "", "there")
      ? 2
      : 1;
  }
  if (
    conversationalWordMatches(messageWords[0] ?? "", "good") &&
    ["morning", "afternoon", "evening"].some((partOfDay) =>
      conversationalWordMatches(messageWords[1] ?? "", partOfDay),
    )
  ) {
    return 2;
  }
  if (
    conversationalWordMatches(messageWords[0] ?? "", "thank") &&
    conversationalWordMatches(messageWords[1] ?? "", "you")
  ) {
    return 2;
  }
  return ["thanks", "thx"].includes(messageWords[0] ?? "") ? 1 : 0;
}

export function focusConversationalQuery(message: string): string {
  const normalized = normalizeConversationalMessage(message);
  const prefixWords = greetingPrefixWordCount(normalized);
  const matches = [...normalized.matchAll(/[a-z0-9]+/g)];
  const prefixEnd =
    prefixWords > 0
      ? (matches[prefixWords - 1]?.index ?? 0) +
        (matches[prefixWords - 1]?.[0].length ?? 0)
      : 0;
  let focused = prefixEnd > 0 ? normalized.slice(prefixEnd) : normalized;
  focused = focused
    .replace(/^[\s,;:!—–-]+/, "")
    .replace(/^(?:please|pls|plz)\b[\s,;:!—–-]*/, "")
    .replace(
      /[\s,;:!—–-]*(?:please|pls|plz|thanks|thank you|thx)$/,
      "",
    )
    .trim();
  return focused || normalized;
}

function hasApproximateIntent(message: string): boolean {
  const messageWords = words(message);
  if (messageWords.length <= 3) return true;
  const hasSecondPerson = messageWords.some((word) =>
    ["you", "u", "ya"].includes(word),
  );
  const hasIntentVerb = messageWords.some((word) =>
    ["access", "available", "have", "help", "know", "read", "reference", "see", "use"].some(
      (expected) =>
        conversationalWordMatches(word, expected) ||
        (Math.min(word.length, expected.length) >= 4 &&
          editDistance(word, expected) <= 1),
    ),
  );
  return hasSecondPerson && hasIntentVerb;
}

function asksAboutDocumentAccess(message: string): boolean {
  const messageWordCount = words(message).length;
  return (
    /^(?:do (?:you|u) (?:have|got)(?: access to)?|can (?:you|u) (?:access|read|reference|see|use)|are (?:you|u) able to (?:access|read|reference|see|use))\b/.test(
      message,
    ) ||
    /^(?:can|could|will|would) (?:you|u) help(?: me)? (?:with|using)\b/.test(
      message,
    ) ||
    /^i (?:need|want) help (?:with|using)\b/.test(message) ||
    /^do (?:you|u) know about\b/.test(message) ||
    /^is .+ (?:available to (?:you|u)|in your (?:knowledge base|sources))$/.test(
      message,
    ) ||
    messageWordCount <= 3 ||
    hasApproximateIntent(message)
  );
}

function matchingOfficialDocument(
  normalizedMessage: string,
  manifest: SourceManifestEntry[],
): SourceManifestEntry | undefined {
  const documentQuestion = focusConversationalQuery(normalizedMessage);
  if (!asksAboutDocumentAccess(documentQuestion)) return undefined;
  const messageWords = words(documentQuestion);
  const candidates = manifest
    .filter(
      (entry) => entry.sourceType === "official_document" && Boolean(entry.url),
    )
    .map((entry) => {
      const baseTitle = entry.title.replace(/\s+-\s+Version\b.*$/i, "");
      const titleWords = words(baseTitle).filter(
        (word) =>
          word.length >= 4 &&
          !/^\d+$/.test(word) &&
          !DOCUMENT_MATCH_STOP_WORDS.has(word),
      );
      const identifyingTitleWord = titleWords.at(-1);
      const documentWords = new Set(
        words(`${entry.id} ${entry.title}`).filter(
          (word) =>
            word.length >= 4 &&
            !/^\d+$/.test(word) &&
            !DOCUMENT_MATCH_STOP_WORDS.has(word),
        ),
      );
      const matchedWords = [...documentWords].filter((documentWord) =>
        messageWords.some((messageWord) =>
          conversationalWordMatches(messageWord, documentWord),
        ),
      );
      return {
        entry,
        score: matchedWords.length,
        hasDistinctiveSingleMatch: matchedWords.some(
          (word) =>
            word.length >= 8 && word === identifyingTitleWord,
        ),
      };
    })
    .filter(
      ({ score, hasDistinctiveSingleMatch }) =>
        score >= 2 || hasDistinctiveSingleMatch,
    )
    .sort((left, right) => right.score - left.score);

  if (candidates.length === 0) return undefined;
  if (
    candidates.length > 1 &&
    candidates[0]?.score === candidates[1]?.score
  ) {
    return undefined;
  }
  return candidates[0]?.entry;
}

function answered(
  answer: string,
  sources: ChatSource[] = [OFFICIAL_HOME_SOURCE],
): ChatResponse {
  return {
    status: "answered",
    answer,
    sources,
    contactRecommended: false,
  };
}

type AutomaticGreetingLanguage =
  | "ar-latn"
  | "es"
  | "fr"
  | "hi-latn"
  | "it"
  | "pt"
  | "tl"
  | "vi-latn"
  | "zh-latn";

function automaticGreetingLanguage(
  message: string,
): AutomaticGreetingLanguage | undefined {
  if (/^(hola|buenos dias|buenas tardes|buenas noches)$/.test(message)) {
    return "es";
  }
  if (/^(bonjour|salut)$/.test(message)) return "fr";
  if (/^(namaste|namaskar)$/.test(message)) return "hi-latn";
  if (/^(salam|salaam|assalamu alaikum|as-salamu alaykum)$/.test(message)) {
    return "ar-latn";
  }
  if (/^(ola|olá|bom dia|boa tarde|boa noite)$/.test(message)) return "pt";
  if (/^(ciao|buongiorno|buonasera)$/.test(message)) return "it";
  if (/^(xin chao)$/.test(message)) return "vi-latn";
  if (/^(kumusta|kamusta)$/.test(message)) return "tl";
  if (/^(ni hao|nihao)$/.test(message)) return "zh-latn";
  return undefined;
}

function automaticGreetingAnswer(
  detectedLanguage: AutomaticGreetingLanguage,
): string {
  const responses: Record<AutomaticGreetingLanguage, string> = {
    es: "¡Hola! Puedo ayudarte a encontrar información aprobada de Autrey Mill. ¿En qué puedo ayudarte?",
    fr: "Bonjour ! Je peux vous aider à trouver des informations approuvées sur Autrey Mill. Que souhaitez-vous savoir ?",
    "hi-latn": "Namaste! Main Autrey Mill ke baare mein approved jaankari dhoondhne mein aapki madad kar sakta hoon. Aap kya jaanna chahenge?",
    "ar-latn": "Ahlan! Mumkin asaedak fi al-hosool ala maaloomat muetamada an Autrey Mill. Sho habeb taaraf?",
    pt: "Olá! Posso ajudar você a encontrar informações aprovadas sobre Autrey Mill. O que você gostaria de saber?",
    it: "Ciao! Posso aiutarti a trovare informazioni approvate su Autrey Mill. Cosa vorresti sapere?",
    "vi-latn": "Xin chao! Toi co the giup ban tim thong tin da duoc phe duyet ve Autrey Mill. Ban muon biet gi?",
    tl: "Kumusta! Matutulungan kitang makahanap ng aprubadong impormasyon tungkol sa Autrey Mill. Ano ang gusto mong malaman?",
    "zh-latn": "Ni hao! Wo keyi bang ni chazhao Autrey Mill de yanzheng xinxi. Ni xiang liaojie shenme?",
  };
  return responses[detectedLanguage];
}

export function getLocalConversationalResponse(
  message: string,
  manifest: SourceManifestEntry[] = [],
  language: ChatLanguagePreference = "auto",
): ChatResponse | undefined {
  const normalized = normalizeConversationalMessage(message);
  const detectedGreeting = automaticGreetingLanguage(normalized);

  const officialDocument = matchingOfficialDocument(normalized, manifest);
  if (officialDocument?.url) {
    const conversationalTitle = officialDocument.title.replace(
      /\s+-\s+Version\b.*$/i,
      "",
    );
    return answered(
      language === "es"
        ? `Sí, tengo ${conversationalTitle} disponible como fuente aprobada y puedo ayudarte a responder preguntas basadas en ese documento. ¿Qué te gustaría saber?`
        : `Yes—I have ${conversationalTitle} available as an approved source and can help answer questions from it. What would you like to know?`,
      [
        {
          id: officialDocument.id,
          title: officialDocument.title,
          url: officialDocument.url,
          sourceType: "official_document",
        },
      ],
    );
  }

  if (
    (greetingPrefixWordCount(normalized) > 0 &&
      greetingPrefixWordCount(normalized) === words(normalized).length) ||
    Boolean(detectedGreeting)
  ) {
    return answered(
      language === "es"
        ? "¡Hola! Puedo ayudarte a encontrar información confirmada sobre los horarios, senderos, animales, campamentos, programas, eventos, alquileres, voluntariado y membresía de Autrey Mill. ¿En qué puedo ayudarte?"
        : language === "en" || !detectedGreeting
          ? "Hi! I can help you find confirmed information about Autrey Mill’s hours, trails, animals, camps, programs, events, rentals, volunteering, and membership. What would you like help with?"
          : automaticGreetingAnswer(detectedGreeting),
    );
  }

  if (
    /^(what|which) (questions|things|topics) can (you answer|i ask)$/.test(
      normalized,
    ) ||
    /^(what|how) can you help( me)?( with)?$/.test(normalized)
  ) {
    return answered(
      language === "es"
        ? "Puedes preguntar sobre horarios y visitas, senderos, animales, la Heritage Village, campamentos de verano y de vacaciones escolares, programas para niños y adultos, excursiones escolares y scouts, fiestas de cumpleaños y alquileres, eventos, voluntariado, membresía y donaciones. Pregunta con naturalidad y haz preguntas de seguimiento si necesitas más detalles. No puedo consultar inscripciones, reservas ni membresías personales; cuando la información aprobada no confirme una respuesta, te dirigiré al personal."
        : "You can ask about hours and visiting, trails, animals, the Heritage Village, summer and school-break camps, children’s and adult programs, field trips and scouts, birthday parties and rentals, events, volunteering, membership, and donations. Ask naturally and use follow-up questions if you need more detail. I can’t check a personal registration, booking, or membership, and I’ll direct you to staff when the approved information doesn’t confirm an answer.",
    );
  }

  if (/^(thanks|thank you|thank you so much|thanks so much|thx)$/.test(normalized)) {
    return answered(
      language === "es"
        ? "¡Con gusto! Avísame si tienes otra pregunta sobre Autrey Mill."
        : "You’re welcome! Let me know if you have another question about Autrey Mill.",
    );
  }

  if (
    language === "es" &&
    /^(gracias|muchas gracias|mil gracias)$/.test(normalized)
  ) {
    return answered(
      "¡Con gusto! Avísame si tienes otra pregunta sobre Autrey Mill.",
    );
  }

  return undefined;
}

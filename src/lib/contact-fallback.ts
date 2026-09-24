import { ORG } from "@/lib/config";
import type { ChatLanguagePreference } from "@/lib/chat/language";
import type { ChatResponse, ChatSource } from "@/lib/knowledge/types";

export const CONTACT_SOURCE: ChatSource = {
  id: "contact-autrey-mill",
  title: "Contact Autrey Mill",
  url: ORG.contact.url,
  sourceType: "official_website",
};

export const CONTACT_FALLBACK_TEXT =
  `I could not find a confirmed answer to that question in Autrey Mill's available information. ` +
  `Please contact Autrey Mill at ${ORG.contact.phone} or email ${ORG.contact.email} so a staff member can help.`;

export const SOURCE_VERIFICATION_FALLBACK_TEXT =
  `I could not safely verify a source-backed answer just now. Please try rephrasing the question. ` +
  `If you still need help, contact Autrey Mill at ${ORG.contact.phone} or email ${ORG.contact.email}.`;

function localizedFallbackText(
  status: "not_found" | "conflicting_information",
  language: ChatLanguagePreference,
): string {
  if (language === "es") {
    return status === "conflicting_information"
      ? `La información disponible no coincide en este detalle. Confírmalo con Autrey Mill llamando al ${ORG.contact.phone} o escribiendo a ${ORG.contact.email}.`
      : `No pude encontrar una respuesta confirmada en la información disponible de Autrey Mill. Llama al ${ORG.contact.phone} o escribe a ${ORG.contact.email} para que un miembro del personal pueda ayudarte.`;
  }
  return status === "conflicting_information"
    ? `The available information does not agree on this detail. Please confirm it with Autrey Mill at ${ORG.contact.phone} or by email at ${ORG.contact.email}.`
    : CONTACT_FALLBACK_TEXT;
}

export function contactFallback(
  status: "not_found" | "conflicting_information" = "not_found",
  sources: ChatSource[] = [CONTACT_SOURCE],
  language: ChatLanguagePreference = "auto",
): ChatResponse {
  return {
    status,
    answer: localizedFallbackText(status, language),
    sources: sources.length > 0 ? sources : [CONTACT_SOURCE],
    contactRecommended: true,
  };
}

export function sourceVerificationFallback(
  sources: ChatSource[] = [CONTACT_SOURCE],
  language: ChatLanguagePreference = "auto",
): ChatResponse {
  return {
    status: "not_found",
    answer:
      language === "es"
        ? `No pude verificar de forma segura una respuesta respaldada por una fuente. Intenta reformular la pregunta. Si aún necesitas ayuda, llama a Autrey Mill al ${ORG.contact.phone} o escribe a ${ORG.contact.email}.`
        : SOURCE_VERIFICATION_FALLBACK_TEXT,
    sources: sources.length > 0 ? sources : [CONTACT_SOURCE],
    contactRecommended: true,
  };
}

export function serviceUnavailableResponse(
  language: ChatLanguagePreference = "auto",
): ChatResponse {
  return {
    status: "service_unavailable",
    answer: language === "es"
      ? `El asistente de información no está disponible temporalmente. Inténtalo de nuevo en un momento. Si aún necesitas ayuda, llama a Autrey Mill al ${ORG.contact.phone} o escribe a ${ORG.contact.email}.`
      : `The information assistant is temporarily unavailable. Please try again in a moment. If you still need help, contact Autrey Mill at ${ORG.contact.phone} or email ${ORG.contact.email}.`,
    sources: [CONTACT_SOURCE],
    contactRecommended: true,
  };
}

export function rateLimitedResponse(
  retryAfterSeconds: number,
  language: ChatLanguagePreference = "auto",
): ChatResponse {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return {
    status: "service_unavailable",
    answer: language === "es"
      ? `Alcanzaste el límite temporal de solicitudes del chat. Espera aproximadamente ${minutes} ${minutes === 1 ? "minuto" : "minutos"} e inténtalo de nuevo. Si necesitas ayuda ahora, llama a Autrey Mill al ${ORG.contact.phone} o escribe a ${ORG.contact.email}.`
      : `You've reached the chat's temporary request limit. Please wait about ${minutes} ${minutes === 1 ? "minute" : "minutes"} and try again. ` +
        `If you need help now, contact Autrey Mill at ${ORG.contact.phone} or email ${ORG.contact.email}.`,
    sources: [CONTACT_SOURCE],
    contactRecommended: true,
  };
}

export function sensitiveInformationResponse(
  language: ChatLanguagePreference = "auto",
): ChatResponse {
  return {
    status: "sensitive_information",
    answer: language === "es"
      ? "Para proteger tu privacidad, no compartas números de cuentas personales, contraseñas, datos médicos ni documentos privados en este chat. Comunícate directamente con Autrey Mill para que un miembro del personal pueda ayudarte de forma segura."
      : "For your privacy, please do not share personal account numbers, passwords, medical details, or private documents in this chat. Contact Autrey Mill directly so a staff member can help safely.",
    sources: [CONTACT_SOURCE],
    contactRecommended: true,
  };
}


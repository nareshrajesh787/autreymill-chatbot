export const CHAT_LANGUAGE_PREFERENCES = ["auto", "en", "es"] as const;

export type ChatLanguagePreference =
  (typeof CHAT_LANGUAGE_PREFERENCES)[number];
export type ChatUiLanguage = "en" | "es";

export function isChatLanguagePreference(
  value: unknown,
): value is ChatLanguagePreference {
  return (
    typeof value === "string" &&
    (CHAT_LANGUAGE_PREFERENCES as readonly string[]).includes(value)
  );
}

export function chatUiLanguage(
  preference: ChatLanguagePreference,
): ChatUiLanguage {
  return preference === "es" ? "es" : "en";
}

export const CHAT_UI_COPY = {
  en: {
    assistant: "Assistant",
    officialInformation: "Official information",
    prototypeBy: "Prototype technology by",
    today: "Today",
    welcome:
      "Hi! I can help you find approved information from Autrey Mill Nature Preserve & Heritage Center about visiting, camps, programs, events, rentals, and more. What would you like help with?",
    languageSelector: "Response language",
    languageLabel: "Language",
    languageAuto: "Auto",
    languageEnglish: "English",
    languageSpanish: "Español",
    restart: "Restart conversation",
    minimize: "Minimize chat",
    close: "Close chat",
    typing: "Assistant is looking through approved sources",
    privacy:
      "Please do not share Social Security numbers, bank information, medical details, passwords, or private documents in this chat.",
    inputLabel: "Ask the Autrey Mill information assistant",
    inputPlaceholder: "Ask about hours, camps, events, or rentals...",
    send: "Send message",
    groundingNote: "Answers require a confirmed official source.",
    suggestedQuestions: "Suggested questions",
    sources: "Sources",
    officialSources: "Official sources",
    viewSource: "View on the Autrey Mill website",
    assistantMessage: "Assistant message",
    userMessage: "Your message",
    invalidLong:
      "That message is too long to send. Please shorten it and try again.",
    invalidMessage:
      "The chat control could not read that message. Please type your question in the message box and try again.",
    unavailable:
      "The information assistant is temporarily unavailable. Please try again in a moment. If you still need help, contact Autrey Mill at 678-366-3511 or email info@autreymill.org.",
    sensitiveReplacement: "Sensitive information was not sent.",
    resize:
      "Resize chat. Drag the corner, or use arrow keys while focused.",
    quickActions: [
      {
        label: "Hours & admission",
        question: "What are Autrey Mill's hours, and does it cost anything to visit?",
      },
      {
        label: "Camps",
        question: "What summer and school-break camps does Autrey Mill offer?",
      },
      {
        label: "Birthdays & rentals",
        question: "How do I book a birthday party or rent a space at Autrey Mill?",
      },
      {
        label: "Field trips & scouts",
        question: "What field trip and scout programs does Autrey Mill offer?",
      },
      {
        label: "Upcoming events",
        question: "What upcoming events does Autrey Mill have?",
      },
      {
        label: "Volunteer & membership",
        question: "How can I volunteer or become a member at Autrey Mill?",
      },
    ],
  },
  es: {
    assistant: "Asistente",
    officialInformation: "Información oficial",
    prototypeBy: "Tecnología prototipo de",
    today: "Hoy",
    welcome:
      "¡Hola! Puedo ayudarte a encontrar información aprobada de Autrey Mill Nature Preserve & Heritage Center sobre visitas, campamentos, programas, eventos, alquileres y más. ¿En qué puedo ayudarte?",
    languageSelector: "Idioma de respuesta",
    languageLabel: "Idioma",
    languageAuto: "Auto",
    languageEnglish: "English",
    languageSpanish: "Español",
    restart: "Reiniciar conversación",
    minimize: "Minimizar chat",
    close: "Cerrar chat",
    typing: "El asistente está consultando fuentes aprobadas",
    privacy:
      "No compartas números de Seguro Social, información bancaria, datos médicos, contraseñas ni documentos privados en este chat.",
    inputLabel: "Pregúntale al asistente de información de Autrey Mill",
    inputPlaceholder: "Pregunta sobre horarios, campamentos, eventos o alquileres...",
    send: "Enviar mensaje",
    groundingNote: "Las respuestas requieren una fuente oficial confirmada.",
    suggestedQuestions: "Preguntas sugeridas",
    sources: "Fuentes",
    officialSources: "Fuentes oficiales",
    viewSource: "Ver en el sitio web de Autrey Mill",
    assistantMessage: "Mensaje del asistente",
    userMessage: "Tu mensaje",
    invalidLong:
      "Ese mensaje es demasiado largo. Acórtalo e inténtalo de nuevo.",
    invalidMessage:
      "El chat no pudo leer ese mensaje. Escribe tu pregunta en el cuadro e inténtalo de nuevo.",
    unavailable:
      "El asistente de información no está disponible temporalmente. Inténtalo de nuevo en un momento. Si aún necesitas ayuda, llama a Autrey Mill al 678-366-3511 o escribe a info@autreymill.org.",
    sensitiveReplacement: "La información confidencial no se envió.",
    resize:
      "Cambiar el tamaño del chat. Arrastra la esquina o usa las flechas del teclado.",
    quickActions: [
      {
        label: "Horarios y entrada",
        question: "¿Cuál es el horario de Autrey Mill y cuesta algo visitarlo?",
      },
      {
        label: "Campamentos",
        question: "¿Qué campamentos de verano y de vacaciones escolares ofrece Autrey Mill?",
      },
      {
        label: "Cumpleaños y alquileres",
        question: "¿Cómo reservo una fiesta de cumpleaños o alquilo un espacio en Autrey Mill?",
      },
      {
        label: "Excursiones y scouts",
        question: "¿Qué programas para excursiones escolares y scouts ofrece Autrey Mill?",
      },
      {
        label: "Próximos eventos",
        question: "¿Qué próximos eventos tiene Autrey Mill?",
      },
      {
        label: "Voluntariado y membresía",
        question: "¿Cómo puedo ser voluntario o hacerme miembro de Autrey Mill?",
      },
    ],
  },
} as const;

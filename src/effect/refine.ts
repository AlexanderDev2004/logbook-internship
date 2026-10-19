import { Effect } from "effect";
import { AiClient, type AiError } from "./ai-service";

const SYSTEM_PROMPT = `You are an assistant that polishes daily activity descriptions for an internship log book (log book kegiatan magang).

Rules:
- Write in the SAME language as the input text (usually Indonesian).
- Keep it concise: one sentence, maximum 20 words.
- Use a consistent professional style: start with a lowercase verb, e.g. "mengembangkan ...", "memperbaiki ...", "mengimplementasikan ...".
- Keep all technical terms, project names, and numbers exactly as given.
- Do not invent activities that are not mentioned.
- Output ONLY the refined text, with no quotes, no explanation, no list markers.`;

export const refineActivity = (
  text: string,
  context?: { partnerName?: string },
): Effect.Effect<string, AiError, AiClient> =>
  Effect.gen(function* () {
    const ai = yield* AiClient;
    const userContent = [
      context?.partnerName
        ? `Context: internship at ${context.partnerName}.`
        : "",
      `Activity to refine:\n"""${text}"""`,
    ]
      .filter(Boolean)
      .join("\n\n");
    return yield* ai.chat([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ]);
  });

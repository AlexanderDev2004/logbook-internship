import { Context, Data, Effect, Layer, Schema } from "effect";

export class AiRequestError extends Data.TaggedError("AiRequestError")<{
  cause: unknown;
}> {}

export class AiBadResponse extends Data.TaggedError("AiBadResponse")<{
  status: number;
  body: string;
}> {}

export class AiEmptyResponse extends Data.TaggedError("AiEmptyResponse")<{}> {}

export type AiError = AiRequestError | AiBadResponse | AiEmptyResponse;

/** Extract the provider's own error message (e.g. FreeTierError, funds) from a body. */
function upstreamDetail(status: number, body: string): string {
  try {
    const json = JSON.parse(body) as {
      error?: { message?: string; type?: string } | string;
      message?: string;
    };
    const msg =
      (typeof json.error === "object" ? json.error?.message : json.error) ??
      json.message;
    if (msg) return `${msg} (HTTP ${status})`;
  } catch {
    // not JSON — fall through to raw body
  }
  return `HTTP ${status}: ${body.slice(0, 200)}`;
}

/** Walk Effect's FiberFailure wrappers to find the underlying tagged AI error. */
function findAiError(e: unknown, depth = 0): unknown {
  if (!e || typeof e !== "object" || depth > 6) return undefined;
  const tag = (e as { _tag?: string })._tag;
  if (tag === "AiBadResponse" || tag === "AiRequestError" || tag === "AiEmptyResponse") return e;
  const obj = e as Record<string, unknown>;
  for (const key of ["cause", "error", "defect", "failure", "previous"]) {
    if (key in obj) {
      const found = findAiError(obj[key], depth + 1);
      if (found) return found;
    }
  }
  return undefined;
}

/** Convert any AI failure into a readable error for the UI. */
export function describeAiError(e: unknown): string {
  const err = (findAiError(e) ?? e) as {
    _tag?: string; status?: number; body?: string; cause?: unknown; message?: string;
  } | undefined;
  if (err && typeof err === "object") {
    if (err._tag === "AiBadResponse" && typeof err.status === "number") {
      return upstreamDetail(err.status, err.body ?? "");
    }
    if (err._tag === "AiRequestError") {
      const cause = err.cause as { message?: string } | undefined;
      return `Tidak bisa menghubungi server AI: ${cause?.message ?? "kesalahan jaringan"}`;
    }
    if (err._tag === "AiEmptyResponse") return "AI mengembalikan respons kosong.";
  }
  const anyErr = e as { message?: string } | undefined;
  if (anyErr?.message && anyErr.message !== "An error has occurred") return anyErr.message;
  // Unknown shape — dump own properties so the real cause stays visible
  // (TanStack Start masks server-fn error details in the wire format).
  try {
    const props: Record<string, unknown> = {};
    for (const k of Object.getOwnPropertyNames(anyErr ?? {})) {
      props[k] = (anyErr as Record<string, unknown>)[k];
    }
    const dump = JSON.stringify(props);
    if (dump && dump !== "{}") return dump.slice(0, 400);
  } catch {
    // ignore
  }
  return String(e);
}

export interface AiConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export class AiConfigService extends Context.Tag("AiConfigService")<
  AiConfigService,
  AiConfig
>() {}

export class AiClient extends Context.Tag("AiClient")<AiClient, {
  chat: (messages: ChatMessage[]) => Effect.Effect<string, AiError>;
}>() {}

const CompletionResponse = Schema.Struct({
  choices: Schema.Array(
    Schema.Struct({
      message: Schema.Struct({ content: Schema.String }),
    }),
  ),
});

const decode = Schema.decodeUnknownSync(CompletionResponse);

const make = Effect.gen(function* () {
  const cfg = yield* AiConfigService;

  return AiClient.of({
    chat: (messages) =>
      Effect.gen(function* () {
        const res = yield* Effect.tryPromise({
          try: () =>
            fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                authorization: `Bearer ${cfg.apiKey}`,
              },
              body: JSON.stringify({
                model: cfg.model,
                messages,
                temperature: 0.4,
              }),
            }),
          catch: (cause) => new AiRequestError({ cause }),
        });

        if (!res.ok) {
          const body = yield* Effect.tryPromise({
            try: () => res.text(),
            catch: () => new AiRequestError({ cause: "unreadable body" }),
          });
          return yield* new AiBadResponse({ status: res.status, body });
        }

        const json = yield* Effect.tryPromise({
          try: () => res.json(),
          catch: (cause) => new AiRequestError({ cause }),
        });

        const parsed = yield* Effect.try({
          try: () => decode(json),
          catch: (cause) => new AiRequestError({ cause }),
        });

        const content = parsed.choices[0]?.message?.content?.trim();
        if (!content) return yield* new AiEmptyResponse();
        return content;
      }),
  });
});

export const AiClientLayer = (cfg: AiConfig): Layer.Layer<AiClient> =>
  Layer.effect(AiClient, make).pipe(Layer.provide(Layer.succeed(AiConfigService, cfg)));

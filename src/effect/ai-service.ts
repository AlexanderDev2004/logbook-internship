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

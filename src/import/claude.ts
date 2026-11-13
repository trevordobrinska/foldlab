// The real Claude API behind Import's `ImportClient` (import.ts): the only
// module that imports the Anthropic SDK, which is a devDependency and never
// reaches the page. Thin on purpose: what to ask, what an answer means and
// what it costs are all decided in import.ts, where they are tested with a
// stand-in for this. NOT covered by the tests (they never touch the network);
// it is checked by the compiler against the SDK's types and by Dad's first run.

import Anthropic from "@anthropic-ai/sdk";
import type { AskRequest, ImportClient, Reading, Spend } from "./import";

/** The request's body, the same for counting its tokens and for sending it. */
function bodyOf(request: AskRequest) {
  const pages: Anthropic.Beta.BetaContentBlockParam[] = request.pages.map((page) =>
    page.mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: page.data } }
      : { type: "image", source: { type: "base64", media_type: page.mediaType as "image/png" | "image/jpeg" | "image/gif" | "image/webp", data: page.data } },
  );
  return {
    model: request.model,
    system: request.instructions,
    // The Source first, the question after it.
    messages: [{ role: "user" as const, content: [...pages, { type: "text" as const, text: request.question }] }],
    thinking: { type: "adaptive" as const },
    output_config: { effort: "high" as const, format: { type: "json_schema" as const, schema: request.schema as Record<string, unknown> } },
  };
}

/** The Claude API client for one run. `apiKey` comes from the environment (import.ts), never from a file. */
export function connectClaude(apiKey: string): ImportClient {
  // A hard diagram can take many minutes of thinking; the answer is streamed, so only a silent connection times out.
  const client = new Anthropic({ apiKey, timeout: 30 * 60 * 1000 });
  return {
    async countInputTokens(request) {
      try {
        return (await client.beta.messages.countTokens(bodyOf(request))).input_tokens;
      } catch (error) {
        throw explained(error);
      }
    },

    async ask(request): Promise<Reading> {
      try {
        const message = await client.beta.messages
          // One model, one pass: no fallback. A Source Claude declines is a Failed import, and the cost cap prices one pass (import.ts).
          .stream({ ...bodyOf(request), max_tokens: request.maxTokens })
          .finalMessage();
        const { usage } = message;
        const spend: Spend = {
          model: message.model,
          input: usage.input_tokens,
          output: usage.output_tokens,
          cacheWrite: usage.cache_creation_input_tokens ?? 0,
          cacheRead: usage.cache_read_input_tokens ?? 0,
        };
        const details = message.stop_details;
        return {
          stop: message.stop_reason === "end_turn" ? "end" : (message.stop_reason ?? "unknown"),
          text: message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join(""),
          refusal: message.stop_reason === "refusal" ? [details?.category, details?.explanation].filter(Boolean).join(": ") : undefined,
          spend: [spend],
        };
      } catch (error) {
        throw explained(error);
      }
    },
  };
}

/** An SDK error as a sentence for Dad. */
function explained(error: unknown): Error {
  if (error instanceof Anthropic.AuthenticationError) return new Error("the API key in ANTHROPIC_API_KEY was not accepted (401)");
  if (error instanceof Anthropic.PermissionDeniedError) return new Error(`the API key may not do this (403): ${error.message}`);
  if (error instanceof Anthropic.BadRequestError) return new Error(`the request was rejected (400): ${error.message}`);
  if (error instanceof Anthropic.RateLimitError) return new Error("rate limited (429) after retrying; try again in a few minutes");
  if (error instanceof Anthropic.APIConnectionError) return new Error(`could not reach the Claude API: ${error.message}`);
  if (error instanceof Anthropic.APIError) return new Error(`the Claude API answered ${error.status}: ${error.message}`);
  return error instanceof Error ? error : new Error(String(error));
}

import type { XSearchParams, XSearchResponse } from "./types.js";

const DEFAULT_BASE = "https://api.x.com/2";

export class XApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "XApiError";
    this.status = status;
  }
}

/** Strip anything that looks like a bearer/token from error text before surfacing. */
export function redactSecrets(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(
      /([?&](?:access_token|token|bearer)=)[^&\s]+/gi,
      "$1[REDACTED]"
    )
    .replace(/x[-_]?bearer[-_]?token[=:]\s*\S+/gi, "X_BEARER_TOKEN=[REDACTED]");
}

export interface XClient {
  searchRecent(params: XSearchParams): Promise<XSearchResponse>;
}

export interface HttpXClientOptions {
  bearerToken: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Thin X API v2 recent-search client.
 * The bearer token is held only in memory and never returned or logged.
 */
export function createHttpXClient(options: HttpXClientOptions): XClient {
  const { bearerToken, baseUrl = DEFAULT_BASE, fetchImpl = fetch } = options;
  if (!bearerToken) {
    throw new Error(
      "X_BEARER_TOKEN is not set. Export it in the environment before starting the server."
    );
  }

  return {
    async searchRecent(params: XSearchParams): Promise<XSearchResponse> {
      const url = new URL(`${baseUrl}/tweets/search/recent`);
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === "") continue;
        url.searchParams.set(key, String(value));
      }

      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${bearerToken}`,
            Accept: "application/json",
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new XApiError(0, redactSecrets(`Network error calling X API: ${msg}`));
      }

      const rawText = await response.text();
      if (!response.ok) {
        throw new XApiError(
          response.status,
          redactSecrets(`X API error HTTP ${response.status}: ${rawText.slice(0, 500)}`)
        );
      }

      try {
        return JSON.parse(rawText) as XSearchResponse;
      } catch {
        throw new XApiError(
          response.status,
          "X API returned a non-JSON body (details omitted)"
        );
      }
    },
  };
}

export function getBearerTokenFromEnv(
  env: NodeJS.ProcessEnv = process.env
): string {
  const token = env.X_BEARER_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "X_BEARER_TOKEN environment variable is required (never pass the token as a tool argument)."
    );
  }
  return token;
}

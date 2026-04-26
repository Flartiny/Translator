export interface OpenAICompatibleConfig {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  customHeaders: Record<string, string>;
}

export interface TranslationRequest {
  systemPrompt: string;
  userPrompt: string;
}

interface OpenAICompatibleResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

const TRANSLATION_TEMPERATURE = 0;

function buildHeaders(config: OpenAICompatibleConfig): HeadersInit {
  return {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
    ...config.customHeaders,
  };
}

function buildEndpoint(apiBaseUrl: string): string {
  return `${apiBaseUrl}/chat/completions`;
}

function parseErrorMessage(payload: OpenAICompatibleResponse, fallbackMessage: string): string {
  const errorMessage = payload.error?.message?.trim();
  return errorMessage || fallbackMessage;
}

function readTranslation(payload: OpenAICompatibleResponse): string {
  const content = payload.choices?.[0]?.message?.content;
  if (!content?.trim()) {
    throw new Error("API response does not contain translated content.");
  }

  return content.trim();
}

async function parseResponsePayload(response: Response): Promise<OpenAICompatibleResponse> {
  try {
    return (await response.json()) as OpenAICompatibleResponse;
  } catch {
    throw new Error("API response is not valid JSON.");
  }
}

export async function translateWithOpenAICompatibleAPI(
  config: OpenAICompatibleConfig,
  request: TranslationRequest,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(buildEndpoint(config.apiBaseUrl), {
      method: "POST",
      headers: buildHeaders(config),
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        temperature: TRANSLATION_TEMPERATURE,
        messages: [
          { role: "system", content: request.systemPrompt },
          { role: "user", content: request.userPrompt },
        ],
      }),
    });

    const payload = await parseResponsePayload(response);
    if (!response.ok) {
      throw new Error(parseErrorMessage(payload, `API request failed with status ${response.status}.`));
    }

    return readTranslation(payload);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Request timeout after ${config.timeoutMs} ms.`);
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

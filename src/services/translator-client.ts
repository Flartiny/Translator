export interface OpenAICompatibleConfig {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  enableStreaming: boolean;
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

interface OpenAICompatibleStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string | Array<{ text?: string }>;
    };
  }>;
}

const TRANSLATION_TEMPERATURE = 0;
const EVENT_STREAM_CONTENT_TYPE = "text/event-stream";

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

function createInactivityTimer(timeoutMs: number) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const touch = () => {
    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => controller.abort(), timeoutMs);
  };

  const clear = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  touch();
  return { signal: controller.signal, touch, clear };
}

function parseStreamingDelta(dataLine: string): string {
  if (dataLine === "[DONE]") {
    return "";
  }

  const chunk = JSON.parse(dataLine) as OpenAICompatibleStreamChunk;
  const deltaContent = chunk.choices?.[0]?.delta?.content;
  if (typeof deltaContent === "string") {
    return deltaContent;
  }

  if (Array.isArray(deltaContent)) {
    return deltaContent.map((item) => item?.text ?? "").join("");
  }

  return "";
}

function consumeSSEBuffer(buffer: string): { lines: string[]; rest: string } {
  const normalized = buffer.replaceAll("\r", "");
  const parts = normalized.split("\n");
  const rest = parts.pop() ?? "";
  return { lines: parts, rest };
}

function readDataLines(lines: string[]): string[] {
  return lines
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim());
}

function parseStreamingTranslation(translatedText: string): string {
  if (!translatedText.trim()) {
    throw new Error("Streaming response does not contain translated content.");
  }

  return translatedText.trim();
}

async function parseNonStreamingResponse(response: Response): Promise<string> {
  const payload = await parseResponsePayload(response);
  if (!response.ok) {
    throw new Error(parseErrorMessage(payload, `API request failed with status ${response.status}.`));
  }

  return readTranslation(payload);
}

async function parseStreamingResponse(response: Response, touchTimeout: () => void): Promise<string> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes(EVENT_STREAM_CONTENT_TYPE)) {
    return parseNonStreamingResponse(response);
  }

  if (!response.ok) {
    const payload = await parseResponsePayload(response);
    throw new Error(parseErrorMessage(payload, `API request failed with status ${response.status}.`));
  }

  if (!response.body) {
    throw new Error("Streaming response body is empty.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let translatedText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      buffer += decoder.decode();
      break;
    }

    touchTimeout();
    buffer += decoder.decode(value, { stream: true });
    const { lines, rest } = consumeSSEBuffer(buffer);
    buffer = rest;

    for (const dataLine of readDataLines(lines)) {
      translatedText += parseStreamingDelta(dataLine);
    }
  }

  for (const dataLine of readDataLines([buffer])) {
    translatedText += parseStreamingDelta(dataLine);
  }

  return parseStreamingTranslation(translatedText);
}

function buildRequestPayload(config: OpenAICompatibleConfig, request: TranslationRequest): Record<string, unknown> {
  return {
    model: config.model,
    temperature: TRANSLATION_TEMPERATURE,
    stream: config.enableStreaming,
    messages: [
      { role: "system", content: request.systemPrompt },
      { role: "user", content: request.userPrompt },
    ],
  };
}

export async function translateWithOpenAICompatibleAPI(
  config: OpenAICompatibleConfig,
  request: TranslationRequest,
): Promise<string> {
  const timeout = createInactivityTimer(config.timeoutMs);

  try {
    const response = await fetch(buildEndpoint(config.apiBaseUrl), {
      method: "POST",
      headers: buildHeaders(config),
      signal: timeout.signal,
      body: JSON.stringify(buildRequestPayload(config, request)),
    });

    return config.enableStreaming
      ? await parseStreamingResponse(response, timeout.touch)
      : await parseNonStreamingResponse(response);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Request timeout after ${config.timeoutMs} ms.`);
    }

    throw error;
  } finally {
    timeout.clear();
  }
}

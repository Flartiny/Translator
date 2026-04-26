import { getPreferenceValues } from "@raycast/api";
import { isSupportedLanguage, SupportedLanguage } from "../types/language";

const MIN_TIMEOUT_MS = 1000;

interface RawPreferences {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: string;
  enableStreaming?: boolean;
  customHeadersJson?: string;
  defaultTargetLanguage: string;
}

export interface TranslatorPreferences {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  enableStreaming: boolean;
  customHeaders: Record<string, string>;
  defaultTargetLanguage: SupportedLanguage;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function parseTimeoutMs(timeoutMs: string): number {
  const parsedTimeout = Number(timeoutMs);
  if (!Number.isFinite(parsedTimeout) || parsedTimeout < MIN_TIMEOUT_MS) {
    throw new Error(`Timeout must be a number >= ${MIN_TIMEOUT_MS} ms.`);
  }

  return Math.floor(parsedTimeout);
}

function parseCustomHeaders(customHeadersJson?: string): Record<string, string> {
  if (!customHeadersJson?.trim()) {
    return {};
  }

  let parsedValue: unknown;
  try {
    parsedValue = JSON.parse(customHeadersJson) as unknown;
  } catch {
    throw new Error("Custom Headers JSON is invalid JSON.");
  }

  if (!parsedValue || Array.isArray(parsedValue) || typeof parsedValue !== "object") {
    throw new Error("Custom Headers JSON must be a JSON object.");
  }

  return Object.entries(parsedValue).reduce<Record<string, string>>((headers, [key, value]) => {
    headers[key] = String(value);
    return headers;
  }, {});
}

function parseDefaultTargetLanguage(value: string): SupportedLanguage {
  if (!isSupportedLanguage(value)) {
    throw new Error("Default target language must be one of zh, ja, en.");
  }

  return value;
}

function parseModel(model: string): string {
  const trimmedModel = model.trim();
  if (!trimmedModel) {
    throw new Error("Model cannot be empty.");
  }

  return trimmedModel;
}

function parseApiBaseUrl(apiBaseUrl: string): string {
  const normalizedBaseUrl = normalizeBaseUrl(apiBaseUrl.trim());
  if (!normalizedBaseUrl) {
    throw new Error("API Base URL cannot be empty.");
  }

  return normalizedBaseUrl;
}

function parseEnableStreaming(enableStreaming?: boolean): boolean {
  return Boolean(enableStreaming);
}

export function loadTranslatorPreferences(): TranslatorPreferences {
  const preferences = getPreferenceValues<RawPreferences>();
  return {
    apiBaseUrl: parseApiBaseUrl(preferences.apiBaseUrl),
    apiKey: preferences.apiKey,
    model: parseModel(preferences.model),
    timeoutMs: parseTimeoutMs(preferences.timeoutMs),
    enableStreaming: parseEnableStreaming(preferences.enableStreaming),
    customHeaders: parseCustomHeaders(preferences.customHeadersJson),
    defaultTargetLanguage: parseDefaultTargetLanguage(preferences.defaultTargetLanguage),
  };
}

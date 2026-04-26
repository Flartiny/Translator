import {
  Clipboard,
  showToast,
  Toast,
} from "@raycast/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorView, TranslationFormView, TranslationResultView } from "./components/translator-views";
import { detectLanguageFromText, inferDefaultTargetLanguage } from "./services/language";
import { buildTranslatorSystemPrompt, buildTranslatorUserPrompt } from "./services/prompt-builder";
import { loadTranslatorPreferences, TranslatorPreferences } from "./services/preferences";
import { translateWithOpenAICompatibleAPI } from "./services/translator-client";
import { isSupportedLanguage, SupportedLanguage } from "./types/language";
import { SubmitTranslationInput, TranslationResult } from "./types/translation";

interface LoadedPreferences {
  preferences: TranslatorPreferences | null;
  error: string | null;
}

export interface TranslatorCommandProps {
  prefillSource?: "none" | "clipboard";
  autoSubmitOnPrefill?: boolean;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error.";
}

function loadPreferencesOnce(): LoadedPreferences {
  try {
    return { preferences: loadTranslatorPreferences(), error: null };
  } catch (error) {
    return { preferences: null, error: getErrorMessage(error) };
  }
}

function resolveSourceLanguage(
  text: string,
  autoDetectSource: boolean,
  manualSourceLanguage: SupportedLanguage,
): SupportedLanguage {
  if (autoDetectSource) {
    return detectLanguageFromText(text);
  }

  return manualSourceLanguage;
}

function resolveTargetLanguage(
  sourceLanguage: SupportedLanguage,
  selectedTargetLanguage: SupportedLanguage,
  isTargetManuallySelected: boolean,
): SupportedLanguage {
  if (isTargetManuallySelected) {
    return selectedTargetLanguage;
  }

  return inferDefaultTargetLanguage(sourceLanguage);
}

function useAutoTargetLanguage(
  params: {
    text: string;
    autoDetectSource: boolean;
    isTargetManuallySelected: boolean;
    setTargetLanguage: (language: SupportedLanguage) => void;
  },
): void {
  const { text, autoDetectSource, isTargetManuallySelected, setTargetLanguage } = params;
  useEffect(() => {
    if (!autoDetectSource || isTargetManuallySelected || !text.trim()) {
      return;
    }

    const detectedSourceLanguage = detectLanguageFromText(text);
    setTargetLanguage(inferDefaultTargetLanguage(detectedSourceLanguage));
  }, [autoDetectSource, isTargetManuallySelected, setTargetLanguage, text]);
}

function useTranslationSubmission(preferences: TranslatorPreferences) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<TranslationResult | null>(null);

  const submit = async (input: SubmitTranslationInput) => {
    const systemPrompt = buildTranslatorSystemPrompt(input.targetLanguage);
    const userPrompt = buildTranslatorUserPrompt(input.text, input.sourceLanguage, input.targetLanguage);
    setIsSubmitting(true);

    try {
      const translatedText = await translateWithOpenAICompatibleAPI(preferences, { systemPrompt, userPrompt });
      setResult({ ...input, translatedText });
    } catch (error) {
      await showToast({ style: Toast.Style.Failure, title: "Translation failed", message: getErrorMessage(error) });
    } finally {
      setIsSubmitting(false);
    }
  };

  return { isSubmitting, result, resetResult: () => setResult(null), submit };
}

function useClipboardPrefill(params: {
  enabled: boolean;
  autoSubmitOnPrefill: boolean;
  setText: (text: string) => void;
  submitFromText: (text: string) => Promise<void>;
}) {
  const { enabled, autoSubmitOnPrefill, setText, submitFromText } = params;
  const hasPrefilledRef = useRef(false);

  useEffect(() => {
    if (!enabled || hasPrefilledRef.current) {
      return;
    }

    hasPrefilledRef.current = true;
    const run = async () => {
      const clipboardText = await Clipboard.readText();
      const trimmedText = clipboardText?.trim();
      if (!trimmedText) {
        await showToast({ style: Toast.Style.Failure, title: "Clipboard is empty." });
        return;
      }

      setText(trimmedText);
      if (autoSubmitOnPrefill) {
        await submitFromText(trimmedText);
      }
    };

    void run();
  }, [enabled, autoSubmitOnPrefill, setText, submitFromText]);
}

function useTranslatorFormState(defaultTargetLanguage: SupportedLanguage) {
  const [text, setText] = useState("");
  const [autoDetectSource, setAutoDetectSource] = useState(true);
  const [manualSourceLanguage, setManualSourceLanguage] = useState<SupportedLanguage>("zh");
  const [targetLanguage, setTargetLanguage] = useState<SupportedLanguage>(defaultTargetLanguage);
  const [isTargetManuallySelected, setIsTargetManuallySelected] = useState(false);

  return {
    text,
    setText,
    autoDetectSource,
    setAutoDetectSource,
    manualSourceLanguage,
    setManualSourceLanguage,
    targetLanguage,
    setTargetLanguage,
    isTargetManuallySelected,
    setIsTargetManuallySelected,
  };
}

function useSubmitFromText(params: {
  autoDetectSource: boolean;
  manualSourceLanguage: SupportedLanguage;
  targetLanguage: SupportedLanguage;
  isTargetManuallySelected: boolean;
  setTargetLanguage: (language: SupportedLanguage) => void;
  submit: (input: SubmitTranslationInput) => Promise<void>;
}) {
  const {
    autoDetectSource,
    manualSourceLanguage,
    targetLanguage,
    isTargetManuallySelected,
    setTargetLanguage,
    submit,
  } = params;

  return useCallback(
    async (sourceText: string) => {
      const trimmedText = sourceText.trim();
      if (!trimmedText) {
        await showToast({ style: Toast.Style.Failure, title: "Text is required." });
        return;
      }

      const sourceLanguage = resolveSourceLanguage(trimmedText, autoDetectSource, manualSourceLanguage);
      const finalTargetLanguage = resolveTargetLanguage(sourceLanguage, targetLanguage, isTargetManuallySelected);
      setTargetLanguage(finalTargetLanguage);
      await submit({ text: trimmedText, sourceLanguage, targetLanguage: finalTargetLanguage });
    },
    [autoDetectSource, isTargetManuallySelected, manualSourceLanguage, setTargetLanguage, submit, targetLanguage],
  );
}

function useLanguageFieldHandlers(params: {
  setTargetLanguage: (language: SupportedLanguage) => void;
  setIsTargetManuallySelected: (selected: boolean) => void;
  setManualSourceLanguage: (language: SupportedLanguage) => void;
}) {
  const { setTargetLanguage, setIsTargetManuallySelected, setManualSourceLanguage } = params;

  const handleTargetLanguageChange = useCallback(
    (value: string) => {
      if (isSupportedLanguage(value)) {
        setTargetLanguage(value);
        setIsTargetManuallySelected(true);
      }
    },
    [setIsTargetManuallySelected, setTargetLanguage],
  );

  const handleManualSourceLanguageChange = useCallback(
    (value: string) => {
      if (isSupportedLanguage(value)) {
        setManualSourceLanguage(value);
      }
    },
    [setManualSourceLanguage],
  );

  return { handleTargetLanguageChange, handleManualSourceLanguageChange };
}

function useTranslatorController(params: {
  preferences: TranslatorPreferences;
  prefillSource: "none" | "clipboard";
  autoSubmitOnPrefill: boolean;
}) {
  const { preferences, prefillSource, autoSubmitOnPrefill } = params;
  const state = useTranslatorFormState(preferences.defaultTargetLanguage);
  const { isSubmitting, result, resetResult, submit } = useTranslationSubmission(preferences);

  useAutoTargetLanguage({
    text: state.text,
    autoDetectSource: state.autoDetectSource,
    isTargetManuallySelected: state.isTargetManuallySelected,
    setTargetLanguage: state.setTargetLanguage,
  });

  const submitFromText = useSubmitFromText({
    autoDetectSource: state.autoDetectSource,
    manualSourceLanguage: state.manualSourceLanguage,
    targetLanguage: state.targetLanguage,
    isTargetManuallySelected: state.isTargetManuallySelected,
    setTargetLanguage: state.setTargetLanguage,
    submit,
  });
  useClipboardPrefill({ enabled: prefillSource === "clipboard", autoSubmitOnPrefill, setText: state.setText, submitFromText });
  const handleSubmit = useCallback(async () => submitFromText(state.text), [state.text, submitFromText]);
  const handlers = useLanguageFieldHandlers({
    setTargetLanguage: state.setTargetLanguage,
    setIsTargetManuallySelected: state.setIsTargetManuallySelected,
    setManualSourceLanguage: state.setManualSourceLanguage,
  });

  return { state, handlers, isSubmitting, result, resetResult, handleSubmit };
}

function TranslatorCommandInner(props: {
  preferences: TranslatorPreferences;
  prefillSource: "none" | "clipboard";
  autoSubmitOnPrefill: boolean;
}) {
  const { state, handlers, isSubmitting, result, resetResult, handleSubmit } = useTranslatorController(props);

  if (result) {
    return <TranslationResultView result={result} onBack={resetResult} />;
  }

  return (
    <TranslationFormView
      text={state.text}
      targetLanguage={state.targetLanguage}
      autoDetectSource={state.autoDetectSource}
      manualSourceLanguage={state.manualSourceLanguage}
      isSubmitting={isSubmitting}
      onTextChange={state.setText}
      onTargetLanguageChange={handlers.handleTargetLanguageChange}
      onAutoDetectSourceChange={state.setAutoDetectSource}
      onManualSourceLanguageChange={handlers.handleManualSourceLanguageChange}
      onSubmit={handleSubmit}
    />
  );
}

export default function TranslatorCommand(props: TranslatorCommandProps) {
  const prefillSource = props.prefillSource ?? "none";
  const autoSubmitOnPrefill = props.autoSubmitOnPrefill ?? false;
  const loadedPreferences = useMemo(loadPreferencesOnce, []);
  if (loadedPreferences.error || !loadedPreferences.preferences) {
    return <ErrorView message={loadedPreferences.error ?? "Failed to load preferences."} />;
  }

  return (
    <TranslatorCommandInner
      preferences={loadedPreferences.preferences}
      prefillSource={prefillSource}
      autoSubmitOnPrefill={autoSubmitOnPrefill}
    />
  );
}

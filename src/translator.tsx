import {
  Action,
  ActionPanel,
  Detail,
  Form,
  Icon,
  showToast,
  Toast,
} from "@raycast/api";
import { useEffect, useMemo, useState } from "react";
import { detectLanguageFromText, inferDefaultTargetLanguage } from "./services/language";
import { buildTranslatorSystemPrompt, buildTranslatorUserPrompt } from "./services/prompt-builder";
import { loadTranslatorPreferences, TranslatorPreferences } from "./services/preferences";
import { translateWithOpenAICompatibleAPI } from "./services/translator-client";
import { getLanguageLabel, isSupportedLanguage, LANGUAGE_OPTIONS, SupportedLanguage } from "./types/language";

interface TranslationResult {
  sourceLanguage: SupportedLanguage;
  targetLanguage: SupportedLanguage;
  translatedText: string;
}

interface LoadedPreferences {
  preferences: TranslatorPreferences | null;
  error: string | null;
}

interface SubmitTranslationInput {
  text: string;
  sourceLanguage: SupportedLanguage;
  targetLanguage: SupportedLanguage;
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

function ErrorView(props: { message: string }) {
  return <Detail markdown={`Configuration error:\n\n${props.message}`} />;
}

function TranslationResultView(props: { result: TranslationResult; onBack: () => void }) {
  const { result, onBack } = props;
  return (
    <Detail
      markdown={result.translatedText}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Source" text={getLanguageLabel(result.sourceLanguage)} />
          <Detail.Metadata.Label title="Target" text={getLanguageLabel(result.targetLanguage)} />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy Translation" content={result.translatedText} />
          <Action title="Translate New Text" icon={Icon.ArrowLeft} onAction={onBack} />
        </ActionPanel>
      }
    />
  );
}

interface TranslationFormViewProps {
  text: string;
  targetLanguage: SupportedLanguage;
  autoDetectSource: boolean;
  manualSourceLanguage: SupportedLanguage;
  isSubmitting: boolean;
  onTextChange: (text: string) => void;
  onTargetLanguageChange: (value: string) => void;
  onAutoDetectSourceChange: (value: boolean) => void;
  onManualSourceLanguageChange: (value: string) => void;
  onSubmit: () => void;
}

function ManualSourceLanguageField(props: {
  autoDetectSource: boolean;
  manualSourceLanguage: SupportedLanguage;
  onManualSourceLanguageChange: (value: string) => void;
}) {
  if (props.autoDetectSource) {
    return null;
  }

  return (
    <Form.Dropdown
      id="manualSourceLanguage"
      title="Source Language"
      value={props.manualSourceLanguage}
      onChange={props.onManualSourceLanguageChange}
    >
      {LANGUAGE_OPTIONS.map((language) => (
        <Form.Dropdown.Item key={language.value} title={language.title} value={language.value} />
      ))}
    </Form.Dropdown>
  );
}

function TranslationFormView(props: TranslationFormViewProps) {
  const {
    text,
    targetLanguage,
    autoDetectSource,
    manualSourceLanguage,
    isSubmitting,
    onTextChange,
    onTargetLanguageChange,
    onAutoDetectSourceChange,
    onManualSourceLanguageChange,
    onSubmit,
  } = props;

  return (
    <Form
      isLoading={isSubmitting}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Translate" onSubmit={onSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextArea id="text" title="Text" value={text} onChange={onTextChange} placeholder="Enter text to translate" />
      <Form.Dropdown id="targetLanguage" title="Target Language" value={targetLanguage} onChange={onTargetLanguageChange}>
        {LANGUAGE_OPTIONS.map((language) => (
          <Form.Dropdown.Item key={language.value} title={language.title} value={language.value} />
        ))}
      </Form.Dropdown>
      <Form.Checkbox
        id="autoDetectSource"
        title="Auto Detect Source Language"
        label="Enabled"
        value={autoDetectSource}
        onChange={onAutoDetectSourceChange}
      />
      <ManualSourceLanguageField
        autoDetectSource={autoDetectSource}
        manualSourceLanguage={manualSourceLanguage}
        onManualSourceLanguageChange={onManualSourceLanguageChange}
      />
    </Form>
  );
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

function TranslatorCommand(props: { preferences: TranslatorPreferences }) {
  const { preferences } = props;
  const [text, setText] = useState("");
  const [autoDetectSource, setAutoDetectSource] = useState(true);
  const [manualSourceLanguage, setManualSourceLanguage] = useState<SupportedLanguage>("zh");
  const [targetLanguage, setTargetLanguage] = useState<SupportedLanguage>(preferences.defaultTargetLanguage);
  const [isTargetManuallySelected, setIsTargetManuallySelected] = useState(false);
  const { isSubmitting, result, resetResult, submit } = useTranslationSubmission(preferences);

  useAutoTargetLanguage({ text, autoDetectSource, isTargetManuallySelected, setTargetLanguage });

  const handleTargetLanguageChange = (value: string) => {
    if (isSupportedLanguage(value)) {
      setTargetLanguage(value);
      setIsTargetManuallySelected(true);
    }
  };

  const handleManualSourceLanguageChange = (value: string) => {
    if (isSupportedLanguage(value)) {
      setManualSourceLanguage(value);
    }
  };

  const handleSubmit = async () => {
    const trimmedText = text.trim();
    if (!trimmedText) {
      await showToast({ style: Toast.Style.Failure, title: "Text is required." });
      return;
    }

    const sourceLanguage = resolveSourceLanguage(trimmedText, autoDetectSource, manualSourceLanguage);
    const finalTargetLanguage = resolveTargetLanguage(sourceLanguage, targetLanguage, isTargetManuallySelected);
    setTargetLanguage(finalTargetLanguage);
    await submit({ text: trimmedText, sourceLanguage, targetLanguage: finalTargetLanguage });
  };

  if (result) {
    return <TranslationResultView result={result} onBack={resetResult} />;
  }

  return (
    <TranslationFormView
      text={text}
      targetLanguage={targetLanguage}
      autoDetectSource={autoDetectSource}
      manualSourceLanguage={manualSourceLanguage}
      isSubmitting={isSubmitting}
      onTextChange={setText}
      onTargetLanguageChange={handleTargetLanguageChange}
      onAutoDetectSourceChange={setAutoDetectSource}
      onManualSourceLanguageChange={handleManualSourceLanguageChange}
      onSubmit={handleSubmit}
    />
  );
}

export default function Command() {
  const loadedPreferences = useMemo(loadPreferencesOnce, []);
  if (loadedPreferences.error || !loadedPreferences.preferences) {
    return <ErrorView message={loadedPreferences.error ?? "Failed to load preferences."} />;
  }

  return <TranslatorCommand preferences={loadedPreferences.preferences} />;
}

import { Action, ActionPanel, Detail, Form, Icon } from "@raycast/api";
import { LANGUAGE_OPTIONS, SupportedLanguage, getLanguageLabel } from "../types/language";
import { TranslationResult } from "../types/translation";

export function ErrorView(props: { message: string }) {
  return <Detail markdown={`Configuration error:\n\n${props.message}`} />;
}

export function TranslationResultView(props: { result: TranslationResult; onBack: () => void }) {
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

export function TranslationFormView(props: TranslationFormViewProps) {
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

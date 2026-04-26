import {
  Action,
  ActionPanel,
  Form,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { ProfileDraft } from "../services/profile-store";
import { getErrorMessage } from "../services/error-utils";

export function ProfileEditorForm(props: {
  title: string;
  initialDraft: ProfileDraft;
  onSubmit: (draft: ProfileDraft) => Promise<void>;
}) {
  const { pop } = useNavigation();

  const handleSubmit = async (values: ProfileDraft) => {
    try {
      await props.onSubmit(values);
      await showToast({ style: Toast.Style.Success, title: "Profile saved." });
      pop();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Save failed",
        message: getErrorMessage(error),
      });
    }
  };

  return (
    <Form
      navigationTitle={props.title}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Profile" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="name"
        title="Profile Name"
        defaultValue={props.initialDraft.name}
      />
      <Form.TextField
        id="baseUrl"
        title="API Base URL"
        defaultValue={props.initialDraft.baseUrl}
      />
      <Form.PasswordField
        id="apiKey"
        title="API Key"
        defaultValue={props.initialDraft.apiKey}
      />
      <Form.TextField
        id="model"
        title="Model"
        defaultValue={props.initialDraft.model}
      />
      <Form.TextField
        id="timeoutMs"
        title="Request Timeout (ms)"
        defaultValue={props.initialDraft.timeoutMs}
      />
      <Form.Checkbox
        id="enableStreaming"
        title="Enable Streaming"
        label="Enabled"
        defaultValue={props.initialDraft.enableStreaming}
      />
      <Form.TextArea
        id="customHeadersJson"
        title="Custom Headers JSON"
        defaultValue={props.initialDraft.customHeadersJson}
      />
      <Form.Checkbox
        id="enabled"
        title="Profile Enabled"
        label="Enabled"
        defaultValue={props.initialDraft.enabled}
      />
    </Form>
  );
}

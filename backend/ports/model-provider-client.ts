import type { ChatMessageRole } from "@/backend/domain/chat";
import type { ModelProviderId } from "@/shared/model-providers";

export interface ModelProviderChatMessage {
  role: ChatMessageRole;
  content: string;
}

export interface GenerateTextInput {
  modelProvider: ModelProviderId;
  messages: ModelProviderChatMessage[];
}

export interface GenerateTextResult {
  text: string;
  modelProvider: ModelProviderId;
  model: string;
}

export interface ModelProviderClient {
  generateText(input: GenerateTextInput): Promise<GenerateTextResult>;
  isProviderConfigured(provider: ModelProviderId): boolean;
}

export class ModelProviderConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelProviderConfigurationError";
  }
}

export class ModelProviderRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelProviderRequestError";
  }
}

import type { ChatMessageRole } from "@/backend/domain/chat";
import type { ModelProviderId } from "@/shared/model-providers";

export interface ModelProviderChatMessage {
  role: ChatMessageRole;
  content: string;
}

export interface GenerateTextInput {
  modelProvider: ModelProviderId;
  model?: string;
  messages: ModelProviderChatMessage[];
}

export interface GenerateTextResult {
  text: string;
  modelProvider: ModelProviderId;
  model: string;
}

export interface GenerateTextStreamResult {
  modelProvider: ModelProviderId;
  model: string;
  chunks: AsyncIterable<string>;
}

export interface ModelProviderClient {
  generateText(input: GenerateTextInput): Promise<GenerateTextResult>;
  generateTextStream(input: GenerateTextInput): Promise<GenerateTextStreamResult>;
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

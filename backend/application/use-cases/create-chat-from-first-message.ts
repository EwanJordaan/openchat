import {
  UnauthorizedError,
  UpstreamServiceError,
  ValidationError,
} from "@/backend/application/errors";
import type { Principal } from "@/backend/domain/principal";
import {
  ModelProviderConfigurationError,
  ModelProviderRequestError,
  type ModelProviderClient,
} from "@/backend/ports/model-provider-client";
import type { UnitOfWork } from "@/backend/ports/unit-of-work";
import type { ModelProviderId } from "@/shared/model-providers";

export interface CreateChatFromFirstMessageInput {
  message: string;
  modelProvider: ModelProviderId;
  model?: string;
}

export class CreateChatFromFirstMessageUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly modelProviderClient: ModelProviderClient,
  ) {}

  async execute(principal: Principal, input: CreateChatFromFirstMessageInput) {
    if (!principal.userId) {
      throw new UnauthorizedError("Authenticated principal is not linked to a user");
    }

    const message = input.message.trim();
    if (message.length < 1 || message.length > 8000) {
      throw new ValidationError("Message must be between 1 and 8000 characters");
    }

    let assistantMessage: string;
    try {
      const generation = await this.modelProviderClient.generateText({
        modelProvider: input.modelProvider,
        model: input.model,
        messages: [
          {
            role: "user",
            content: message,
          },
        ],
      });

      assistantMessage = generation.text;
    } catch (error) {
      if (error instanceof ModelProviderConfigurationError) {
        throw new ValidationError(error.message);
      }

      if (error instanceof ModelProviderRequestError) {
        throw new UpstreamServiceError(error.message);
      }

      throw error;
    }

    return this.unitOfWork.run(async ({ chats }) => {
      return chats.createWithInitialMessages({
        chatId: crypto.randomUUID(),
        ownerUserId: principal.userId as string,
        title: buildChatTitleFromMessage(message),
        userMessageId: crypto.randomUUID(),
        userMessageContent: message,
        assistantMessageId: crypto.randomUUID(),
        assistantMessageContent: assistantMessage,
      });
    });
  }
}

function buildChatTitleFromMessage(message: string): string {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (normalized.length <= 64) {
    return normalized;
  }

  return `${normalized.slice(0, 61).trimEnd()}...`;
}

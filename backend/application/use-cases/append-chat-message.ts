import {
  NotFoundError,
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

export interface AppendChatMessageInput {
  chatId: string;
  message: string;
  modelProvider: ModelProviderId;
  model?: string;
}

export class AppendChatMessageUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly modelProviderClient: ModelProviderClient,
  ) {}

  async execute(principal: Principal, input: AppendChatMessageInput) {
    if (!principal.userId) {
      throw new UnauthorizedError("Authenticated principal is not linked to a user");
    }

    const message = input.message.trim();
    if (message.length < 1 || message.length > 8000) {
      throw new ValidationError("Message must be between 1 and 8000 characters");
    }

    const existingChat = await this.unitOfWork.run(async ({ chats }) => {
      return chats.getByIdForUser(input.chatId, principal.userId as string);
    });

    if (!existingChat) {
      throw new NotFoundError("Chat not found");
    }

    let assistantMessage: string;
    try {
      const generation = await this.modelProviderClient.generateText({
        modelProvider: input.modelProvider,
        model: input.model,
        messages: [
          ...existingChat.messages.map((existingMessage) => ({
            role: existingMessage.role,
            content: existingMessage.content,
          })),
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

    const updatedChat = await this.unitOfWork.run(async ({ chats }) => {
      return chats.appendMessages({
        chatId: input.chatId,
        ownerUserId: principal.userId as string,
        userMessageId: crypto.randomUUID(),
        userMessageContent: message,
        assistantMessageId: crypto.randomUUID(),
        assistantMessageContent: assistantMessage,
      });
    });

    if (!updatedChat) {
      throw new NotFoundError("Chat not found");
    }

    return updatedChat;
  }
}

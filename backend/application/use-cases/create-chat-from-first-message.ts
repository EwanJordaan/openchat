import { UnauthorizedError, ValidationError } from "@/backend/application/errors";
import type { Principal } from "@/backend/domain/principal";
import type { UnitOfWork } from "@/backend/ports/unit-of-work";
import type { ModelProviderId } from "@/shared/model-providers";

import { buildTemporaryAssistantResponse } from "@/shared/temporary-assistant-response";

export interface CreateChatFromFirstMessageInput {
  message: string;
  modelProvider: ModelProviderId;
}

export class CreateChatFromFirstMessageUseCase {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  async execute(principal: Principal, input: CreateChatFromFirstMessageInput) {
    if (!principal.userId) {
      throw new UnauthorizedError("Authenticated principal is not linked to a user");
    }

    const message = input.message.trim();
    if (message.length < 1 || message.length > 8000) {
      throw new ValidationError("Message must be between 1 and 8000 characters");
    }

    const assistantMessage = buildTemporaryAssistantResponse(message, input.modelProvider);

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

import { NotFoundError, UnauthorizedError, ValidationError } from "@/backend/application/errors";
import type { Principal } from "@/backend/domain/principal";
import type { UnitOfWork } from "@/backend/ports/unit-of-work";

import { buildTemporaryAssistantResponse } from "@/shared/temporary-assistant-response";

export interface AppendChatMessageInput {
  chatId: string;
  message: string;
}

export class AppendChatMessageUseCase {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  async execute(principal: Principal, input: AppendChatMessageInput) {
    if (!principal.userId) {
      throw new UnauthorizedError("Authenticated principal is not linked to a user");
    }

    const message = input.message.trim();
    if (message.length < 1 || message.length > 8000) {
      throw new ValidationError("Message must be between 1 and 8000 characters");
    }

    const assistantMessage = buildTemporaryAssistantResponse(message);

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

import { NotFoundError, UnauthorizedError } from "@/backend/application/errors";
import type { Principal } from "@/backend/domain/principal";
import type { ChatRepository } from "@/backend/ports/repositories";

export interface DeleteChatMessageInput {
  chatId: string;
  messageId: string;
}

export class DeleteChatMessageUseCase {
  constructor(private readonly chats: ChatRepository) {}

  async execute(principal: Principal, input: DeleteChatMessageInput) {
    if (!principal.userId) {
      throw new UnauthorizedError("Authenticated principal is not linked to a user");
    }

    const updated = await this.chats.deleteMessage({
      chatId: input.chatId,
      ownerUserId: principal.userId,
      messageId: input.messageId,
    });

    if (!updated) {
      throw new NotFoundError("Chat message not found");
    }

    return updated;
  }
}

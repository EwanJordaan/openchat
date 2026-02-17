import { NotFoundError, UnauthorizedError } from "@/backend/application/errors";
import type { Principal } from "@/backend/domain/principal";
import type { ChatRepository } from "@/backend/ports/repositories";

export class GetChatByIdUseCase {
  constructor(private readonly chats: ChatRepository) {}

  async execute(principal: Principal, chatId: string) {
    if (!principal.userId) {
      throw new UnauthorizedError("Authenticated principal is not linked to a user");
    }

    const chat = await this.chats.getByIdForUser(chatId, principal.userId);
    if (!chat) {
      throw new NotFoundError("Chat not found");
    }

    return chat;
  }
}

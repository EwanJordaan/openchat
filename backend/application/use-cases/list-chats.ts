import { UnauthorizedError } from "@/backend/application/errors";
import type { Principal } from "@/backend/domain/principal";
import type { ChatRepository, ListChatsForUserInput } from "@/backend/ports/repositories";

export class ListChatsUseCase {
  constructor(private readonly chats: ChatRepository) {}

  async execute(principal: Principal, input?: ListChatsForUserInput) {
    if (!principal.userId) {
      throw new UnauthorizedError("Authenticated principal is not linked to a user");
    }

    return this.chats.listForUser(principal.userId, input);
  }
}

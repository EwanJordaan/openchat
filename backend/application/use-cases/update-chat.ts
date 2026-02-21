import { NotFoundError, UnauthorizedError, ValidationError } from "@/backend/application/errors";
import type { Principal } from "@/backend/domain/principal";
import type { ChatRepository } from "@/backend/ports/repositories";

export interface UpdateChatInput {
  chatId: string;
  title?: string;
  isPinned?: boolean;
  isArchived?: boolean;
}

export class UpdateChatUseCase {
  constructor(private readonly chats: ChatRepository) {}

  async execute(principal: Principal, input: UpdateChatInput) {
    if (!principal.userId) {
      throw new UnauthorizedError("Authenticated principal is not linked to a user");
    }

    if (
      input.title === undefined &&
      input.isPinned === undefined &&
      input.isArchived === undefined
    ) {
      throw new ValidationError("At least one chat field must be provided");
    }

    let nextTitle: string | undefined;
    if (input.title !== undefined) {
      const trimmed = input.title.trim();
      if (trimmed.length < 1 || trimmed.length > 120) {
        throw new ValidationError("Chat title must be between 1 and 120 characters");
      }

      nextTitle = trimmed;
    }

    const nextIsArchived = input.isArchived;
    const nextIsPinned =
      nextIsArchived === true
        ? false
        : input.isPinned;

    const updated = await this.chats.updateMetadata({
      chatId: input.chatId,
      ownerUserId: principal.userId,
      title: nextTitle,
      isPinned: nextIsPinned,
      isArchived: nextIsArchived,
    });

    if (!updated) {
      throw new NotFoundError("Chat not found");
    }

    return updated;
  }
}

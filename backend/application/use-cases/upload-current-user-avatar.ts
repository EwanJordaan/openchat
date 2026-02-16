import { UnauthorizedError, ValidationError } from "@/backend/application/errors";
import type { Principal } from "@/backend/domain/principal";
import type { User } from "@/backend/domain/user";
import type { UserRepository } from "@/backend/ports/repositories";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_AVATAR_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export interface UploadCurrentUserAvatarInput {
  mimeType: string;
  bytes: Uint8Array;
}

export class UploadCurrentUserAvatarUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(principal: Principal, input: UploadCurrentUserAvatarInput): Promise<User> {
    if (!principal.userId) {
      throw new UnauthorizedError("Authenticated principal is not linked to a user");
    }

    const mimeType = input.mimeType.trim().toLowerCase();
    if (!ALLOWED_AVATAR_MIME_TYPES.has(mimeType)) {
      throw new ValidationError("Avatar format must be PNG, JPEG, WEBP, or GIF");
    }

    if (input.bytes.byteLength === 0) {
      throw new ValidationError("Avatar file is empty");
    }

    if (input.bytes.byteLength > MAX_AVATAR_BYTES) {
      throw new ValidationError("Avatar file must be 2MB or smaller");
    }

    return this.users.setAvatar(principal.userId, {
      mimeType,
      bytes: input.bytes,
    });
  }
}

import type { QueryResultRow } from "pg";

import type { Chat, ChatMessage, ChatWithMessages } from "@/backend/domain/chat";
import type {
  AppendChatMessagesInput,
  ChatRepository,
  CreateChatWithMessagesInput,
  DeleteChatMessageInput,
  ListChatsForUserInput,
  UpdateChatMetadataInput,
} from "@/backend/ports/repositories";

import { toIsoString } from "@/backend/adapters/db/postgres/mappers";
import type { PgQueryable } from "@/backend/adapters/db/postgres/types";

interface ChatRow extends QueryResultRow {
  id: string;
  owner_user_id: string;
  title: string;
  is_pinned: boolean;
  is_archived: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ChatMessageRow extends QueryResultRow {
  id: string;
  chat_id: string;
  role: "assistant" | "user" | "system";
  content: string;
  created_at: Date | string;
}

export class PostgresChatRepository implements ChatRepository {
  constructor(private readonly db: PgQueryable) {}

  async listForUser(userId: string, input?: ListChatsForUserInput): Promise<Chat[]> {
    const includeArchived = input?.includeArchived ?? true;
    const query = input?.query?.trim() || null;
    const limit = normalizeListLimit(input?.limit);

    const result = await this.db.query<ChatRow>(
      `
      SELECT id, owner_user_id, title, is_pinned, is_archived, created_at, updated_at
      FROM chats c
      WHERE c.owner_user_id = $1
        AND ($2::boolean OR c.is_archived = FALSE)
        AND (
          $3::text IS NULL
          OR c.title ILIKE '%' || $3 || '%'
          OR EXISTS (
            SELECT 1
            FROM chat_messages m
            WHERE m.chat_id = c.id
              AND m.content ILIKE '%' || $3 || '%'
          )
        )
      ORDER BY c.is_pinned DESC, c.updated_at DESC
      LIMIT $4
      `,
      [userId, includeArchived, query, limit],
    );

    return result.rows.map((row) => this.mapChat(row));
  }

  async getByIdForUser(chatId: string, userId: string): Promise<ChatWithMessages | null> {
    const chatResult = await this.db.query<ChatRow>(
      `
      SELECT id, owner_user_id, title, is_pinned, is_archived, created_at, updated_at
      FROM chats
      WHERE id = $1 AND owner_user_id = $2
      `,
      [chatId, userId],
    );

    if (chatResult.rows.length === 0) {
      return null;
    }

    const chat = this.mapChat(chatResult.rows[0]);
    const messages = await this.listMessages(chat.id);

    return {
      chat,
      messages,
    };
  }

  async createWithInitialMessages(input: CreateChatWithMessagesInput): Promise<ChatWithMessages> {
    await this.db.query(
      `
      INSERT INTO chats (id, owner_user_id, title, is_pinned, is_archived)
      VALUES ($1, $2, $3, FALSE, FALSE)
      `,
      [input.chatId, input.ownerUserId, input.title],
    );

    await this.db.query(
      `
      INSERT INTO chat_messages (id, chat_id, role, content)
      VALUES
        ($1, $2, 'user', $3),
        ($4, $2, 'assistant', $5)
      `,
      [
        input.userMessageId,
        input.chatId,
        input.userMessageContent,
        input.assistantMessageId,
        input.assistantMessageContent,
      ],
    );

    await this.db.query(
      `
      UPDATE chats
      SET updated_at = NOW()
      WHERE id = $1
      `,
      [input.chatId],
    );

    const chat = await this.getByIdForUser(input.chatId, input.ownerUserId);
    if (!chat) {
      throw new Error(`Created chat could not be reloaded: ${input.chatId}`);
    }

    return chat;
  }

  async appendMessages(input: AppendChatMessagesInput): Promise<ChatWithMessages | null> {
    const ownershipResult = await this.db.query<{ id: string }>(
      `
      SELECT id
      FROM chats
      WHERE id = $1 AND owner_user_id = $2
      `,
      [input.chatId, input.ownerUserId],
    );

    if (ownershipResult.rows.length === 0) {
      return null;
    }

    await this.db.query(
      `
      INSERT INTO chat_messages (id, chat_id, role, content)
      VALUES
        ($1, $2, 'user', $3),
        ($4, $2, 'assistant', $5)
      `,
      [
        input.userMessageId,
        input.chatId,
        input.userMessageContent,
        input.assistantMessageId,
        input.assistantMessageContent,
      ],
    );

    await this.db.query(
      `
      UPDATE chats
      SET updated_at = NOW()
      WHERE id = $1
      `,
      [input.chatId],
    );

    return this.getByIdForUser(input.chatId, input.ownerUserId);
  }

  async updateMetadata(input: UpdateChatMetadataInput): Promise<Chat | null> {
    const existingResult = await this.db.query<ChatRow>(
      `
      SELECT id, owner_user_id, title, is_pinned, is_archived, created_at, updated_at
      FROM chats
      WHERE id = $1 AND owner_user_id = $2
      `,
      [input.chatId, input.ownerUserId],
    );

    const existing = existingResult.rows[0];
    if (!existing) {
      return null;
    }

    const nextTitle = input.title ?? existing.title;
    const nextIsPinned = input.isPinned ?? existing.is_pinned;
    const nextIsArchived = input.isArchived ?? existing.is_archived;

    const updatedResult = await this.db.query<ChatRow>(
      `
      UPDATE chats
      SET
        title = $3,
        is_pinned = $4,
        is_archived = $5,
        updated_at = NOW()
      WHERE id = $1 AND owner_user_id = $2
      RETURNING id, owner_user_id, title, is_pinned, is_archived, created_at, updated_at
      `,
      [input.chatId, input.ownerUserId, nextTitle, nextIsPinned, nextIsArchived],
    );

    const updatedRow = updatedResult.rows[0];
    if (!updatedRow) {
      return null;
    }

    return this.mapChat(updatedRow);
  }

  async deleteMessage(input: DeleteChatMessageInput): Promise<ChatWithMessages | null> {
    const ownershipResult = await this.db.query<{ id: string }>(
      `
      SELECT id
      FROM chats
      WHERE id = $1 AND owner_user_id = $2
      `,
      [input.chatId, input.ownerUserId],
    );

    if (ownershipResult.rows.length === 0) {
      return null;
    }

    const deleteResult = await this.db.query<{ id: string }>(
      `
      DELETE FROM chat_messages
      WHERE id = $1 AND chat_id = $2
      RETURNING id
      `,
      [input.messageId, input.chatId],
    );

    if (deleteResult.rows.length === 0) {
      return null;
    }

    await this.db.query(
      `
      UPDATE chats
      SET updated_at = NOW()
      WHERE id = $1
      `,
      [input.chatId],
    );

    return this.getByIdForUser(input.chatId, input.ownerUserId);
  }

  private async listMessages(chatId: string): Promise<ChatMessage[]> {
    const messagesResult = await this.db.query<ChatMessageRow>(
      `
      SELECT id, chat_id, role, content, created_at
      FROM chat_messages
      WHERE chat_id = $1
      ORDER BY
        created_at ASC,
        CASE role
          WHEN 'user' THEN 0
          WHEN 'assistant' THEN 1
          ELSE 2
        END ASC,
        id ASC
      `,
      [chatId],
    );

    return messagesResult.rows.map((row) => this.mapMessage(row));
  }

  private mapChat(row: ChatRow): Chat {
    return {
      id: row.id,
      ownerUserId: row.owner_user_id,
      title: row.title,
      isPinned: row.is_pinned,
      isArchived: row.is_archived,
      createdAt: toIsoString(row.created_at),
      updatedAt: toIsoString(row.updated_at),
    };
  }

  private mapMessage(row: ChatMessageRow): ChatMessage {
    return {
      id: row.id,
      chatId: row.chat_id,
      role: row.role,
      content: row.content,
      createdAt: toIsoString(row.created_at),
    };
  }
}

function normalizeListLimit(rawLimit: number | undefined): number {
  if (typeof rawLimit !== "number" || !Number.isFinite(rawLimit)) {
    return 200;
  }

  return Math.max(1, Math.min(500, Math.floor(rawLimit)));
}

import type { QueryResultRow } from "pg";

import type { Chat, ChatMessage, ChatWithMessages } from "@/backend/domain/chat";
import type {
  AppendChatMessagesInput,
  ChatRepository,
  CreateChatWithMessagesInput,
} from "@/backend/ports/repositories";

import { toIsoString } from "@/backend/adapters/db/postgres/mappers";
import type { PgQueryable } from "@/backend/adapters/db/postgres/types";

interface ChatRow extends QueryResultRow {
  id: string;
  owner_user_id: string;
  title: string;
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

  async listForUser(userId: string): Promise<Chat[]> {
    const result = await this.db.query<ChatRow>(
      `
      SELECT id, owner_user_id, title, created_at, updated_at
      FROM chats
      WHERE owner_user_id = $1
      ORDER BY updated_at DESC
      `,
      [userId],
    );

    return result.rows.map((row) => this.mapChat(row));
  }

  async getByIdForUser(chatId: string, userId: string): Promise<ChatWithMessages | null> {
    const chatResult = await this.db.query<ChatRow>(
      `
      SELECT id, owner_user_id, title, created_at, updated_at
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
      INSERT INTO chats (id, owner_user_id, title)
      VALUES ($1, $2, $3)
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

export type ChatMessageRole = "assistant" | "user" | "system";

export interface Chat {
  id: string;
  ownerUserId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  role: ChatMessageRole;
  content: string;
  createdAt: string;
}

export interface ChatWithMessages {
  chat: Chat;
  messages: ChatMessage[];
}

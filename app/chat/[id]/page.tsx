import { Suspense } from "react";

import { ChatWorkspace } from "@/components/chat/chat-workspace";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <ChatWorkspace initialChatId={id} />
    </Suspense>
  );
}

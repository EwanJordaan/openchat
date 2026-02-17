export function buildTemporaryAssistantResponse(userMessage: string): string {
  return `Temporary response: I can help with this request. Next, wire this to your backend so replies come from the model.\n\nYou said: "${userMessage}"`;
}

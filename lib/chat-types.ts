export type ChatMessageRole =
  | "user"
  | "assistant";

export interface ChatMessageInput {
  role: ChatMessageRole;
  content: string;
}
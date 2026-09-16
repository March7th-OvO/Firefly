export type MessageRole = "user" | "assistant";

export type MessageStatus = "pending" | "streaming" | "done" | "error";

export interface ChatMessage {
	id: string;
	role: MessageRole;
	content: string;
	status: MessageStatus;
	createdAt: number;
	metadata?: Record<string, unknown>;
}

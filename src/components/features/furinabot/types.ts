export type MessageRole = "user" | "assistant";

export type MessageStatus = "pending" | "streaming" | "done" | "error";

export interface ArticleSource {
	id: string;
	articleId?: string;
	title: string;
	url: string;
	heading?: string;
}

export interface ChatMessage {
	id: string;
	role: MessageRole;
	content: string;
	status: MessageStatus;
	createdAt: number;
	metadata?: Record<string, unknown>;
	retrievalCount?: number | null;
	sources?: ArticleSource[];
}

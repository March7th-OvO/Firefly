import { streamChat } from "./chat-client";
import { getPageContext } from "./page-context";
import type { ChatMessage } from "./types";

interface ChatStore {
	readonly messages: ChatMessage[];
	readonly isGenerating: boolean;
	sendMessage(content: string): Promise<void>;
	stopGeneration(): void;
	clearMessages(): void;
	dispose(): void;
}

function createId(): string {
	return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function createChat(): ChatStore {
	let messages = $state<ChatMessage[]>([]);
	let isGenerating = $state(false);
	let controller: AbortController | null = null;

	function updateAssistant(
		id: string,
		update: (message: ChatMessage) => ChatMessage,
	): void {
		messages = messages.map((message) =>
			message.id === id ? update(message) : message,
		);
	}

	function stopGeneration(): void {
		if (!controller) return;

		controller.abort();
		controller = null;
		isGenerating = false;
		messages = messages.map((message) =>
			message.status === "streaming" || message.status === "pending"
				? { ...message, status: "done" }
				: message,
		);
	}

	function clearMessages(): void {
		stopGeneration();
		messages = [];
	}

	async function sendMessage(content: string): Promise<void> {
		const trimmed = content.trim();
		if (!trimmed || controller) return;

		const requestController = new AbortController();
		const assistantId = createId();
		controller = requestController;
		isGenerating = true;
		messages = [
			...messages,
			{
				id: createId(),
				role: "user",
				content: trimmed,
				status: "done",
				createdAt: Date.now(),
			},
			{
				id: assistantId,
				role: "assistant",
				content: "",
				status: "pending",
				createdAt: Date.now(),
			},
		];

		try {
			await streamChat(
				{ message: trimmed, context: getPageContext() },
				{
					onStart: () =>
						updateAssistant(assistantId, (message) => ({
							...message,
							status: "streaming",
						})),
					onDelta: (text) =>
						updateAssistant(assistantId, (message) => ({
							...message,
							content: message.content + text,
						})),
					onDone: () =>
						updateAssistant(assistantId, (message) => ({
							...message,
							status: "done",
						})),
				},
				requestController.signal,
			);
		} catch (error) {
			if (!(error instanceof Error && error.name === "AbortError")) {
				updateAssistant(assistantId, (message) => ({
					...message,
					status: "error",
					content:
						message.content ||
						(error instanceof Error
							? error.message
							: "回复暂时失败，请稍后重试。"),
				}));
			}
		} finally {
			// 旧请求结束时不能清掉已经开始的下一轮请求。
			if (controller === requestController) {
				controller = null;
				isGenerating = false;
			}
		}
	}

	function dispose(): void {
		stopGeneration();
	}

	return {
		get messages(): ChatMessage[] {
			return messages;
		},
		get isGenerating(): boolean {
			return isGenerating;
		},
		sendMessage,
		stopGeneration,
		clearMessages,
		dispose,
	};
}

// FurinaBot 在 Layout 中只挂载一次，因此聊天状态可跨站内 Swup 导航保持。
export const chat: ChatStore = createChat();

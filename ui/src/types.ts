export interface MessagesResponse {
	page: number;
	pagesCount: number;
	messages: Message[];
}

export interface Message {
	id: string;
	messageId: string;
	from: string;
	fromFormatted: string;
	to: string[];
	subject: string;
	date: string;
	parts: Part[];
	attachments: Attachment[];
	rawHeaders: Record<string, string[]>
}

export interface Part {
	mediaType: string;
	data: string;
	charset: string;
}

export interface Attachment {
	mediaType: string;
	name: string;
}

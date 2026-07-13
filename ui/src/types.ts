export interface MessagesResponse {
	page: number;
	pagesCount: number;
	unread: number;
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
	read: boolean;
	parts: Part[];
	attachments: Attachment[];
	rawHeaders: Record<string, string[]>;
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

export type CheckStatus = "pass" | "warn" | "fail";

export interface UnsubscribeUri {
	type: string;
	uri: string;
}

export interface UnsubscribeResult {
	present: boolean;
	oneClick: boolean;
	uris: UnsubscribeUri[];
	status: CheckStatus;
	notes: string[];
}

export interface HtmlFinding {
	feature: string;
	status: CheckStatus;
	count: number;
	note: string;
}

export interface HtmlCheckResult {
	hasHtml: boolean;
	status: CheckStatus;
	findings: HtmlFinding[];
}

export interface ChecksResult {
	unsubscribe: UnsubscribeResult;
	html: HtmlCheckResult;
}

export interface LinkResult {
	url: string;
	kind: "link" | "image";
	status: number;
	ok: boolean;
	error?: string;
}

export interface LinkCheckResult {
	links: LinkResult[];
	total: number;
	failed: number;
}

export interface SpamRule {
	score: number;
	name: string;
	description: string;
}

export interface SpamResult {
	isSpam: boolean;
	score: number;
	threshold: number;
	rules: SpamRule[];
}

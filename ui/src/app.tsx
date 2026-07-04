import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import {
	avatarColor,
	categoryColors,
	classNames,
	deriveCategory,
	displayName,
	formatTime,
	initial,
	snippet,
} from "@/helpers";
import {
	ChevronLeftIcon,
	ChevronRightIcon,
	CloseIcon,
	MailIcon,
	RefreshIcon,
	SearchIcon,
	TrashIcon,
} from "@/icons";
import MessagePreview from "@/message-preview";
import type { Message, MessagesResponse } from "@/types";

export default function App() {
	const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
	const [page, setPage] = useState(1);
	const [query, setQuery] = useState("");

	const { data, refetch } = useQuery<MessagesResponse>({
		queryKey: ["messages", page],
		queryFn: async (): Promise<MessagesResponse> => {
			return (
				await fetch(`${import.meta.env.VITE_API_URL || ""}/messages?page=${page}`, {
					mode: "cors",
				})
			).json();
		},
	});

	const messages = useMemo(() => data?.messages ?? [], [data]);
	const pagesCount = data?.pagesCount || 1;

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return messages;
		return messages.filter((m) =>
			`${m.from} ${displayName(m)} ${m.subject}`.toLowerCase().includes(q),
		);
	}, [messages, query]);

	const trashMutation = useMutation({
		mutationFn: () => {
			return fetch(`${import.meta.env.VITE_API_URL || ""}/messages`, {
				method: "DELETE",
				mode: "cors",
			});
		},
		onSuccess() {
			setSelectedMessage(null);
			refetch();
		},
	});

	const handleDeleteAll = () => {
		if (confirm("Really delete all messages?")) {
			trashMutation.mutate();
		}
	};

	const countLabel = query
		? `${filtered.length} found`
		: `${messages.length}${pagesCount > 1 ? ` on page ${page}` : " total"}`;

	const iconBtn =
		"flex h-8 w-8 items-center justify-center rounded-lg border border-[#eaecef] bg-white text-[#6b7280] cursor-pointer transition-colors";

	return (
		<div className="flex h-screen w-full overflow-hidden bg-[#f6f7f9] text-[#1a1d21]">
			{/* ============ SIDEBAR ============ */}
			<aside className="flex w-[392px] flex-none flex-col border-r border-[#eaecef] bg-white">
				{/* brand header */}
				<div className="flex items-center justify-between px-5 pt-[18px] pb-4">
					<div className="flex items-center gap-[11px]">
						<div className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-[#4f46e5]">
							<MailIcon size={17} stroke="#fff" />
						</div>
						<div className="flex flex-col leading-[1.1]">
							<span className="text-[15px] font-semibold tracking-[-0.01em]">
								Mail Debug
							</span>
							<span className="mt-0.5 text-[11.5px] font-medium text-[#9aa1ac]">
								Outbound preview
							</span>
						</div>
					</div>
					<div className="flex gap-1">
						<button
							type="button"
							title="Refresh"
							onClick={() => refetch()}
							className={classNames(
								iconBtn,
								"hover:bg-[#f4f5f7] hover:text-[#1a1d21]",
							)}
						>
							<RefreshIcon size={15} />
						</button>
						<button
							type="button"
							title="Clear all"
							onClick={handleDeleteAll}
							className={classNames(
								iconBtn,
								"hover:border-[#fecaca] hover:bg-[#fef2f2] hover:text-[#dc2626]",
							)}
						>
							<TrashIcon size={15} />
						</button>
					</div>
				</div>

				{/* search */}
				<div className="px-4 pb-3">
					<div className="flex h-[38px] items-center gap-[9px] rounded-[10px] border border-[#f0f1f3] bg-[#f4f5f7] px-3">
						<SearchIcon size={15} stroke="#9aa1ac" className="flex-none" />
						<input
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Search sender or subject"
							className="min-w-0 flex-1 border-none bg-transparent text-[13.5px] text-[#1a1d21] outline-none placeholder:text-[#9aa1ac]"
						/>
						{query && (
							<button
								type="button"
								onClick={() => setQuery("")}
								className="flex flex-none cursor-pointer p-0.5 text-[#9aa1ac] hover:text-[#1a1d21]"
							>
								<CloseIcon size={14} />
							</button>
						)}
					</div>
				</div>

				{/* count row */}
				<div className="flex items-center justify-between px-5 pt-0.5 pb-2.5">
					<span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#9aa1ac]">
						Inbox
					</span>
					<span className="text-[11.5px] font-semibold text-[#6b7280]">{countLabel}</span>
				</div>

				{/* list */}
				<div className="flex-1 overflow-y-auto border-t border-[#eef0f2]">
					{filtered.map((message) => (
						<MessageRow
							key={message.id}
							message={message}
							selected={selectedMessage?.id === message.id}
							onSelect={() => setSelectedMessage(message)}
						/>
					))}
					{filtered.length === 0 && (
						<div className="px-6 py-12 text-center text-[13px] text-[#9aa1ac]">
							{query ? "No messages match your search." : "No messages captured yet."}
						</div>
					)}
				</div>

				{/* paginator */}
				{pagesCount > 1 && (
					<div className="flex items-center justify-between border-t border-[#eef0f2] px-5 py-2.5">
						<button
							type="button"
							disabled={page <= 1}
							onClick={() => setPage((p) => Math.max(1, p - 1))}
							className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#eaecef] bg-white text-[#6b7280] enabled:cursor-pointer enabled:hover:bg-[#f4f5f7] disabled:opacity-40"
						>
							<ChevronLeftIcon size={15} />
						</button>
						<span className="text-[12px] font-medium text-[#6b7280]">
							Page {page} of {pagesCount}
						</span>
						<button
							type="button"
							disabled={page >= pagesCount}
							onClick={() => setPage((p) => Math.min(pagesCount, p + 1))}
							className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#eaecef] bg-white text-[#6b7280] enabled:cursor-pointer enabled:hover:bg-[#f4f5f7] disabled:opacity-40"
						>
							<ChevronRightIcon size={15} />
						</button>
					</div>
				)}
			</aside>

			{/* ============ READER ============ */}
			<main className="flex min-w-0 flex-1 flex-col overflow-hidden">
				{selectedMessage ? (
					<MessagePreview key={selectedMessage.id} message={selectedMessage} />
				) : (
					<EmptyReader cleared={messages.length === 0 && !query} />
				)}
			</main>
		</div>
	);
}

interface MessageRowProps {
	message: Message;
	selected: boolean;
	onSelect: () => void;
}

function MessageRow({ message, selected, onSelect }: MessageRowProps) {
	const category = deriveCategory(message);
	const tag = categoryColors(category);
	const preview = snippet(message);

	return (
		<button
			type="button"
			onClick={onSelect}
			className={classNames(
				"relative block w-full cursor-pointer border-b border-[#f1f2f4] py-[13px] pr-[18px] pl-[19px] text-left",
				selected ? "bg-[#f5f5ff]" : "bg-white hover:bg-[#fafafb]",
			)}
		>
			<span
				className="absolute inset-y-0 left-0 w-[3px]"
				style={{ background: selected ? "#4f46e5" : "transparent" }}
			/>
			<div className="flex items-start gap-[11px]">
				<div
					className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px] text-[13px] font-semibold text-white"
					style={{ background: avatarColor(message.from) }}
				>
					{initial(message)}
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-[#1a1d21]">
							{displayName(message)}
						</span>
						<span className="flex-none text-[11px] font-medium text-[#9aa1ac]">
							{formatTime(message.date)}
						</span>
					</div>
					<div className="mt-[3px] flex items-center gap-[7px]">
						<span
							className={classNames(
								"min-w-0 flex-1 truncate text-[13px]",
								selected
									? "font-semibold text-[#1a1d21]"
									: "font-medium text-[#6b7280]",
							)}
						>
							{message.subject || "(no subject)"}
						</span>
					</div>
					<div className="mt-[5px] flex items-center gap-[7px]">
						<span
							className="rounded-[5px] px-[7px] py-0.5 text-[10px] font-semibold uppercase tracking-[0.03em]"
							style={{ color: tag.fg, background: tag.bg }}
						>
							{category}
						</span>
						<span className="min-w-0 flex-1 truncate text-[12px] text-[#9aa1ac]">
							{preview}
						</span>
					</div>
				</div>
			</div>
		</button>
	);
}

function EmptyReader({ cleared }: { cleared: boolean }) {
	return (
		<div className="flex flex-1 flex-col items-center justify-center p-10 text-center text-[#9aa1ac]">
			<div className="mb-[18px] flex h-16 w-16 items-center justify-center rounded-[18px] border border-[#eaecef] bg-white shadow-sm">
				<MailIcon size={28} stroke="#c2c7cf" strokeWidth={1.8} />
			</div>
			<div className="mb-[5px] text-[15px] font-semibold text-[#6b7280]">
				{cleared ? "Inbox empty" : "No message selected"}
			</div>
			<div className="max-w-[280px] text-[13px] leading-[1.5]">
				{cleared
					? "Captured emails will appear here as your app sends them."
					: "Choose a message from the list to inspect its content and headers."}
			</div>
		</div>
	);
}

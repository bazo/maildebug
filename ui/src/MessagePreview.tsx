import { Message } from "types";
import { Letter } from "react-letter";
import { PaperClipIcon } from "@heroicons/react/20/solid";
import { classNames, formatDate } from "./helpers";
import { useState } from "react";

interface MessagePreviewProps {
	message: Message;
}

export default function MessagePreview({ message }: MessagePreviewProps) {
	const html = message.parts.find((part) => {
		return part.mediaType === "text/html";
	});

	const plainText = message.parts.find((part) => {
		return part.mediaType === "text/plain";
	});

	const [tab, setTab] = useState(html ? "text/html" : "text/plain");

	return (
		<>
			<div className="overflow-hidden bg-white shadow sm:rounded-lg">
				<div className="px-4 py-5 sm:px-6">
					<h3 className="text-lg font-medium leading-6 text-gray-900">
						{message.subject}
					</h3>
					<p className="mt-1 max-w-2xl text-sm text-gray-500">
						{message.fromFormatted}
					</p>
				</div>
				<div className="border-t border-gray-200 px-4 py-5 sm:px-6">
					<dl className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2">
						<div className="sm:col-span-1">
							<dt className="text-sm font-medium text-gray-500">
								From
							</dt>
							<dd className="mt-1 text-sm text-gray-900">
								{message.from}
							</dd>
						</div>
						<div className="sm:col-span-1">
							<dt className="text-sm font-medium text-gray-500">
								To
							</dt>
							<dd className="mt-1 text-sm text-gray-900">
								{message.to.join(" ")}
							</dd>
						</div>
						<div className="sm:col-span-1">
							<dt className="text-sm font-medium text-gray-500">
								Date
							</dt>
							<dd className="mt-1 text-sm text-gray-900">
								{formatDate(message.date)}
							</dd>
						</div>
						<div className="sm:col-span-1">
							<dt className="text-sm font-medium text-gray-500">
								Message Id
							</dt>
							<dd className="mt-1 text-sm text-gray-900">
								{message.messageId}
							</dd>
						</div>
						<div className="sm:col-span-2">
							<dt className="text-sm font-medium text-gray-500">
								Attachments ({message.attachments.length})
							</dt>
							{(message.attachments || []).length > 0 && (
								<dd className="mt-1 text-sm text-gray-900">
									<ul
										role="list"
										className="divide-y divide-gray-200 rounded-md border border-gray-200"
									>
										{message.attachments.map(
											(attachment, key) => {
												return (
													<li
														className="flex items-center justify-between py-3 pl-3 pr-4 text-sm"
														key={`att-${key}`}
													>
														<div className="flex w-0 flex-1 items-center">
															<PaperClipIcon
																className="h-5 w-5 flex-shrink-0 text-gray-400"
																aria-hidden="true"
															/>
															<span className="ml-2 w-0 flex-1 truncate">
																{
																	attachment.name
																}{" "}
																(
																{
																	attachment.mediaType
																}
																)
															</span>
														</div>
														<div className="ml-4 flex-shrink-0">
															<a
																href={`${
																	import.meta
																		.env
																		.VITE_API_URL
																}/messages/${
																	message.id
																}/attachments/${key}`}
																className="font-medium text-indigo-600 hover:text-indigo-500"
															>
																Download
															</a>
														</div>
													</li>
												);
											}
										)}
									</ul>
								</dd>
							)}
						</div>
					</dl>
				</div>
				<div className="hidden sm:block">
					<nav className="flex space-x-4 pl-3 py-2" aria-label="Tabs">
						{message.parts
							.sort((a, b) => {
								if (a.mediaType === "text/html") {
									return -1;
								}
								return a.mediaType > b.mediaType ? 1 : -1;
							})
							.map((part) => (
								<div
									key={part.mediaType}
									className={classNames(
										tab === part.mediaType
											? "bg-gray-100 text-gray-700"
											: "text-gray-500 hover:text-gray-700",
										"px-3 py-2 font-medium text-sm rounded-md cursor-pointer"
									)}
									aria-current={
										tab === part.mediaType
											? "page"
											: undefined
									}
									onClick={() => setTab(part.mediaType)}
								>
									{part.mediaType}
								</div>
							))}
						<div
							key={"rawHeaders"}
							className={classNames(
								tab === "rawHeaders"
									? "bg-gray-100 text-gray-700"
									: "text-gray-500 hover:text-gray-700",
								"px-3 py-2 font-medium text-sm rounded-md cursor-pointer"
							)}
							aria-current={
								tab === "rawHeaders" ? "page" : undefined
							}
							onClick={() => setTab("rawHeaders")}
						>
							headers
						</div>
					</nav>
				</div>
				<div className="pl-6 py-2">
					{tab === "text/html" && <Letter html={html?.data || ""} />}

					{tab === "text/plain" && (
						<div style={{ whiteSpace: "pre-line" }}>
							{plainText?.data}
						</div>
					)}

					{tab === "rawHeaders" && (
						<div className="overflow-hidden">
							<div className="border-t border-gray-200 px-4 py-5 sm:p-0">
								<dl className="sm:divide-y sm:divide-gray-200">
									{Object.entries(message.rawHeaders).map(
										([key, values]) => {
											return (
												<div key={key} className="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5 sm:px-6">
													<dt className="text-sm font-medium text-gray-500">
														{key}
													</dt>
													<dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0">
														{values[0]}
													</dd>
												</div>
											);
										}
									)}
								</dl>
							</div>
						</div>
					)}
				</div>
			</div>
		</>
	);
}

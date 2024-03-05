import { useState } from "react";
import { Pagination } from "react-headless-pagination";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { Message, MessagesResponse } from "types";
import {
	ArrowLeftIcon,
	ArrowRightIcon,
	EnvelopeIcon,
	EnvelopeOpenIcon,
	ArrowPathIcon,
	TrashIcon,
} from "@heroicons/react/20/solid";
import MessagePreview from "./MessagePreview";
import { classNames, formatDate } from "./helpers";

export default function App() {
	const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
	const [page, setPage] = useState(1);

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

	const pagesCount = data?.pagesCount || 1;

	const trashMutation = useMutation({
		mutationFn: () => {
			return fetch(`${import.meta.env.VITE_API_URL || ""}/messages`, {
				method: "DELETE",
				mode: "cors",
			});
		},
		onSuccess() {
			refetch();
		},
	});

	const handleDeleteAll = () => {
		if (confirm("Really delete all message?")) {
			trashMutation.mutate();
		}
	};

	return (
		<>
			<div className="flex">
				<div className="fixed inset-y-0 flex w-96 flex-col">
					<div className="flex min-h-0 flex-1 flex-col bg-gray-800">
						<div className="flex flex-1 flex-col overflow-y-auto pt-5 pb-4">
							<div className="flex justify-between items-center">
								<span className="flex flex-shrink-0 items-center px-4 text-white">
									<EnvelopeIcon className="mr-1.5 h-5 w-5 flex-shrink-0 text-gray-400" />{" "}
									Mail Debug
								</span>
								<div className="flex">
									<TrashIcon
										className="h-5 w-5 mr-1.5 text-gray-400 cursor-pointer hover:text-white"
										onClick={handleDeleteAll}
									/>
									<ArrowPathIcon
										className="h-5 w-5 mr-1.5 text-gray-400 cursor-pointer hover:text-white"
										onClick={() => refetch()}
									/>
								</div>
							</div>
							<nav className="mt-5 flex-1 space-y-1 px-2">
								<ul role="list" className="divide-y divide-gray-200">
									{data?.messages.map((message) => (
										<li
											key={message.id}
											className={`relative bg-white py-5 px-4 hover:bg-blue-100${
												selectedMessage?.id === message.id
													? " bg-blue-200"
													: ""
											}`}
											onClick={() => {
												setSelectedMessage(message);
											}}
										>
											<div className="flex justify-between space-x-3">
												<div className="min-w-0 flex-1">
													<a
														href="#"
														className="block focus:outline-none"
													>
														<span
															className="absolute inset-0"
															aria-hidden="true"
														/>
														<p className="truncate text-sm font-medium text-gray-900 flex items-center">
															{selectedMessage?.id === message.id ? (
																<EnvelopeOpenIcon
																	className="mr-1.5 h-5 w-5 flex-shrink-0 text-gray-400"
																	aria-hidden="true"
																/>
															) : (
																<EnvelopeIcon
																	className="mr-1.5 h-5 w-5 flex-shrink-0 text-gray-400"
																	aria-hidden="true"
																/>
															)}
															{message.from}
														</p>
														<p className="truncate text-sm text-gray-500">
															{message.subject}
														</p>
													</a>
												</div>
												<time
													dateTime={message.date}
													className="flex-shrink-0 whitespace-nowrap text-sm text-gray-500"
												>
													{formatDate(message.date)}
												</time>
											</div>
											<div className="mt-1">
												<p className="text-sm text-gray-600 line-clamp-2">
													{/* {message.preview} */}
												</p>
											</div>
										</li>
									))}
								</ul>

								{pagesCount > 1 ? (
									<Pagination
										totalPages={pagesCount}
										edgePageCount={1}
										middlePagesSiblingCount={1}
										currentPage={page}
										setCurrentPage={setPage}
										className="flex items-center w-full h-10 text-sm select-none"
										truncableText="..."
										truncableClassName="w-10 px-0.5 text-center"
									>
										<Pagination.PrevButton
											className={classNames(
												"flex items-center mr-2 text-gray-500 hover:text-gray-600 dark:hover:text-gray-200 focus:outline-none",
												{
													"cursor-pointer": page !== 0,
													"opacity-50": page === 0,
												},
											)}
										>
											<ArrowLeftIcon className="h-6 w-6 text-white-500" />
										</Pagination.PrevButton>

										<div className="flex items-center justify-center flex-grow">
											<Pagination.PageButton
												activeClassName="bg-primary-50 dark:bg-opacity-0 text-primary-600 dark:text-white"
												inactiveClassName="text-gray-500"
												className={
													"flex items-center justify-center h-10 w-10 rounded-full cursor-pointer"
												}
											/>
										</div>

										<Pagination.NextButton
											className={classNames(
												"flex items-center mr-2 text-gray-500 hover:text-gray-600 dark:hover:text-gray-200 focus:outline-none",
												{
													"cursor-pointer": page !== pagesCount - 1,
													"opacity-50": page === pagesCount - 1,
												},
											)}
										>
											<ArrowRightIcon className="h-6 w-6 text-white-500" />
										</Pagination.NextButton>
									</Pagination>
								) : null}
							</nav>
						</div>
					</div>
				</div>
				<div className="flex flex-1 flex-col pl-96">
					<main className="flex-1">
						<div className="py-6">
							<div className="mx-auto  px-4 sm:px-6 md:px-8">
								{selectedMessage && <MessagePreview message={selectedMessage} />}
							</div>
						</div>
					</main>
				</div>
			</div>
		</>
	);
}

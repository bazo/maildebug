export function classNames(...classes: any[]) {
	return classes.filter(Boolean).join(" ");
}

export function formatDate(dateString: string): string {
	const date = new Date(dateString);
	const locale = import.meta.env.VITE_LOCALE || "sk-SK";
	return `${date.toLocaleDateString(locale)} ${date.toLocaleTimeString(locale)}`;
}

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";

import "./index.css";
import App from "@/app";
import { SettingsProvider } from "@/settings";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: "always",
			staleTime: 0,
		},
	},
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<QueryClientProvider client={queryClient}>
			<SettingsProvider>
				<App />
			</SettingsProvider>
		</QueryClientProvider>
	</React.StrictMode>,
);

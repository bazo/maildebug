import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "maildebug:locale";

/** Sentinel stored when the user wants whatever the browser reports. */
export const SYSTEM_LOCALE = "";

/** Fallback when nothing is stored: the build-time locale, then Slovak. */
export const DEFAULT_LOCALE: string = import.meta.env.VITE_LOCALE || "sk-SK";

/** Locale tags offered in the settings dropdown (BCP 47). */
export const LOCALE_PRESETS: { value: string; label: string }[] = [
	{ value: "sk-SK", label: "Slovak (sk-SK)" },
	{ value: "cs-CZ", label: "Czech (cs-CZ)" },
	{ value: "en-US", label: "English – US (en-US)" },
	{ value: "en-GB", label: "English – UK (en-GB)" },
	{ value: "de-DE", label: "German (de-DE)" },
	{ value: "fr-FR", label: "French (fr-FR)" },
	{ value: "es-ES", label: "Spanish (es-ES)" },
	{ value: "it-IT", label: "Italian (it-IT)" },
	{ value: "nl-NL", label: "Dutch (nl-NL)" },
	{ value: "pl-PL", label: "Polish (pl-PL)" },
	{ value: "pt-BR", label: "Portuguese – Brazil (pt-BR)" },
	{ value: "hu-HU", label: "Hungarian (hu-HU)" },
	{ value: "uk-UA", label: "Ukrainian (uk-UA)" },
	{ value: "ja-JP", label: "Japanese (ja-JP)" },
	{ value: "sv-SE", label: "Swedish (sv-SE)" },
];

/** True when `Intl` understands the tag well enough to format with it. */
export function isValidLocale(locale: string): boolean {
	if (locale === SYSTEM_LOCALE) return true;
	try {
		new Intl.DateTimeFormat(locale);
		return true;
	} catch {
		return false;
	}
}

function readStored(): string {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored === null) return DEFAULT_LOCALE;
		return isValidLocale(stored) ? stored : DEFAULT_LOCALE;
	} catch {
		// Private mode / storage disabled — fall back to the build-time default.
		return DEFAULT_LOCALE;
	}
}

interface SettingsValue {
	/** Raw preference; `SYSTEM_LOCALE` means "follow the browser". */
	locale: string;
	/** Concrete tag to hand to `toLocaleDateString` & friends. */
	resolvedLocale: string;
	setLocale: (locale: string) => void;
}

const SettingsContext = createContext<SettingsValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
	const [locale, setLocaleState] = useState<string>(readStored);

	const setLocale = useCallback((next: string) => {
		setLocaleState(next);
	}, []);

	useEffect(() => {
		try {
			localStorage.setItem(STORAGE_KEY, locale);
		} catch {
			// Persisting is best-effort; the setting still applies for this session.
		}
	}, [locale]);

	const value = useMemo<SettingsValue>(
		() => ({
			locale,
			resolvedLocale:
				locale === SYSTEM_LOCALE ? navigator.language || DEFAULT_LOCALE : locale,
			setLocale,
		}),
		[locale, setLocale],
	);

	return <SettingsContext value={value}>{children}</SettingsContext>;
}

export function useSettings(): SettingsValue {
	const ctx = useContext(SettingsContext);
	if (!ctx) throw new Error("useSettings must be used inside <SettingsProvider>");
	return ctx;
}

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

/**
 * Tracks whether any text input is currently active (focused) anywhere in the
 * app. While a text input is active, the app pauses mouse capture and the
 * right-click→Esc gesture, both of which would otherwise corrupt text entry.
 *
 * Uses a ref-count so multiple/overlapping inputs are handled correctly.
 */
type TextInputActivity = {
	isActive: boolean;
	register: () => void;
	unregister: () => void;
};

const noop = () => {};

// Safe fallback so a stray text input rendered outside the provider never
// crashes — it simply doesn't influence mouse state.
const FALLBACK: TextInputActivity = { isActive: false, register: noop, unregister: noop };

const TextInputActivityContext = createContext<TextInputActivity | null>(null);

export function TextInputActivityProvider({ children }: { children: React.ReactNode }) {
	const [count, setCount] = useState(0);
	const register = useCallback(() => setCount((current) => current + 1), []);
	const unregister = useCallback(() => setCount((current) => (current > 0 ? current - 1 : 0)), []);

	const value = useMemo<TextInputActivity>(
		() => ({ isActive: count > 0, register, unregister }),
		[count, register, unregister]
	);

	return (
		<TextInputActivityContext.Provider value={value}>{children}</TextInputActivityContext.Provider>
	);
}

export function useTextInputActivity(): TextInputActivity {
	return useContext(TextInputActivityContext) ?? FALLBACK;
}

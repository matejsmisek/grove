import React, { type ReactNode, createContext, useCallback, useState } from 'react';

import type { NavigationContextType, NavigationState, Routes } from './types.js';

// Create the navigation context
export const NavigationContext = createContext<NavigationContextType | null>(null);

interface NavigationProviderProps {
	children: ReactNode;
	initialScreen?: keyof Routes;
}

export function NavigationProvider({ children, initialScreen = 'home' }: NavigationProviderProps) {
	const [current, setCurrent] = useState<NavigationState>({
		screen: initialScreen,
		params: {} as Routes[typeof initialScreen],
	});
	const [history, setHistory] = useState<NavigationState[]>([]);

	const navigate = useCallback(
		<T extends keyof Routes>(screen: T, params: Routes[T]) => {
			// Push current state to history before navigating
			setHistory((prev) => [...prev, current]);
			setCurrent({ screen, params });
		},
		[current]
	);

	const goBack = useCallback(() => {
		if (history.length > 0) {
			const previous = history[history.length - 1];
			setCurrent(previous);
			setHistory((prev) => prev.slice(0, -1));
		}
	}, [history]);

	const canGoBack = history.length > 0;

	return (
		<NavigationContext.Provider value={{ current, navigate, goBack, canGoBack, history }}>
			{children}
		</NavigationContext.Provider>
	);
}

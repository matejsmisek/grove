import React, { type ReactNode, createContext, useCallback, useRef, useState } from 'react';

import type { NavigationContextType, NavigationState, Routes } from './types.js';

// Create the navigation context
export const NavigationContext = createContext<NavigationContextType | null>(null);

/**
 * Compute the navigation state for returning to the grove list ("home") after an
 * action that deletes the current grove (e.g. closing it).
 *
 * We unwind the back-stack to the most recent `home` entry and discard everything
 * stacked above it, rather than pushing a fresh `home` on top. Pushing would leave
 * the now-stale grove screens (`groveDetail`/`closeGrove` for the deleted grove)
 * in history, so a subsequent goBack() would replay them and they'd fail to resolve
 * the grove ("Grove not found"). When the stack has no `home` (e.g. launched
 * straight into a grove), fall back to a fresh `home` with an empty back-stack.
 */
export function unwindHistoryToHome(history: NavigationState[]): {
	current: NavigationState;
	history: NavigationState[];
} {
	for (let i = history.length - 1; i >= 0; i--) {
		if (history[i].screen === 'home') {
			return { current: history[i], history: history.slice(0, i) };
		}
	}
	return { current: { screen: 'home', params: {} } as NavigationState, history: [] };
}

interface NavigationProviderProps {
	children: ReactNode;
	initialScreen?: keyof Routes;
}

export function NavigationProvider({ children, initialScreen = 'home' }: NavigationProviderProps) {
	const [current, setCurrent] = useState<NavigationState>({
		screen: initialScreen,
		params: {} as Routes[typeof initialScreen],
	} as NavigationState);
	const [history, setHistory] = useState<NavigationState[]>([]);

	// Mirror `current` in a ref so navigate/replace can read the freshest state
	// synchronously within a single event handler. This lets a screen stamp its
	// selection into its own params via replace() and then navigate() away, with
	// the just-replaced state (not a stale one) being pushed to history — so
	// goBack() restores the screen with its selection intact.
	const currentRef = useRef(current);

	const navigate = useCallback(<T extends keyof Routes>(screen: T, params: Routes[T]) => {
		// Snapshot the current state synchronously: the setHistory updater runs at
		// flush time, by which point currentRef may already point at `next`.
		const from = currentRef.current;
		setHistory((prev) => [...prev, from]);
		const next = { screen, params } as NavigationState;
		currentRef.current = next;
		setCurrent(next);
	}, []);

	const replace = useCallback(<T extends keyof Routes>(screen: T, params: Routes[T]) => {
		// Replace current screen without modifying history
		const next = { screen, params } as NavigationState;
		currentRef.current = next;
		setCurrent(next);
	}, []);

	const goBack = useCallback(() => {
		if (history.length > 0) {
			const previous = history[history.length - 1];
			currentRef.current = previous;
			setCurrent(previous);
			setHistory((prev) => prev.slice(0, -1));
		}
	}, [history]);

	const goHome = useCallback(() => {
		const next = unwindHistoryToHome(history);
		currentRef.current = next.current;
		setCurrent(next.current);
		setHistory(next.history);
	}, [history]);

	const canGoBack = history.length > 0;

	return (
		<NavigationContext.Provider
			value={{ current, navigate, replace, goBack, goHome, canGoBack, history }}
		>
			{children}
		</NavigationContext.Provider>
	);
}

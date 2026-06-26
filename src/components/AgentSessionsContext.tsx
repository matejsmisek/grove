import React, {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';

import { useService } from '../di/index.js';
import { ClaudeSessionServiceToken } from '../services/tokens.js';
import type { ClaudeAgentInfo } from '../utils/claudeAgents.js';

/**
 * How often the live Claude sessions (`claude agents --json`) are refreshed.
 * Centralized here so the whole app polls on a single cadence.
 */
const POLL_INTERVAL_MS = 10 * 1000;

type AgentSessions = {
	/** Live (interactive + background) and suspended sessions, reconciled. */
	sessions: ClaudeAgentInfo[];
	/** Force an immediate refresh (e.g. right after launching a session). */
	refresh: () => void;
	/** Optimistically drop a session locally (e.g. after archiving) until the next poll. */
	removeSession: (sessionId: string) => void;
};

const FALLBACK: AgentSessions = {
	sessions: [],
	refresh: () => {},
	removeSession: () => {},
};

const AgentSessionsContext = createContext<AgentSessions | null>(null);

/**
 * Polls `ClaudeSessionService.listTrackedSessions()` on a single global interval
 * and shares the result with every screen via {@link useAgentSessions}. Mounted
 * once near the app root so the agent list keeps refreshing across navigation
 * instead of each screen running its own timer.
 */
export function AgentSessionsProvider({ children }: { children: React.ReactNode }) {
	const claudeSessionService = useService(ClaudeSessionServiceToken);
	const [sessions, setSessions] = useState<ClaudeAgentInfo[]>([]);
	// Monotonic request id guards against out-of-order resolution: a slow in-flight
	// request must not overwrite the result of a newer one.
	const latestRef = useRef(0);
	const cancelledRef = useRef(false);

	const load = useCallback(async () => {
		const id = ++latestRef.current;
		const next = await claudeSessionService.listTrackedSessions();
		if (!cancelledRef.current && id === latestRef.current) {
			setSessions(next);
		}
	}, [claudeSessionService]);

	useEffect(() => {
		cancelledRef.current = false;
		void load();
		const interval = setInterval(() => void load(), POLL_INTERVAL_MS);
		return () => {
			cancelledRef.current = true;
			clearInterval(interval);
		};
	}, [load]);

	const refresh = useCallback(() => void load(), [load]);
	const removeSession = useCallback((sessionId: string) => {
		setSessions((prev) => prev.filter((agent) => agent.sessionId !== sessionId));
	}, []);

	const value = useMemo<AgentSessions>(
		() => ({ sessions, refresh, removeSession }),
		[sessions, refresh, removeSession]
	);

	return <AgentSessionsContext.Provider value={value}>{children}</AgentSessionsContext.Provider>;
}

/**
 * Access the shared, globally-polled Claude agent sessions. Returns a safe
 * fallback (empty list, no-op actions) when used outside the provider.
 */
export function useAgentSessions(): AgentSessions {
	return useContext(AgentSessionsContext) ?? FALLBACK;
}

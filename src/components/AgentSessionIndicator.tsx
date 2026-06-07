import React, { useEffect, useState } from 'react';

import { Box, Text } from 'ink';

import type { ClaudeAgentInfo } from '../utils/claudeAgents.js';

// Grove-style loader frames, used to animate "busy" sessions.
const LOADER_FRAMES = ['·', '✻', '✽', '✶', '✳', '✢'];

interface StatusMeta {
	icon: string;
	color: string;
	/** Whether to animate the icon (for in-progress sessions). */
	animate?: boolean;
}

/**
 * Direct mapping from the status reported by `claude agents --json` to a display
 * icon and color. The CLI returns the authoritative state, so this is a simple
 * lookup with no state derivation.
 */
const STATUS_META: Record<string, StatusMeta> = {
	busy: { icon: '✻', color: '#C15F3C', animate: true },
	working: { icon: '✻', color: '#C15F3C', animate: true },
	running: { icon: '✻', color: '#C15F3C', animate: true },
	waiting: { icon: '⚠', color: 'yellow' },
	blocked: { icon: '⚠', color: 'yellow' },
	idle: { icon: '·', color: 'gray' },
	completed: { icon: '✓', color: 'green' },
	done: { icon: '✓', color: 'green' },
	failed: { icon: '✗', color: 'red' },
	error: { icon: '✗', color: 'red' },
	stopped: { icon: '■', color: 'gray' },
};

const DEFAULT_META: StatusMeta = { icon: '•', color: 'gray' };

/**
 * Resolve the display metadata for a raw Claude session status.
 */
export function getAgentStatusMeta(status?: string): StatusMeta {
	return STATUS_META[(status ?? '').toLowerCase()] ?? DEFAULT_META;
}

/**
 * The status label to show next to the icon in detailed mode, or null when the
 * icon alone is enough. Busy/completed states show only the icon; every other
 * state shows its name, and 'waiting' additionally shows what it is waiting for.
 */
export function getAgentStatusLabel(session: {
	status?: string;
	waitingFor?: string;
}): string | null {
	const status = (session.status ?? '').toLowerCase();
	const meta = getAgentStatusMeta(status);
	// In-progress (animated) and completed states are clear from the icon alone.
	if (meta.animate || status === 'completed' || status === 'done') {
		return null;
	}
	const name = session.status ?? 'unknown';
	if ((status === 'waiting' || status === 'blocked') && session.waitingFor) {
		return `${name}: ${session.waitingFor}`;
	}
	return name;
}

/**
 * Renders the live Claude sessions (interactive and background) for a worktree,
 * colored by the status reported from `claude agents --json`.
 *
 * - Compact (default): one status icon per session.
 * - Detailed: icon plus the status name for any state that isn't busy/completed,
 *   including the `waitingFor` detail for waiting sessions.
 */
export function AgentSessionIndicator({
	sessions,
	detailed = false,
}: {
	sessions: ClaudeAgentInfo[];
	detailed?: boolean;
}) {
	const [frameIndex, setFrameIndex] = useState(0);
	const hasAnimated = sessions.some((s) => getAgentStatusMeta(s.status).animate);

	useEffect(() => {
		if (!hasAnimated) {
			return;
		}
		const interval = setInterval(() => {
			setFrameIndex((prev) => (prev + 1) % LOADER_FRAMES.length);
		}, 100);
		return () => clearInterval(interval);
	}, [hasAnimated]);

	if (sessions.length === 0) {
		return null;
	}

	return (
		<Box gap={1}>
			{sessions.map((session, index) => {
				const meta = getAgentStatusMeta(session.status);
				const icon = meta.animate ? LOADER_FRAMES[frameIndex] : meta.icon;
				const label = detailed ? getAgentStatusLabel(session) : null;
				return (
					<Box key={session.sessionId ?? index} flexShrink={0}>
						<Text color={meta.color}>{label ? `${icon} ${label}` : icon}</Text>
					</Box>
				);
			})}
		</Box>
	);
}

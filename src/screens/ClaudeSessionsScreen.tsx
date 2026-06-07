import React, { useEffect, useState } from 'react';

import { Box, Text, useInput } from 'ink';

import { getAgentStatusMeta } from '../components/AgentSessionIndicator.js';
import { useService } from '../di/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import { ClaudeSessionServiceToken, GrovesServiceToken } from '../services/tokens.js';
import { type ClaudeAgentInfo, agentMatchesWorktree, lastActionAt } from '../utils/claudeAgents.js';
import { formatTimeAgo } from '../utils/time.js';

interface ClaudeSessionsScreenProps {
	groveId: string;
	worktreePath: string;
}

/**
 * Debug screen: lists the Claude sessions tracked to a specific worktree —
 * matched from `claude agents --json` by the worktree's background session id
 * or by a cwd inside the worktree — with id, status, and last-action timestamp.
 */
export function ClaudeSessionsScreen({ groveId, worktreePath }: ClaudeSessionsScreenProps) {
	const { goBack, canGoBack } = useNavigation();
	const claudeSessionService = useService(ClaudeSessionServiceToken);
	const grovesService = useService(GrovesServiceToken);

	const [sessions, setSessions] = useState<ClaudeAgentInfo[]>([]);
	const [loading, setLoading] = useState(true);

	// Resolve the worktree so we know its name and background session id to match by.
	const worktree = React.useMemo(() => {
		const groveRef = grovesService.getGroveById(groveId);
		if (!groveRef) {
			return undefined;
		}
		const metadata = grovesService.readGroveMetadata(groveRef.path);
		return metadata?.worktrees.find((w) => w.worktreePath === worktreePath);
	}, [grovesService, groveId, worktreePath]);

	const worktreeLabel = worktree?.name || worktreePath;
	const bgSessionId = worktree?.bgSessionId;

	const fetchSessions = React.useCallback(async () => {
		const all = await claudeSessionService.listTrackedSessions();
		return all.filter((agent) => agentMatchesWorktree(agent, worktreePath, bgSessionId));
	}, [claudeSessionService, worktreePath, bgSessionId]);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			const matched = await fetchSessions();
			if (!cancelled) {
				setSessions(matched);
				setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [fetchSessions]);

	const refresh = async () => {
		setLoading(true);
		const matched = await fetchSessions();
		setSessions(matched);
		setLoading(false);
	};

	useInput((input, key) => {
		if (key.escape && canGoBack) {
			goBack();
		} else if (input === 'r') {
			void refresh();
		}
	});

	const formatTimestamp = (ms: number | undefined): string => {
		if (ms === undefined) {
			return 'unknown';
		}
		const iso = new Date(ms).toISOString();
		return `${formatTimeAgo(iso)} (${iso})`;
	};

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="yellow">
					Claude Sessions — {worktreeLabel} ({sessions.length})
				</Text>
				{loading && <Text dimColor> — refreshing…</Text>}
			</Box>

			{!loading && sessions.length === 0 ? (
				<Text dimColor>No Claude sessions tracked to this worktree.</Text>
			) : (
				<Box flexDirection="column">
					{sessions.map((session, index) => {
						const meta = getAgentStatusMeta(session.status);
						const status = session.status ?? 'unknown';
						const statusLine =
							session.waitingFor && (status === 'waiting' || status === 'blocked')
								? `${status} — ${session.waitingFor}`
								: status;
						return (
							<Box key={session.sessionId ?? index} flexDirection="column" marginBottom={1}>
								<Box>
									<Text color={meta.color}>{meta.icon} </Text>
									<Text bold>{session.name || '(unnamed)'}</Text>
									{session.kind && <Text dimColor> [{session.kind}]</Text>}
								</Box>
								<Text dimColor> id: {session.sessionId ?? 'unknown'}</Text>
								<Text dimColor>
									{' '}
									status: <Text color={meta.color}>{statusLine}</Text>
								</Text>
								<Text dimColor> last action: {formatTimestamp(lastActionAt(session))}</Text>
								{typeof session.cwd === 'string' && <Text dimColor> cwd: {session.cwd}</Text>}
							</Box>
						);
					})}
				</Box>
			)}

			<Box marginTop={1} flexDirection="column">
				<Text dimColor>
					<Text color="cyan">r</Text> Refresh
				</Text>
				{canGoBack && (
					<Text dimColor>
						<Text color="cyan">ESC</Text> Go back
					</Text>
				)}
			</Box>
		</Box>
	);
}

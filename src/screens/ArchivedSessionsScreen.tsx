import React, { useEffect, useState } from 'react';

import { Box, Text, useInput } from 'ink';

import { useService } from '../di/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import {
	ClaudeSessionServiceToken,
	GrovesServiceToken,
	SessionsServiceToken,
	SettingsServiceToken,
} from '../services/tokens.js';
import type { AgentSession, ClaudeTerminalType, Worktree } from '../storage/types.js';
import { sessionMatchesWorktree, shortSessionId } from '../utils/claudeAgents.js';
import { formatTimeAgo } from '../utils/time.js';

interface ArchivedSessionsScreenProps {
	groveId: string;
	worktreePath: string;
}

type ViewMode = 'selectSession' | 'selectTerminal';

const TERMINAL_DISPLAY_NAMES: Record<ClaudeTerminalType, string> = {
	konsole: 'KDE Konsole',
	kitty: 'Kitty',
};

/**
 * Display name for an archived session: its first prompt, then project name, then
 * the short session id.
 */
function getSessionDisplayName(session: AgentSession): string {
	if (typeof session.metadata?.firstPrompt === 'string' && session.metadata.firstPrompt.trim()) {
		return session.metadata.firstPrompt.slice(0, 60);
	}
	if (typeof session.metadata?.projectName === 'string' && session.metadata.projectName.trim()) {
		return session.metadata.projectName;
	}
	return `Session ${shortSessionId(session.sessionId)}`;
}

/**
 * Lists the Claude sessions archived/terminated for a worktree (from the persisted
 * registry) and lets the user resume one with `claude --resume <id>`. Resuming
 * needs a terminal, so when several are available the user is asked to pick one.
 */
export function ArchivedSessionsScreen({ groveId, worktreePath }: ArchivedSessionsScreenProps) {
	const { goBack } = useNavigation();
	const claudeSessionService = useService(ClaudeSessionServiceToken);
	const grovesService = useService(GrovesServiceToken);
	const sessionsService = useService(SessionsServiceToken);
	const settingsService = useService(SettingsServiceToken);

	const [sessions, setSessions] = useState<AgentSession[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [resultMessage, setResultMessage] = useState<string | null>(null);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [viewMode, setViewMode] = useState<ViewMode>('selectSession');
	const [availableTerminals, setAvailableTerminals] = useState<ClaudeTerminalType[]>([]);
	const [pendingSession, setPendingSession] = useState<AgentSession | null>(null);

	// Resolve the worktree (for its name + background session id) and grove name.
	const { groveName, worktree } = React.useMemo(() => {
		const groveRef = grovesService.getGroveById(groveId);
		if (!groveRef) {
			return { groveName: '', worktree: undefined as Worktree | undefined };
		}
		const metadata = grovesService.readGroveMetadata(groveRef.path);
		return {
			groveName: groveRef.name,
			worktree: metadata?.worktrees.find((w) => w.worktreePath === worktreePath),
		};
	}, [grovesService, groveId, worktreePath]);

	const worktreeLabel = worktree?.name || worktreePath;

	const loadSessions = React.useCallback(() => {
		const archived = sessionsService
			.getArchivedSessions()
			.filter((s) => s.agentType === 'claude')
			.filter((s) => sessionMatchesWorktree(s, worktreePath, worktree?.bgSessionId));
		archived.sort((a, b) => new Date(b.lastUpdate).getTime() - new Date(a.lastUpdate).getTime());
		return archived;
	}, [sessionsService, worktreePath, worktree?.bgSessionId]);

	useEffect(() => {
		let cancelled = false;
		setSessions(loadSessions());
		claudeSessionService.detectAvailableTerminals().then((found) => {
			if (!cancelled) {
				setAvailableTerminals(found);
				setLoading(false);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [loadSessions, claudeSessionService]);

	// Determine which terminal to use, or null when the user must pick one.
	const resolveTerminal = (): ClaudeTerminalType | null => {
		const settings = settingsService.readSettings();
		if (
			settings.selectedClaudeTerminal &&
			availableTerminals.includes(settings.selectedClaudeTerminal)
		) {
			return settings.selectedClaudeTerminal;
		}
		return availableTerminals.length === 1 ? availableTerminals[0] : null;
	};

	const resume = async (session: AgentSession, terminal: ClaudeTerminalType) => {
		const workingDir = session.workspacePath || worktreePath;
		const result = await claudeSessionService.resumeSession(
			session.sessionId,
			workingDir,
			terminal,
			groveName,
			worktree?.name
		);
		if (result.success) {
			// Drop it from the list optimistically; reconciliation un-archives it once
			// it is reported live again.
			setSessions((prev) => prev.filter((s) => s.sessionId !== session.sessionId));
			setResultMessage(`Resuming Claude session ${shortSessionId(session.sessionId)}`);
			setTimeout(() => setResultMessage(null), 2000);
			setViewMode('selectSession');
			setSelectedIndex(0);
		} else {
			setError(result.message);
		}
	};

	const handleSelectSession = (session: AgentSession) => {
		if (availableTerminals.length === 0) {
			setError('No supported terminal found. This feature requires KDE Konsole or Kitty.');
			return;
		}
		const terminal = resolveTerminal();
		if (!terminal) {
			// Multiple terminals available and none preferred — ask which to use.
			setPendingSession(session);
			setViewMode('selectTerminal');
			setSelectedIndex(0);
			return;
		}
		void resume(session, terminal);
	};

	useInput(
		(input, key) => {
			if (key.escape) {
				if (viewMode === 'selectTerminal') {
					setViewMode('selectSession');
					setPendingSession(null);
					setSelectedIndex(0);
				} else {
					goBack();
				}
				return;
			}
			const list = viewMode === 'selectTerminal' ? availableTerminals : sessions;
			if (list.length === 0) {
				if (input === 'r' && viewMode === 'selectSession') {
					setSessions(loadSessions());
				}
				return;
			}
			if (key.upArrow) {
				setSelectedIndex((prev) => (prev > 0 ? prev - 1 : list.length - 1));
			} else if (key.downArrow) {
				setSelectedIndex((prev) => (prev < list.length - 1 ? prev + 1 : 0));
			} else if (key.return) {
				if (viewMode === 'selectTerminal') {
					const terminal = availableTerminals[selectedIndex];
					if (pendingSession) {
						void resume(pendingSession, terminal);
						setPendingSession(null);
					}
				} else {
					handleSelectSession(sessions[selectedIndex]);
				}
			} else if (input === 'r' && viewMode === 'selectSession') {
				setSessions(loadSessions());
			}
		},
		{ isActive: !loading && !error }
	);

	useInput(
		() => {
			goBack();
		},
		{ isActive: !!error }
	);

	if (loading) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text>Loading archived sessions…</Text>
			</Box>
		);
	}

	if (error) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="red">Error: {error}</Text>
				<Text dimColor>Press any key to go back</Text>
			</Box>
		);
	}

	if (viewMode === 'selectTerminal') {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="yellow">
						Resume in which terminal?
					</Text>
				</Box>
				{availableTerminals.map((terminal, index) => (
					<Text key={terminal} color={selectedIndex === index ? 'cyan' : undefined}>
						{selectedIndex === index ? '❯ ' : '  '}
						{TERMINAL_DISPLAY_NAMES[terminal]}
					</Text>
				))}
				<Box marginTop={1}>
					<Text dimColor>↑↓ Navigate • Enter Select • ESC Back</Text>
				</Box>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="yellow">
					Archived Sessions — {worktreeLabel} ({sessions.length})
				</Text>
			</Box>

			{resultMessage && (
				<Box marginBottom={1}>
					<Text color="green">{resultMessage}</Text>
				</Box>
			)}

			{sessions.length === 0 ? (
				<Text dimColor>No archived Claude sessions for this worktree.</Text>
			) : (
				<Box flexDirection="column">
					<Box marginBottom={1}>
						<Text dimColor>Select a session to resume:</Text>
					</Box>
					{sessions.map((session, index) => (
						<Text key={session.sessionId} color={selectedIndex === index ? 'cyan' : undefined}>
							{selectedIndex === index ? '❯ ' : '  '}
							{getSessionDisplayName(session)}
							<Text dimColor> · {shortSessionId(session.sessionId)}</Text>
							<Text dimColor> · {formatTimeAgo(session.lastUpdate)}</Text>
						</Text>
					))}
				</Box>
			)}

			<Box marginTop={1} flexDirection="column">
				{sessions.length > 0 && <Text dimColor>↑↓ Navigate • Enter Resume • ESC Back</Text>}
				<Text dimColor>
					<Text color="cyan">r</Text> Refresh
					{sessions.length === 0 && (
						<>
							{' • '}
							<Text color="cyan">ESC</Text> Back
						</>
					)}
				</Text>
			</Box>
		</Box>
	);
}

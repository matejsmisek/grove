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
import type { AgentSession, ClaudeTerminalType } from '../storage/types.js';

interface ResumeClaudeScreenProps {
	groveId: string;
	worktreePath?: string;
}

type ViewMode = 'selectSession' | 'selectTerminal' | 'selectWorktree';

const TERMINAL_DISPLAY_NAMES: Record<ClaudeTerminalType, string> = {
	konsole: 'KDE Konsole',
	kitty: 'Kitty',
};

/**
 * Format a relative time string (e.g., "5m ago", "2h ago", "3d ago")
 */
function formatRelativeTime(isoTimestamp: string): string {
	const now = Date.now();
	const timestamp = new Date(isoTimestamp).getTime();
	const diffMs = now - timestamp;
	const diffMinutes = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMinutes < 1) {
		return 'just now';
	} else if (diffMinutes < 60) {
		return `${diffMinutes}m ago`;
	} else if (diffHours < 24) {
		return `${diffHours}h ago`;
	} else {
		return `${diffDays}d ago`;
	}
}

/**
 * Truncate text to a maximum length with ellipsis
 */
function truncateText(text: string, maxLength: number): string {
	if (text.length <= maxLength) {
		return text;
	}
	return text.substring(0, maxLength - 1) + '…';
}

/**
 * Get a display name for the session
 * Priority: firstPrompt > projectName > sessionId (last 8 chars)
 */
function getSessionDisplayName(session: AgentSession, maxLength: number = 60): string {
	// Check for first prompt in metadata
	if (session.metadata?.firstPrompt && typeof session.metadata.firstPrompt === 'string') {
		return truncateText(session.metadata.firstPrompt, maxLength);
	}

	// Fall back to project name
	if (session.metadata?.projectName && typeof session.metadata.projectName === 'string') {
		return truncateText(session.metadata.projectName, maxLength);
	}

	// Fall back to shortened session ID
	return `Session ${session.sessionId.substring(0, 8)}`;
}

export function ResumeClaudeScreen({ groveId, worktreePath }: ResumeClaudeScreenProps) {
	const { goBack, navigate } = useNavigation();
	const claudeSessionService = useService(ClaudeSessionServiceToken);
	const grovesService = useService(GrovesServiceToken);
	const sessionsService = useService(SessionsServiceToken);
	const settingsService = useService(SettingsServiceToken);
	const [loading, setLoading] = useState(true);
	const [groveName, setGroveName] = useState('');
	const [sessions, setSessions] = useState<AgentSession[]>([]);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [resultMessage, setResultMessage] = useState<string | null>(null);
	const [viewMode, setViewMode] = useState<ViewMode>('selectSession');
	const [availableTerminals, setAvailableTerminals] = useState<ClaudeTerminalType[]>([]);
	const [selectedTerminal, setSelectedTerminal] = useState<ClaudeTerminalType | null>(null);
	const [showedTerminalSelection, setShowedTerminalSelection] = useState(false);

	useEffect(() => {
		// Check if supported terminals are available
		const terminals = claudeSessionService.detectAvailableTerminals();
		if (terminals.length === 0) {
			setError('No supported terminal found. This feature requires KDE Konsole or Kitty.');
			setLoading(false);
			return;
		}

		setAvailableTerminals(terminals);

		// Check if user has a selected terminal in settings
		const settings = settingsService.readSettings();
		const userSelectedTerminal = settings.selectedClaudeTerminal;

		// Determine which terminal to use
		let terminalToUse: ClaudeTerminalType | null = null;
		if (userSelectedTerminal && terminals.includes(userSelectedTerminal)) {
			terminalToUse = userSelectedTerminal;
		} else if (terminals.length === 1) {
			terminalToUse = terminals[0];
		}

		const groveRef = grovesService.getGroveById(groveId);
		if (!groveRef) {
			setError('Grove not found');
			setLoading(false);
			return;
		}

		setGroveName(groveRef.name);

		const metadata = grovesService.readGroveMetadata(groveRef.path);
		if (!metadata) {
			setError('Grove metadata not found');
			setLoading(false);
			return;
		}

		// Get sessions for this grove
		let groveSessions = sessionsService
			.getSessionsByGrove(groveId)
			.filter((s) => s.isRunning && s.agentType === 'claude');

		// If worktreePath is provided, filter to that worktree only
		if (worktreePath) {
			groveSessions = groveSessions.filter((s) => s.worktreePath === worktreePath);
		}

		if (groveSessions.length === 0) {
			setError('No active Claude sessions found in this grove');
			setLoading(false);
			return;
		}

		// Sort by most recent activity first
		groveSessions.sort((a, b) => {
			const aTime = a.metadata?.lastActivity || a.lastUpdate;
			const bTime = b.metadata?.lastActivity || b.lastUpdate;
			return new Date(bTime).getTime() - new Date(aTime).getTime();
		});

		setSessions(groveSessions);

		// If no terminal is determined and multiple are available, show terminal selection
		if (!terminalToUse && terminals.length > 1) {
			setViewMode('selectTerminal');
			setShowedTerminalSelection(true);
			setLoading(false);
			return;
		}

		setSelectedTerminal(terminalToUse);

		// If only one session, resume it directly
		if (groveSessions.length === 1) {
			const session = groveSessions[0];
			const result = claudeSessionService.resumeSession(
				session.sessionId,
				session.workspacePath,
				terminalToUse!,
				groveRef.name
			);
			if (result.success) {
				goBack();
			} else {
				setError(result.message);
				setLoading(false);
			}
			return;
		}

		// Multiple sessions - show selection
		setViewMode('selectSession');
		setLoading(false);
	}, [groveId, worktreePath, goBack, claudeSessionService, sessionsService, settingsService]);

	const handleSelectTerminal = (terminal: ClaudeTerminalType) => {
		setSelectedTerminal(terminal);
		if (sessions.length === 1) {
			const session = sessions[0];
			const result = claudeSessionService.resumeSession(
				session.sessionId,
				session.workspacePath,
				terminal,
				groveName
			);
			if (result.success) {
				goBack();
			} else {
				setError(result.message);
			}
		} else {
			setViewMode('selectSession');
			setSelectedIndex(0);
		}
	};

	const handleSelectSession = (session: AgentSession) => {
		const result = claudeSessionService.resumeSession(
			session.sessionId,
			session.workspacePath,
			selectedTerminal!,
			groveName
		);
		if (result.success) {
			setResultMessage(`Resumed Claude session`);
			// Go back after a short delay to show the message
			setTimeout(() => goBack(), 500);
		} else {
			setError(result.message);
		}
	};

	useInput(
		(input, key) => {
			if (key.escape) {
				if (viewMode === 'selectSession' && showedTerminalSelection) {
					// If we came from terminal selection, go back to it
					setViewMode('selectTerminal');
					setSelectedIndex(0);
				} else {
					goBack();
				}
			} else if (key.upArrow) {
				if (viewMode === 'selectTerminal') {
					setSelectedIndex((prev) => (prev > 0 ? prev - 1 : availableTerminals.length - 1));
				} else {
					setSelectedIndex((prev) => (prev > 0 ? prev - 1 : sessions.length - 1));
				}
			} else if (key.downArrow) {
				if (viewMode === 'selectTerminal') {
					setSelectedIndex((prev) => (prev < availableTerminals.length - 1 ? prev + 1 : 0));
				} else {
					setSelectedIndex((prev) => (prev < sessions.length - 1 ? prev + 1 : 0));
				}
			} else if (key.return) {
				if (viewMode === 'selectTerminal') {
					handleSelectTerminal(availableTerminals[selectedIndex]);
				} else {
					handleSelectSession(sessions[selectedIndex]);
				}
			} else if (input === 's' && viewMode === 'selectTerminal') {
				// Open terminal settings
				navigate('claudeTerminalSettings', {});
			}
		},
		{ isActive: !loading && !error && !resultMessage }
	);

	// Handle any key to go back on error
	useInput(
		() => {
			goBack();
		},
		{ isActive: !!error }
	);

	if (loading) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text>Loading sessions...</Text>
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

	if (resultMessage) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="green">{resultMessage}</Text>
			</Box>
		);
	}

	if (viewMode === 'selectTerminal') {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold>Resume Claude Session: {groveName}</Text>
				</Box>

				<Box marginBottom={1}>
					<Text dimColor>Select a terminal to use:</Text>
				</Box>

				{availableTerminals.map((terminal, index) => (
					<Box key={terminal}>
						<Text color={selectedIndex === index ? 'cyan' : undefined}>
							{selectedIndex === index ? '❯ ' : '  '}
							{TERMINAL_DISPLAY_NAMES[terminal]}
						</Text>
					</Box>
				))}

				<Box marginTop={1} flexDirection="column">
					<Text dimColor>↑↓ Navigate • Enter Select</Text>
					<Text dimColor>
						<Text color="cyan">s</Text> Open Settings • <Text color="cyan">ESC</Text> Cancel
					</Text>
				</Box>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold>Resume Claude Session: {groveName}</Text>
			</Box>

			<Box marginBottom={1}>
				<Text dimColor>Select a session to resume:</Text>
			</Box>

			{sessions.map((session, index) => {
				const sessionName = getSessionDisplayName(session);
				const lastActivity = session.metadata?.lastActivity || session.lastUpdate;
				const relativeTime = formatRelativeTime(lastActivity);
				const statusColor =
					session.status === 'active' ? 'green' : session.status === 'attention' ? 'yellow' : 'dim';

				return (
					<Box key={session.sessionId} marginBottom={0}>
						<Text color={selectedIndex === index ? 'cyan' : undefined}>
							{selectedIndex === index ? '❯ ' : '  '}
							{sessionName}
							<Text dimColor> ({relativeTime})</Text>
							<Text color={statusColor}> [{session.status}]</Text>
						</Text>
					</Box>
				);
			})}

			<Box marginTop={1}>
				<Text dimColor>↑↓ Navigate • Enter Select • ESC Cancel</Text>
			</Box>
		</Box>
	);
}

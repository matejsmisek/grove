import React, { useEffect, useState } from 'react';

import { Box, Text, useInput } from 'ink';

import { useService } from '../di/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import {
	ClaudeSessionServiceToken,
	GrovesServiceToken,
	SettingsServiceToken,
} from '../services/tokens.js';
import type { ClaudeTerminalType, Worktree } from '../storage/types.js';

interface OpenClaudeScreenProps {
	groveId: string;
}

type ViewMode = 'selectTerminal' | 'selectWorktree';

const TERMINAL_DISPLAY_NAMES: Record<ClaudeTerminalType, string> = {
	konsole: 'KDE Konsole',
	kitty: 'Kitty',
};

export function OpenClaudeScreen({ groveId }: OpenClaudeScreenProps) {
	const { goBack, navigate } = useNavigation();
	const claudeSessionService = useService(ClaudeSessionServiceToken);
	const grovesService = useService(GrovesServiceToken);
	const settingsService = useService(SettingsServiceToken);
	const [loading, setLoading] = useState(true);
	const [groveName, setGroveName] = useState('');
	const [worktrees, setWorktrees] = useState<Worktree[]>([]);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [resultMessage, setResultMessage] = useState<string | null>(null);
	const [viewMode, setViewMode] = useState<ViewMode>('selectWorktree');
	const [availableTerminals, setAvailableTerminals] = useState<ClaudeTerminalType[]>([]);
	const [selectedTerminal, setSelectedTerminal] = useState<ClaudeTerminalType | null>(null);

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

		if (metadata.worktrees.length === 0) {
			setError('No worktrees found in this grove');
			setLoading(false);
			return;
		}

		// If no terminal is determined and multiple are available, show terminal selection
		if (!terminalToUse && terminals.length > 1) {
			setViewMode('selectTerminal');
			setWorktrees(metadata.worktrees);
			setLoading(false);
			return;
		}

		setSelectedTerminal(terminalToUse);

		// If only one worktree, open Claude directly
		if (metadata.worktrees.length === 1) {
			const worktree = metadata.worktrees[0];
			// Use project path within worktree if available, otherwise use worktree path
			const workingDir = worktree.projectPath
				? `${worktree.worktreePath}/${worktree.projectPath}`
				: worktree.worktreePath;
			const result = claudeSessionService.openSession(
				workingDir,
				worktree.repositoryPath,
				worktree.projectPath,
				terminalToUse!
			);
			if (result.success) {
				goBack();
			} else {
				setError(result.message);
				setLoading(false);
			}
			return;
		}

		// Multiple worktrees - show selection
		setWorktrees(metadata.worktrees);
		setViewMode('selectWorktree');
		setLoading(false);
	}, [groveId, goBack, claudeSessionService, settingsService]);

	const handleSelectTerminal = (terminal: ClaudeTerminalType) => {
		setSelectedTerminal(terminal);
		setViewMode('selectWorktree');
		setSelectedIndex(0); // Reset selection for worktree
	};

	const handleSelectWorktree = (worktree: Worktree) => {
		// Use project path within worktree if available, otherwise use worktree path
		const workingDir = worktree.projectPath
			? `${worktree.worktreePath}/${worktree.projectPath}`
			: worktree.worktreePath;
		const result = claudeSessionService.openSession(
			workingDir,
			worktree.repositoryPath,
			worktree.projectPath,
			selectedTerminal!
		);
		if (result.success) {
			setResultMessage(`Opened Claude in ${worktree.repositoryName}`);
			// Go back after a short delay to show the message
			setTimeout(() => goBack(), 500);
		} else {
			setError(result.message);
		}
	};

	useInput(
		(input, key) => {
			if (key.escape) {
				if (viewMode === 'selectWorktree' && availableTerminals.length > 1 && !selectedTerminal) {
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
					setSelectedIndex((prev) => (prev > 0 ? prev - 1 : worktrees.length - 1));
				}
			} else if (key.downArrow) {
				if (viewMode === 'selectTerminal') {
					setSelectedIndex((prev) => (prev < availableTerminals.length - 1 ? prev + 1 : 0));
				} else {
					setSelectedIndex((prev) => (prev < worktrees.length - 1 ? prev + 1 : 0));
				}
			} else if (key.return) {
				if (viewMode === 'selectTerminal') {
					handleSelectTerminal(availableTerminals[selectedIndex]);
				} else {
					handleSelectWorktree(worktrees[selectedIndex]);
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
				<Text>Loading worktrees...</Text>
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
					<Text bold>Open in Claude: {groveName}</Text>
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
				<Text bold>Open in Claude: {groveName}</Text>
			</Box>

			<Box marginBottom={1}>
				<Text dimColor>Select a worktree to open with Claude:</Text>
			</Box>

			{worktrees.map((worktree, index) => (
				<Box key={worktree.worktreePath}>
					<Text color={selectedIndex === index ? 'cyan' : undefined}>
						{selectedIndex === index ? '❯ ' : '  '}
						{worktree.repositoryName}
						{worktree.projectPath && <Text dimColor> / {worktree.projectPath}</Text>}
						<Text dimColor> ({worktree.branch})</Text>
					</Text>
				</Box>
			))}

			<Box marginTop={1}>
				<Text dimColor>↑↓ Navigate • Enter Select • ESC Cancel</Text>
			</Box>
		</Box>
	);
}

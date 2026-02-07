import React, { useEffect, useState } from 'react';

import { Box, Text, useInput } from 'ink';

import path from 'path';

import { useService } from '../di/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import { detectTerminal, openTerminalInPath } from '../services/index.js';
import { GrovesServiceToken, SettingsServiceToken } from '../services/tokens.js';
import type { TerminalConfig, Worktree } from '../storage/index.js';

interface OpenTerminalScreenProps {
	groveId: string;
}

/**
 * Get the terminal path for a worktree, including project path for monorepos
 */
function getTerminalPath(worktree: Worktree): string {
	if (worktree.projectPath) {
		return path.join(worktree.worktreePath, worktree.projectPath);
	}
	return worktree.worktreePath;
}

export function OpenTerminalScreen({ groveId }: OpenTerminalScreenProps) {
	const { goBack } = useNavigation();
	const grovesService = useService(GrovesServiceToken);
	const settingsService = useService(SettingsServiceToken);
	const [loading, setLoading] = useState(true);
	const [groveName, setGroveName] = useState('');
	const [worktrees, setWorktrees] = useState<Worktree[]>([]);
	const [terminalConfig, setTerminalConfig] = useState<TerminalConfig | undefined>(undefined);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [resultMessage, setResultMessage] = useState<string | null>(null);

	useEffect(() => {
		// Read terminal config, respecting Claude terminal preference
		const settings = settingsService.readSettings();
		const resolvedConfig = settings.selectedClaudeTerminal
			? (detectTerminal(settings.selectedClaudeTerminal) ?? settings.terminal)
			: settings.terminal;

		if (!resolvedConfig) {
			setError('No terminal configured. Please restart Grove to detect available terminals.');
			setLoading(false);
			return;
		}
		setTerminalConfig(resolvedConfig);

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

		// If only one worktree, open terminal directly
		if (metadata.worktrees.length === 1) {
			const terminalPath = getTerminalPath(metadata.worktrees[0]);
			const result = openTerminalInPath(terminalPath, resolvedConfig);
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
		setLoading(false);
	}, [groveId, goBack]);

	const handleSelect = (worktree: Worktree) => {
		const terminalPath = getTerminalPath(worktree);
		const result = openTerminalInPath(terminalPath, terminalConfig);
		if (result.success) {
			const projectInfo = worktree.projectPath ? ` (${worktree.projectPath})` : '';
			setResultMessage(`Opened terminal in ${worktree.repositoryName}${projectInfo}`);
			// Go back after a short delay to show the message
			setTimeout(() => goBack(), 500);
		} else {
			setError(result.message);
		}
	};

	useInput(
		(input, key) => {
			if (key.escape) {
				goBack();
			} else if (key.upArrow) {
				setSelectedIndex((prev) => (prev > 0 ? prev - 1 : worktrees.length - 1));
			} else if (key.downArrow) {
				setSelectedIndex((prev) => (prev < worktrees.length - 1 ? prev + 1 : 0));
			} else if (key.return) {
				handleSelect(worktrees[selectedIndex]);
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

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold>Open in Terminal: {groveName}</Text>
			</Box>

			<Box marginBottom={1}>
				<Text dimColor>Select a worktree to open:</Text>
			</Box>

			{worktrees.map((worktree, index) => (
				<Box key={worktree.worktreePath}>
					<Text color={selectedIndex === index ? 'cyan' : undefined}>
						{selectedIndex === index ? '❯ ' : '  '}
						{worktree.repositoryName}
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

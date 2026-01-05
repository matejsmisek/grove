import React, { useEffect, useState } from 'react';

import { Box, Text, useInput } from 'ink';

import { useService } from '../di/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import { ClaudeSessionServiceToken } from '../services/tokens.js';
import { getGroveById, readGroveMetadata } from '../storage/index.js';
import type { Worktree } from '../storage/index.js';

interface OpenClaudeScreenProps {
	groveId: string;
}

export function OpenClaudeScreen({ groveId }: OpenClaudeScreenProps) {
	const { goBack } = useNavigation();
	const claudeSessionService = useService(ClaudeSessionServiceToken);
	const [loading, setLoading] = useState(true);
	const [groveName, setGroveName] = useState('');
	const [worktrees, setWorktrees] = useState<Worktree[]>([]);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [resultMessage, setResultMessage] = useState<string | null>(null);

	useEffect(() => {
		// Check if a supported terminal is available
		const terminal = claudeSessionService.detectTerminal();
		if (!terminal) {
			setError('No supported terminal found. This feature requires KDE Konsole or Kitty.');
			setLoading(false);
			return;
		}

		const groveRef = getGroveById(groveId);
		if (!groveRef) {
			setError('Grove not found');
			setLoading(false);
			return;
		}

		setGroveName(groveRef.name);

		const metadata = readGroveMetadata(groveRef.path);
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

		// If only one worktree, open Claude directly
		if (metadata.worktrees.length === 1) {
			const worktree = metadata.worktrees[0];
			// Use project path within worktree if available, otherwise use worktree path
			const workingDir = worktree.projectPath
				? `${worktree.worktreePath}/${worktree.projectPath}`
				: worktree.worktreePath;
			const result = claudeSessionService.openSession(workingDir);
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
	}, [groveId, goBack, claudeSessionService]);

	const handleSelect = (worktree: Worktree) => {
		// Use project path within worktree if available, otherwise use worktree path
		const workingDir = worktree.projectPath
			? `${worktree.worktreePath}/${worktree.projectPath}`
			: worktree.worktreePath;
		const result = claudeSessionService.openSession(workingDir);
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

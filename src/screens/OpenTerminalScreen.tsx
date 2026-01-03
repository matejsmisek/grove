import React, { useEffect, useState } from 'react';

import { Box, Text, useInput } from 'ink';

import { useNavigation } from '../navigation/useNavigation.js';
import { openTerminalInPath } from '../services/index.js';
import { getGroveById, readGroveMetadata } from '../storage/index.js';
import type { Worktree } from '../storage/index.js';

interface OpenTerminalScreenProps {
	groveId: string;
}

export function OpenTerminalScreen({ groveId }: OpenTerminalScreenProps) {
	const { goBack } = useNavigation();
	const [loading, setLoading] = useState(true);
	const [groveName, setGroveName] = useState('');
	const [worktrees, setWorktrees] = useState<Worktree[]>([]);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [resultMessage, setResultMessage] = useState<string | null>(null);

	useEffect(() => {
		console.error(`[OpenTerminalScreen] Starting with groveId: ${groveId}`);

		const groveRef = getGroveById(groveId);
		console.error(`[OpenTerminalScreen] groveRef: ${JSON.stringify(groveRef)}`);

		if (!groveRef) {
			setError('Grove not found');
			setLoading(false);
			return;
		}

		setGroveName(groveRef.name);

		const metadata = readGroveMetadata(groveRef.path);
		console.error(`[OpenTerminalScreen] metadata: ${JSON.stringify(metadata)}`);

		if (!metadata) {
			setError('Grove metadata not found');
			setLoading(false);
			return;
		}

		console.error(`[OpenTerminalScreen] worktrees count: ${metadata.worktrees.length}`);

		if (metadata.worktrees.length === 0) {
			setError('No worktrees found in this grove');
			setLoading(false);
			return;
		}

		// If only one worktree, open terminal directly
		if (metadata.worktrees.length === 1) {
			console.error(
				`[OpenTerminalScreen] Single worktree, opening: ${metadata.worktrees[0].worktreePath}`
			);
			const result = openTerminalInPath(metadata.worktrees[0].worktreePath);
			console.error(`[OpenTerminalScreen] openTerminalInPath result: ${JSON.stringify(result)}`);
			if (result.success) {
				goBack();
			} else {
				setError(result.message);
				setLoading(false);
			}
			return;
		}

		// Multiple worktrees - show selection
		console.error('[OpenTerminalScreen] Multiple worktrees, showing selection');
		setWorktrees(metadata.worktrees);
		setLoading(false);
	}, [groveId, goBack]);

	const handleSelect = (worktree: Worktree) => {
		const result = openTerminalInPath(worktree.worktreePath);
		if (result.success) {
			setResultMessage(`Opened terminal in ${worktree.repositoryName}`);
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

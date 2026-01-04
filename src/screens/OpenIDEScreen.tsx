import React, { useEffect, useState } from 'react';

import { Box, Text, useInput } from 'ink';

import path from 'path';

import { useNavigation } from '../navigation/useNavigation.js';
import { getEffectiveIDEConfig, openIDEInPath } from '../services/index.js';
import { getGroveById, readGroveMetadata, readSettings } from '../storage/index.js';
import type { IDEConfig, Worktree } from '../storage/index.js';

interface OpenIDEScreenProps {
	groveId: string;
}

type SelectionOption = { type: 'all' } | { type: 'worktree'; worktree: Worktree };

export function OpenIDEScreen({ groveId }: OpenIDEScreenProps) {
	const { goBack } = useNavigation();
	const [loading, setLoading] = useState(true);
	const [groveName, setGroveName] = useState('');
	const [worktrees, setWorktrees] = useState<Worktree[]>([]);
	const [ideConfig, setIdeConfig] = useState<IDEConfig | undefined>(undefined);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [resultMessage, setResultMessage] = useState<string | null>(null);

	// Build selection options: "All" + individual worktrees
	const options: SelectionOption[] =
		worktrees.length > 1
			? [
					{ type: 'all' as const },
					...worktrees.map((wt) => ({ type: 'worktree' as const, worktree: wt })),
				]
			: worktrees.map((wt) => ({ type: 'worktree' as const, worktree: wt }));

	useEffect(() => {
		// Read IDE config from settings
		const settings = readSettings();
		if (!settings.selectedIDE) {
			setError('No IDE configured. Please configure an IDE in Settings.');
			setLoading(false);
			return;
		}

		const config = getEffectiveIDEConfig(settings.selectedIDE, settings.ideConfigs);
		setIdeConfig(config);

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

		// If only one worktree, open IDE directly
		if (metadata.worktrees.length === 1) {
			const worktree = metadata.worktrees[0];
			const targetPath = getWorktreePath(worktree);
			const result = openIDEInPath(targetPath, config);
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

	/**
	 * Get the path to open in IDE for a worktree
	 * For monorepos, returns the project folder path
	 */
	const getWorktreePath = (worktree: Worktree): string => {
		if (worktree.projectPath) {
			return path.join(worktree.worktreePath, worktree.projectPath);
		}
		return worktree.worktreePath;
	};

	const handleSelectAll = () => {
		let successCount = 0;
		let failedCount = 0;

		for (const worktree of worktrees) {
			const targetPath = getWorktreePath(worktree);
			const result = openIDEInPath(targetPath, ideConfig);
			if (result.success) {
				successCount++;
			} else {
				failedCount++;
			}
		}

		if (failedCount === 0) {
			setResultMessage(`Opened ${successCount} worktrees in IDE`);
		} else {
			setResultMessage(`Opened ${successCount} worktrees, ${failedCount} failed`);
		}
		// Go back after a short delay to show the message
		setTimeout(() => goBack(), 500);
	};

	const handleSelectWorktree = (worktree: Worktree) => {
		const targetPath = getWorktreePath(worktree);
		const result = openIDEInPath(targetPath, ideConfig);
		if (result.success) {
			setResultMessage(`Opened IDE in ${worktree.repositoryName}`);
			// Go back after a short delay to show the message
			setTimeout(() => goBack(), 500);
		} else {
			setError(result.message);
		}
	};

	const handleSelect = (option: SelectionOption) => {
		if (option.type === 'all') {
			handleSelectAll();
		} else {
			handleSelectWorktree(option.worktree);
		}
	};

	useInput(
		(input, key) => {
			if (key.escape) {
				goBack();
			} else if (key.upArrow) {
				setSelectedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
			} else if (key.downArrow) {
				setSelectedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
			} else if (key.return) {
				handleSelect(options[selectedIndex]);
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
				<Text bold>Open in IDE: {groveName}</Text>
			</Box>

			<Box marginBottom={1}>
				<Text dimColor>Select worktree(s) to open:</Text>
			</Box>

			{options.map((option, index) => (
				<Box key={option.type === 'all' ? 'all' : option.worktree.worktreePath}>
					<Text color={selectedIndex === index ? 'cyan' : undefined}>
						{selectedIndex === index ? '> ' : '  '}
						{option.type === 'all' ? (
							<Text bold>Open All ({worktrees.length} worktrees)</Text>
						) : (
							<>
								{option.worktree.repositoryName}
								{option.worktree.projectPath && <Text dimColor> / {option.worktree.projectPath}</Text>}
								<Text dimColor> ({option.worktree.branch})</Text>
							</>
						)}
					</Text>
				</Box>
			))}

			<Box marginTop={1}>
				<Text dimColor>Up/Down Navigate - Enter Select - ESC Cancel</Text>
			</Box>
		</Box>
	);
}

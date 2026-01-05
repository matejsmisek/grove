import React, { useEffect, useState } from 'react';

import { Box, Text, useInput } from 'ink';

import path from 'path';

import { useService } from '../di/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import {
	getIDEDisplayName,
	openIDEInPath,
	openTerminalInPath,
	resolveIDEForPath,
} from '../services/index.js';
import type { FileChangeStats } from '../services/interfaces.js';
import { ClaudeSessionServiceToken, GitServiceToken } from '../services/tokens.js';
import {
	GroveConfigService,
	getGroveById,
	readGroveMetadata,
	readSettings,
} from '../storage/index.js';
import type { Settings, Worktree } from '../storage/types.js';

interface WorktreeDetails {
	worktree: Worktree;
	branch: string;
	fileStats: FileChangeStats;
	hasUnpushedCommits: boolean;
}

interface GroveDetailScreenProps {
	groveId: string;
}

// Singleton instance for GroveConfigService
const groveConfigService = new GroveConfigService();

/**
 * Get the path to open for a worktree (including project path for monorepos)
 */
function getWorktreePath(worktree: Worktree): string {
	if (worktree.projectPath) {
		return path.join(worktree.worktreePath, worktree.projectPath);
	}
	return worktree.worktreePath;
}

/**
 * Get the effective IDE config for a worktree
 */
function getIDEConfigForWorktree(worktree: Worktree, settings: Settings, targetPath: string) {
	// Check if the worktree's repository has an IDE config in .grove.json
	const repoIDEConfig = groveConfigService.getIDEConfigForSelection(
		worktree.repositoryPath,
		worktree.projectPath
	);

	if (repoIDEConfig) {
		// If it's a reference to a global IDE type (e.g., "@phpstorm")
		if ('ideType' in repoIDEConfig) {
			const { resolvedType, config } = resolveIDEForPath(
				repoIDEConfig.ideType,
				targetPath,
				settings.ideConfigs
			);
			return { config, resolvedType };
		}
		// If it's a custom IDE config
		return { config: repoIDEConfig.ideConfig };
	}

	// Fall back to the default IDE from settings
	if (!settings.selectedIDE) {
		return { config: undefined };
	}
	const { resolvedType, config } = resolveIDEForPath(
		settings.selectedIDE,
		targetPath,
		settings.ideConfigs
	);
	return { config, resolvedType };
}

export function GroveDetailScreen({ groveId }: GroveDetailScreenProps) {
	const { goBack, navigate } = useNavigation();
	const gitService = useService(GitServiceToken);
	const claudeSessionService = useService(ClaudeSessionServiceToken);
	const [loading, setLoading] = useState(true);
	const [groveName, setGroveName] = useState('');
	const [grovePath, setGrovePath] = useState('');
	const [worktreeDetails, setWorktreeDetails] = useState<WorktreeDetails[]>([]);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [showActions, setShowActions] = useState(false);
	const [selectedActionIndex, setSelectedActionIndex] = useState(0);
	const [resultMessage, setResultMessage] = useState<string | null>(null);

	// Load grove details on mount
	useEffect(() => {
		async function loadDetails() {
			try {
				const groveRef = getGroveById(groveId);
				if (!groveRef) {
					setError('Grove not found');
					setLoading(false);
					return;
				}

				setGroveName(groveRef.name);
				setGrovePath(groveRef.path);

				const metadata = readGroveMetadata(groveRef.path);
				if (!metadata) {
					setError('Grove metadata not found');
					setLoading(false);
					return;
				}

				// Fetch details for each worktree in parallel
				const detailsPromises = metadata.worktrees.map(async (worktree) => {
					const [branch, fileStats, hasUnpushed] = await Promise.all([
						gitService.getCurrentBranch(worktree.worktreePath),
						gitService.getFileChangeStats(worktree.worktreePath),
						gitService.hasUnpushedCommits(worktree.worktreePath),
					]);

					return {
						worktree,
						branch,
						fileStats,
						hasUnpushedCommits: hasUnpushed,
					};
				});

				const details = await Promise.all(detailsPromises);
				setWorktreeDetails(details);
				setLoading(false);
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : 'Unknown error';
				setError(errorMsg);
				setLoading(false);
			}
		}

		loadDetails();
	}, [groveId]);

	// Worktree action handlers
	const handleOpenInClaude = () => {
		const selectedWorktree = worktreeDetails[selectedIndex].worktree;
		const targetPath = getWorktreePath(selectedWorktree);
		const result = claudeSessionService.openSession(
			targetPath,
			selectedWorktree.repositoryPath,
			selectedWorktree.projectPath
		);
		setShowActions(false);
		if (result.success) {
			setResultMessage(`Opened Claude session in ${selectedWorktree.repositoryName}`);
			setTimeout(() => setResultMessage(null), 2000);
		} else {
			setError(result.message);
		}
	};

	const handleOpenInTerminal = () => {
		const settings = readSettings();
		if (!settings.terminal) {
			setShowActions(false);
			setError('No terminal configured. Please restart Grove to detect available terminals.');
			return;
		}

		const selectedWorktree = worktreeDetails[selectedIndex].worktree;
		const targetPath = getWorktreePath(selectedWorktree);
		const result = openTerminalInPath(targetPath, settings.terminal);
		setShowActions(false);
		if (result.success) {
			setResultMessage(`Opened terminal in ${selectedWorktree.repositoryName}`);
			setTimeout(() => setResultMessage(null), 2000);
		} else {
			setError(result.message);
		}
	};

	const handleOpenInIDE = () => {
		const settings = readSettings();
		const selectedWorktree = worktreeDetails[selectedIndex].worktree;
		const targetPath = getWorktreePath(selectedWorktree);

		// Get the IDE config for this worktree
		const { config, resolvedType } = getIDEConfigForWorktree(selectedWorktree, settings, targetPath);

		if (!config) {
			setShowActions(false);
			setError('No IDE configured. Please configure an IDE in Settings or .grove.json.');
			return;
		}

		const result = openIDEInPath(targetPath, config);
		setShowActions(false);
		if (result.success) {
			const ideName = resolvedType ? getIDEDisplayName(resolvedType) : 'IDE';
			setResultMessage(`Opened ${ideName} in ${selectedWorktree.repositoryName}`);
			setTimeout(() => setResultMessage(null), 2000);
		} else {
			setError(result.message);
		}
	};

	// Worktree action options
	const worktreeActions = [
		{
			label: 'Open in Claude',
			action: handleOpenInClaude,
		},
		{
			label: 'Open in Terminal',
			action: handleOpenInTerminal,
		},
		{
			label: 'Open in IDE',
			action: handleOpenInIDE,
		},
	];

	// Handle keyboard navigation
	useInput(
		(input, key) => {
			if (showActions) {
				// Actions menu navigation
				if (key.escape) {
					setShowActions(false);
					setSelectedActionIndex(0);
				} else if (key.upArrow) {
					setSelectedActionIndex((prev) => (prev > 0 ? prev - 1 : worktreeActions.length - 1));
				} else if (key.downArrow) {
					setSelectedActionIndex((prev) => (prev < worktreeActions.length - 1 ? prev + 1 : 0));
				} else if (key.return) {
					worktreeActions[selectedActionIndex].action();
				}
			} else {
				// Main screen navigation
				if (key.escape) {
					goBack();
				} else if (key.upArrow && worktreeDetails.length > 0) {
					setSelectedIndex((prev) => (prev > 0 ? prev - 1 : worktreeDetails.length - 1));
				} else if (key.downArrow && worktreeDetails.length > 0) {
					setSelectedIndex((prev) => (prev < worktreeDetails.length - 1 ? prev + 1 : 0));
				} else if (key.return && worktreeDetails.length > 0) {
					setShowActions(true);
					setSelectedActionIndex(0);
				} else if (input === 'c') {
					navigate('closeGrove', { groveId });
				}
			}
		},
		{ isActive: !resultMessage }
	);

	// Format file change stats for display
	const formatFileStats = (stats: FileChangeStats): string => {
		if (stats.total === 0) {
			return 'Clean';
		}

		const parts: string[] = [];
		if (stats.modified > 0) parts.push(`${stats.modified} modified`);
		if (stats.added > 0) parts.push(`${stats.added} added`);
		if (stats.deleted > 0) parts.push(`${stats.deleted} deleted`);
		if (stats.untracked > 0) parts.push(`${stats.untracked} untracked`);

		return parts.join(', ');
	};

	if (loading) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text>Loading grove details...</Text>
			</Box>
		);
	}

	if (error) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="red">Error: {error}</Text>
				<Box marginTop={1}>
					<Text dimColor>Press ESC to go back</Text>
				</Box>
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
			{showActions ? (
				/* Show Actions Menu */
				<Box flexDirection="column">
					{/* Header */}
					<Box marginBottom={1}>
						<Text bold color="green">
							Select Action
						</Text>
					</Box>

					{/* Selected Worktree Info */}
					{worktreeDetails[selectedIndex] && (
						<Box marginBottom={1} flexDirection="column">
							<Text bold>{worktreeDetails[selectedIndex].worktree.repositoryName}</Text>
							{worktreeDetails[selectedIndex].worktree.projectPath && (
								<Text dimColor>Project: {worktreeDetails[selectedIndex].worktree.projectPath}</Text>
							)}
							<Text dimColor>Branch: {worktreeDetails[selectedIndex].branch}</Text>
						</Box>
					)}

					{/* Actions */}
					<Box flexDirection="column" marginBottom={1}>
						{worktreeActions.map((action, index) => (
							<Box key={action.label}>
								<Text color={selectedActionIndex === index ? 'cyan' : undefined}>
									{selectedActionIndex === index ? '❯ ' : '  '}
									{action.label}
								</Text>
							</Box>
						))}
					</Box>

					{/* Help text */}
					<Box marginTop={1}>
						<Text dimColor>↑↓ Navigate • Enter Select • ESC Cancel</Text>
					</Box>
				</Box>
			) : (
				/* Show Grove Details */
				<>
					{/* Header */}
					<Box marginBottom={1} flexDirection="column">
						<Text bold color="green">
							🌳 {groveName}
						</Text>
						<Text dimColor>{grovePath}</Text>
					</Box>

					{/* Worktrees/Panels Section */}
					<Box marginBottom={1}>
						<Text bold underline>
							Panels ({worktreeDetails.length})
						</Text>
					</Box>

					{worktreeDetails.length === 0 ? (
						<Box marginLeft={2}>
							<Text dimColor>No worktrees in this grove</Text>
						</Box>
					) : (
						<Box flexDirection="column">
							{worktreeDetails.map((detail, index) => {
								const isSelected = index === selectedIndex;
								const hasChanges = detail.fileStats.total > 0;

								return (
									<Box
										key={detail.worktree.worktreePath}
										flexDirection="column"
										borderStyle={isSelected ? 'round' : 'single'}
										borderColor={isSelected ? 'cyan' : 'gray'}
										paddingX={1}
										marginBottom={1}
									>
										{/* Repository Name */}
										<Box>
											<Text bold color={isSelected ? 'cyan' : undefined}>
												{detail.worktree.repositoryName}
												{detail.worktree.projectPath && <Text dimColor> / {detail.worktree.projectPath}</Text>}
											</Text>
										</Box>

										{/* Branch */}
										<Box marginTop={0}>
											<Text dimColor>Branch: </Text>
											<Text color="yellow">{detail.branch}</Text>
										</Box>

										{/* File Changes */}
										<Box>
											<Text dimColor>Files: </Text>
											<Text color={hasChanges ? 'yellow' : 'green'}>
												{hasChanges ? `${detail.fileStats.total} changed` : 'Clean'}
											</Text>
											{hasChanges && <Text dimColor> ({formatFileStats(detail.fileStats)})</Text>}
										</Box>

										{/* Unpushed Commits */}
										{detail.hasUnpushedCommits && (
											<Box>
												<Text color="yellow">⚠ Unpushed commits</Text>
											</Box>
										)}
									</Box>
								);
							})}
						</Box>
					)}

					{/* Help text */}
					<Box marginTop={1} flexDirection="column">
						<Text dimColor>
							↑↓ Navigate • <Text bold>Enter</Text> Select • <Text bold>c</Text> Close Grove •{' '}
							<Text bold>ESC</Text> Back
						</Text>
					</Box>
				</>
			)}
		</Box>
	);
}

import React, { useEffect, useState } from 'react';

import { Box, Text, useInput } from 'ink';

import fs from 'fs';
import path from 'path';

import { SessionIndicator } from '../components/SessionIndicator.js';
import { useService } from '../di/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import {
	detectTerminal,
	getIDEDisplayName,
	openIDEInPath,
	openTerminalInPath,
	resolveIDEForPath,
} from '../services/index.js';
import type { BranchUpstreamStatus, FileChangeStats } from '../services/interfaces.js';
import {
	ClaudeSessionServiceToken,
	GitServiceToken,
	GrovesServiceToken,
	SessionsServiceToken,
	SettingsServiceToken,
	WorkspaceServiceToken,
} from '../services/tokens.js';
import { GroveConfigService } from '../storage/index.js';
import type { AgentSession, Settings, Worktree } from '../storage/types.js';

interface WorktreeDetails {
	worktree: Worktree;
	branch: string;
	fileStats: FileChangeStats;
	hasUnpushedCommits: boolean;
	upstreamStatus: BranchUpstreamStatus;
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
	const grovesService = useService(GrovesServiceToken);
	const sessionsService = useService(SessionsServiceToken);
	const settingsService = useService(SettingsServiceToken);
	const workspaceService = useService(WorkspaceServiceToken);
	const [loading, setLoading] = useState(true);
	const [groveName, setGroveName] = useState('');
	const [grovePath, setGrovePath] = useState('');
	const [worktreeDetails, setWorktreeDetails] = useState<WorktreeDetails[]>([]);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [showActions, setShowActions] = useState(false);
	const [selectedActionIndex, setSelectedActionIndex] = useState(0);
	const [resultMessage, setResultMessage] = useState<string | null>(null);
	const [groveSessions, setGroveSessions] = useState<AgentSession[]>([]);

	// Get workspace context to display workspace name
	const workspaceContext = workspaceService.getCurrentContext();
	const workspaceName =
		workspaceContext?.type === 'workspace' ? workspaceContext.config?.name : null;
	const [showInitLog, setShowInitLog] = useState(false);
	const [initLogContent, setInitLogContent] = useState<string>('');

	// Load grove details on mount
	useEffect(() => {
		async function loadDetails() {
			try {
				const groveRef = grovesService.getGroveById(groveId);
				if (!groveRef) {
					setError('Grove not found');
					setLoading(false);
					return;
				}

				setGroveName(groveRef.name);
				setGrovePath(groveRef.path);

				const metadata = grovesService.readGroveMetadata(groveRef.path);
				if (!metadata) {
					setError('Grove metadata not found');
					setLoading(false);
					return;
				}

				// Load agent sessions for this grove
				const sessions = sessionsService.getSessionsByGrove(groveId);
				setGroveSessions(sessions);

				// Fetch details for each worktree in parallel
				const detailsPromises = metadata.worktrees.map(async (worktree) => {
					// Skip git checks for closed worktrees (no longer on disk)
					if (worktree.closed) {
						return {
							worktree,
							branch: worktree.branch,
							fileStats: { modified: 0, added: 0, deleted: 0, untracked: 0, total: 0 },
							hasUnpushedCommits: false,
							upstreamStatus: 'none' as const,
						};
					}

					const [branch, fileStats, hasUnpushed, upstreamStatus] = await Promise.all([
						gitService.getCurrentBranch(worktree.worktreePath),
						gitService.getFileChangeStats(worktree.worktreePath),
						gitService.hasUnpushedCommits(worktree.worktreePath),
						gitService.getBranchUpstreamStatus(worktree.worktreePath),
					]);

					return {
						worktree,
						branch,
						fileStats,
						hasUnpushedCommits: hasUnpushed,
						upstreamStatus,
					};
				});

				const details = await Promise.all(detailsPromises);
				setWorktreeDetails(details);
				// Set initial selection to first non-closed worktree
				const firstOpenIndex = details.findIndex((d) => !d.worktree.closed);
				if (firstOpenIndex !== -1) {
					setSelectedIndex(firstOpenIndex);
				}
				setLoading(false);
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : 'Unknown error';
				setError(errorMsg);
				setLoading(false);
			}
		}

		loadDetails();
	}, [groveId]);

	// Helper function to get session counts for a worktree
	const getSessionCounts = (worktreePath: string) => {
		const worktreeSessions = groveSessions.filter(
			(session) =>
				session.worktreePath === worktreePath && (session.isRunning || session.status === 'closed')
		);

		return {
			activeCount: worktreeSessions.filter((s) => s.status === 'active').length,
			idleCount: worktreeSessions.filter((s) => s.status === 'idle').length,
			attentionCount: worktreeSessions.filter((s) => s.status === 'attention').length,
			closedCount: worktreeSessions.filter((s) => s.status === 'closed').length,
		};
	};

	// Worktree action handlers
	const handleResumeClaude = () => {
		const selectedWorktree = worktreeDetails[selectedIndex].worktree;
		setShowActions(false);
		navigate('resumeClaude', { groveId, worktreePath: selectedWorktree.worktreePath });
	};

	const handleOpenInClaude = () => {
		const selectedWorktree = worktreeDetails[selectedIndex].worktree;
		const targetPath = getWorktreePath(selectedWorktree);
		const result = claudeSessionService.openSession(
			targetPath,
			selectedWorktree.repositoryPath,
			selectedWorktree.projectPath,
			undefined,
			groveName,
			selectedWorktree.name
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
		const settings = settingsService.readSettings();

		// Resolve terminal config, respecting Claude terminal preference
		const terminalConfig = settings.selectedClaudeTerminal
			? (detectTerminal(settings.selectedClaudeTerminal) ?? settings.terminal)
			: settings.terminal;

		if (!terminalConfig) {
			setShowActions(false);
			setError('No terminal configured. Please restart Grove to detect available terminals.');
			return;
		}

		const selectedWorktree = worktreeDetails[selectedIndex].worktree;
		const targetPath = getWorktreePath(selectedWorktree);
		const result = openTerminalInPath(targetPath, terminalConfig);
		setShowActions(false);
		if (result.success) {
			setResultMessage(`Opened terminal in ${selectedWorktree.repositoryName}`);
			setTimeout(() => setResultMessage(null), 2000);
		} else {
			setError(result.message);
		}
	};

	const handleOpenInIDE = () => {
		const settings = settingsService.readSettings();
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

	const handleViewInitLog = () => {
		const selectedWorktree = worktreeDetails[selectedIndex].worktree;
		if (!selectedWorktree.initActionsStatus) {
			setShowActions(false);
			setError('No init actions were executed for this worktree');
			return;
		}

		// Log file is now stored in the grove directory (next to CONTEXT.md)
		const logPath = path.join(grovePath, selectedWorktree.initActionsStatus.logFile);

		try {
			const content = fs.readFileSync(logPath, 'utf-8');
			setInitLogContent(content);
			setShowActions(false);
			setShowInitLog(true);
		} catch (err) {
			setShowActions(false);
			setError(`Failed to read init log: ${err instanceof Error ? err.message : 'Unknown error'}`);
		}
	};

	const handleCloseWorktree = () => {
		const selected = worktreeDetails[selectedIndex].worktree;
		setShowActions(false);
		navigate('closeWorktree', { groveId, worktreePath: selected.worktreePath });
	};

	// Worktree action options (dynamically built based on worktree state)
	const selectedWorktree = worktreeDetails[selectedIndex]?.worktree;
	const isSelectedWorktreeClosed = selectedWorktree?.closed === true;
	// Check if there are active Claude sessions for the selected worktree
	const hasActiveSessions =
		selectedWorktree &&
		!isSelectedWorktreeClosed &&
		groveSessions.some(
			(s) =>
				s.worktreePath === selectedWorktree.worktreePath && s.isRunning && s.agentType === 'claude'
		);

	const worktreeActions = isSelectedWorktreeClosed
		? []
		: [
				// Conditionally add "Resume claude" if there are active sessions
				...(hasActiveSessions
					? [
							{
								label: 'Resume claude',
								action: handleResumeClaude,
							},
						]
					: []),
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
				// Conditionally add "View Init Log" if initActions were executed
				...(selectedWorktree?.initActionsStatus
					? [
							{
								label: 'View Init Log',
								action: handleViewInitLog,
							},
						]
					: []),
				{
					label: 'Close Worktree',
					action: handleCloseWorktree,
				},
			];

	// Find the next non-closed worktree index in a given direction (wraps around)
	const findNextOpenIndex = (current: number, direction: 1 | -1): number => {
		const len = worktreeDetails.length;
		if (len === 0) return 0;
		let next = current;
		for (let i = 0; i < len; i++) {
			next = (next + direction + len) % len;
			if (!worktreeDetails[next]?.worktree.closed) {
				return next;
			}
		}
		return current; // All closed, stay put
	};

	// Determine if we're in single-worktree shortcut mode
	const isSingleWorktreeMode = worktreeDetails.length === 1;

	// Handle keyboard navigation
	useInput(
		(input, key) => {
			if (showInitLog) {
				// Init log viewer navigation
				if (key.escape) {
					setShowInitLog(false);
					setInitLogContent('');
				}
			} else if (showActions || isSingleWorktreeMode) {
				// Actions menu navigation (including single-worktree shortcut mode)
				if (key.escape) {
					if (showActions && !isSingleWorktreeMode) {
						// Multiple worktrees: close actions menu
						setShowActions(false);
						setSelectedActionIndex(0);
					} else {
						// Single worktree or main screen: go back to home
						goBack();
					}
				} else if (key.upArrow && worktreeActions.length > 0) {
					setSelectedActionIndex((prev) => (prev > 0 ? prev - 1 : worktreeActions.length - 1));
				} else if (key.downArrow && worktreeActions.length > 0) {
					setSelectedActionIndex((prev) => (prev < worktreeActions.length - 1 ? prev + 1 : 0));
				} else if (key.return && worktreeActions.length > 0) {
					worktreeActions[selectedActionIndex].action();
				} else if (input === 'c' && isSingleWorktreeMode) {
					// Allow closing grove from single-worktree mode
					navigate('closeGrove', { groveId });
				} else if (input === 'a' && isSingleWorktreeMode) {
					// Allow adding worktree from single-worktree mode
					navigate('addWorktree', { groveId });
				}
			} else {
				// Main screen navigation (multiple worktrees)
				if (key.escape) {
					goBack();
				} else if (key.upArrow && worktreeDetails.length > 0) {
					setSelectedIndex((prev) => findNextOpenIndex(prev, -1));
				} else if (key.downArrow && worktreeDetails.length > 0) {
					setSelectedIndex((prev) => findNextOpenIndex(prev, 1));
				} else if (
					key.return &&
					worktreeDetails.length > 0 &&
					!worktreeDetails[selectedIndex]?.worktree.closed
				) {
					setShowActions(true);
					setSelectedActionIndex(0);
				} else if (input === 'c') {
					navigate('closeGrove', { groveId });
				} else if (input === 'a') {
					navigate('addWorktree', { groveId });
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

	if (showInitLog) {
		return (
			<Box flexDirection="column" padding={1}>
				{/* Header */}
				<Box marginBottom={1} flexDirection="column">
					<Text bold color="green">
						Init Actions Log
					</Text>
					{worktreeDetails[selectedIndex] && (
						<Box>
							<Text dimColor>
								{worktreeDetails[selectedIndex].worktree.repositoryName}
								{worktreeDetails[selectedIndex].worktree.projectPath &&
									` / ${worktreeDetails[selectedIndex].worktree.projectPath}`}
							</Text>
						</Box>
					)}
				</Box>

				{/* Log Content */}
				<Box flexDirection="column" borderStyle="single" borderColor="gray" padding={1}>
					{initLogContent.split('\n').map((line, index) => (
						<Text key={index}>{line}</Text>
					))}
				</Box>

				{/* Help text */}
				<Box marginTop={1}>
					<Text dimColor>ESC Close</Text>
				</Box>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" padding={1}>
			{showActions && !isSingleWorktreeMode ? (
				/* Show Actions Menu (multiple worktrees only) */
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
						<Box>
							<Text bold color="green">
								🌳 {groveName}
							</Text>
							{workspaceName && (
								<Text bold color="cyan">
									{' '}
									→ {workspaceName}
								</Text>
							)}
						</Box>
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
								const isClosed = detail.worktree.closed === true;
								const hasChanges = !isClosed && detail.fileStats.total > 0;
								const sessionCounts = getSessionCounts(detail.worktree.worktreePath);

								return (
									<Box
										key={detail.worktree.worktreePath}
										flexDirection="column"
										borderStyle={isSelected ? 'round' : 'single'}
										borderColor={isClosed ? 'gray' : isSelected ? 'cyan' : 'gray'}
										paddingX={1}
										marginBottom={1}
									>
										{/* Worktree Name with Session Indicator */}
										<Box>
											<Text bold color={isClosed ? 'gray' : isSelected ? 'cyan' : undefined}>
												{detail.worktree.name ||
													(detail.worktree.projectPath
														? `${detail.worktree.repositoryName}/${detail.worktree.projectPath}`
														: detail.worktree.repositoryName)}
											</Text>
											{isClosed && <Text dimColor> (Closed)</Text>}
											{!isClosed &&
												(sessionCounts.activeCount > 0 ||
													sessionCounts.idleCount > 0 ||
													sessionCounts.attentionCount > 0 ||
													sessionCounts.closedCount > 0) && (
													<Box marginLeft={1}>
														<SessionIndicator
															activeCount={sessionCounts.activeCount}
															idleCount={sessionCounts.idleCount}
															attentionCount={sessionCounts.attentionCount}
															closedCount={sessionCounts.closedCount}
														/>
													</Box>
												)}
										</Box>

										{isClosed ? (
											<Box>
												<Text dimColor>Branch: {detail.branch}</Text>
											</Box>
										) : (
											<>
												{/* Branch */}
												<Box marginTop={0}>
													<Text dimColor>Branch: </Text>
													<Text color="yellow">{detail.branch}</Text>
													{detail.upstreamStatus === 'gone' && <Text color="green"> (Merged)</Text>}
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

												{/* InitActions Status */}
												{detail.worktree.initActionsStatus && (
													<Box>
														<Text dimColor>Init Actions: </Text>
														<Text color={detail.worktree.initActionsStatus.success ? 'green' : 'red'}>
															{detail.worktree.initActionsStatus.success ? '✓' : '✗'}{' '}
															{detail.worktree.initActionsStatus.successfulActions}/
															{detail.worktree.initActionsStatus.totalActions} succeeded
														</Text>
													</Box>
												)}
											</>
										)}
									</Box>
								);
							})}
						</Box>
					)}

					{/* Actions Menu (single worktree shortcut) */}
					{isSingleWorktreeMode && worktreeDetails.length > 0 && (
						<>
							<Box marginBottom={1}>
								<Text bold underline>
									Actions
								</Text>
							</Box>

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
						</>
					)}

					{/* Help text */}
					<Box marginTop={1} flexDirection="column">
						{isSingleWorktreeMode ? (
							<Text dimColor>
								↑↓ Navigate • <Text bold>Enter</Text> Select • <Text bold>a</Text> Add Worktree •{' '}
								<Text bold>c</Text> Close Grove • <Text bold>ESC</Text> Back
							</Text>
						) : (
							<Text dimColor>
								↑↓ Navigate • <Text bold>Enter</Text> Select • <Text bold>a</Text> Add Worktree •{' '}
								<Text bold>c</Text> Close Grove • <Text bold>ESC</Text> Back
							</Text>
						)}
					</Box>
				</>
			)}
		</Box>
	);
}

import React, { useEffect, useState } from 'react';

import { Box, Text, useApp, useInput } from 'ink';

import type { GroveAction } from '../components/home/GroveActionsModal.js';
import { GroveActionsModal } from '../components/home/GroveActionsModal.js';
import { GroveGrid } from '../components/home/GroveGrid.js';
import type { MenuOption } from '../components/home/MenuModal.js';
import { MenuModal } from '../components/home/MenuModal.js';
import { useService } from '../di/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import type { FileChangeStats } from '../services/interfaces.js';
import { GitServiceToken } from '../services/tokens.js';
import { getAllGroves, initializeStorage, readGroveMetadata } from '../storage/index.js';
import type { GroveReference, Worktree } from '../storage/index.js';

interface WorktreeDetails {
	worktree: Worktree;
	branch: string;
	fileStats: FileChangeStats;
	hasUnpushedCommits: boolean;
}

export function HomeScreen() {
	const { navigate } = useNavigation();
	const { exit } = useApp();
	const gitService = useService(GitServiceToken);
	const [selectedGroveIndex, setSelectedGroveIndex] = useState(0);
	const [showMenu, setShowMenu] = useState(false);
	const [selectedMenuIndex, setSelectedMenuIndex] = useState(0);
	const [selectedGrove, setSelectedGrove] = useState<GroveReference | null>(null);
	const [selectedGroveActionIndex, setSelectedGroveActionIndex] = useState(0);
	const [worktreeDetails, setWorktreeDetails] = useState<WorktreeDetails[]>([]);
	const [loadingDetails, setLoadingDetails] = useState(false);

	// Initialize storage and get groves
	initializeStorage();
	const groves = getAllGroves();

	// Menu options
	const menuOptions: MenuOption[] = [
		{ label: 'Settings', action: () => navigate('settings', {}) },
		{ label: 'Quit', action: () => exit() },
	];

	// Load worktree details when a grove is selected
	useEffect(() => {
		if (!selectedGrove) {
			setWorktreeDetails([]);
			return;
		}

		async function loadDetails() {
			setLoadingDetails(true);
			try {
				const metadata = readGroveMetadata(selectedGrove!.path);
				if (!metadata) {
					setWorktreeDetails([]);
					setLoadingDetails(false);
					return;
				}

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
			} catch {
				setWorktreeDetails([]);
			}
			setLoadingDetails(false);
		}

		loadDetails();
	}, [selectedGrove]);

	// Format file change stats for display
	const formatFileStats = (stats: FileChangeStats): string => {
		if (stats.total === 0) return 'Clean';
		const parts: string[] = [];
		if (stats.modified > 0) parts.push(`${stats.modified}M`);
		if (stats.added > 0) parts.push(`${stats.added}A`);
		if (stats.deleted > 0) parts.push(`${stats.deleted}D`);
		if (stats.untracked > 0) parts.push(`${stats.untracked}?`);
		return parts.join(' ');
	};

	// Grove action menu (when a grove is selected)
	const groveActions: GroveAction[] = selectedGrove
		? [
				{
					label: 'Open in Chat',
					action: () => {
						// TODO: Implement open in chat
						navigate('chat', {});
						setSelectedGrove(null);
					},
				},
				{
					label: 'Open in Terminal',
					action: () => {
						navigate('openTerminal', { groveId: selectedGrove.id });
						setSelectedGrove(null);
					},
				},
				{
					label: 'Close Grove',
					action: () => {
						navigate('closeGrove', { groveId: selectedGrove.id });
						setSelectedGrove(null);
					},
				},
				{
					label: '← Go Back',
					action: () => {
						setSelectedGrove(null);
					},
				},
			]
		: [];

	useInput((input, key) => {
		if (selectedGrove) {
			// Grove action menu navigation
			if (key.upArrow) {
				setSelectedGroveActionIndex((prev) => (prev > 0 ? prev - 1 : groveActions.length - 1));
			} else if (key.downArrow) {
				setSelectedGroveActionIndex((prev) => (prev < groveActions.length - 1 ? prev + 1 : 0));
			} else if (key.return) {
				groveActions[selectedGroveActionIndex].action();
			} else if (key.escape) {
				setSelectedGrove(null);
			}
		} else if (showMenu) {
			// Menu navigation
			if (key.upArrow) {
				setSelectedMenuIndex((prev) => (prev > 0 ? prev - 1 : menuOptions.length - 1));
			} else if (key.downArrow) {
				setSelectedMenuIndex((prev) => (prev < menuOptions.length - 1 ? prev + 1 : 0));
			} else if (key.return) {
				menuOptions[selectedMenuIndex].action();
				setShowMenu(false);
			} else if (key.escape || input === 'm') {
				setShowMenu(false);
			}
		} else {
			// Main screen navigation
			if (groves.length > 0) {
				if (key.leftArrow) {
					setSelectedGroveIndex((prev) => (prev > 0 ? prev - 1 : groves.length - 1));
				} else if (key.rightArrow) {
					setSelectedGroveIndex((prev) => (prev < groves.length - 1 ? prev + 1 : 0));
				} else if (key.upArrow) {
					setSelectedGroveIndex((prev) => {
						const newIndex = prev - 4;
						return newIndex >= 0 ? newIndex : prev;
					});
				} else if (key.downArrow) {
					setSelectedGroveIndex((prev) => {
						const newIndex = prev + 4;
						return newIndex < groves.length ? newIndex : prev;
					});
				} else if (key.return) {
					// Show grove action menu for the selected grove
					setSelectedGrove(groves[selectedGroveIndex]);
					setSelectedGroveActionIndex(0);
				}
			}

			if (input === 'c' || input === '+') {
				navigate('createGrove', {});
			} else if (input === 'm') {
				setShowMenu(true);
				setSelectedMenuIndex(0);
			}
		}
	});

	return (
		<Box flexDirection="column" padding={1}>
			{/* Show Menu Modal */}
			{showMenu ? (
				<MenuModal
					title="Menu"
					options={menuOptions}
					selectedIndex={selectedMenuIndex}
					helpText="Press ESC or 'm' to close"
				/>
			) : selectedGrove ? (
				/* Show Grove Details + Actions */
				<Box flexDirection="column">
					{/* Grove Header */}
					<Box marginBottom={1}>
						<Text bold color="green">
							🌳 {selectedGrove.name}
						</Text>
					</Box>

					{/* Panels/Worktrees Section */}
					<Box marginBottom={1}>
						<Text bold>Panels</Text>
					</Box>

					{loadingDetails ? (
						<Box marginBottom={1}>
							<Text dimColor>Loading...</Text>
						</Box>
					) : worktreeDetails.length === 0 ? (
						<Box marginBottom={1}>
							<Text dimColor>No worktrees</Text>
						</Box>
					) : (
						<Box flexDirection="column" marginBottom={1}>
							{worktreeDetails.map((detail) => {
								const hasChanges = detail.fileStats.total > 0;
								return (
									<Box
										key={detail.worktree.worktreePath}
										borderStyle="single"
										borderColor="gray"
										paddingX={1}
										marginBottom={0}
										flexDirection="column"
									>
										<Box>
											<Text bold>{detail.worktree.repositoryName}</Text>
											{detail.worktree.projectPath && <Text dimColor> / {detail.worktree.projectPath}</Text>}
										</Box>
										<Box>
											<Text dimColor>Branch: </Text>
											<Text color="yellow">{detail.branch}</Text>
											<Text dimColor> │ Files: </Text>
											<Text color={hasChanges ? 'yellow' : 'green'}>{formatFileStats(detail.fileStats)}</Text>
											{detail.hasUnpushedCommits && <Text color="yellow"> │ ⚠ unpushed</Text>}
										</Box>
									</Box>
								);
							})}
						</Box>
					)}

					{/* Actions */}
					<GroveActionsModal
						grove={selectedGrove}
						actions={groveActions}
						selectedIndex={selectedGroveActionIndex}
						helpText="Press ESC to close"
					/>
				</Box>
			) : (
				/* Show Main Screen */
				<>
					{/* Header */}
					<Box marginBottom={1}>
						<Text bold color="green">
							🌳 Grove
						</Text>
					</Box>

					<Box marginBottom={1}>
						<Text dimColor>AI-powered Git worktree management</Text>
					</Box>

					{/* Groves Grid */}
					{groves.length > 0 ? (
						<Box flexDirection="column" marginTop={1}>
							<Box marginBottom={1}>
								<Text bold>Your Groves</Text>
							</Box>

							<GroveGrid groves={groves} selectedIndex={selectedGroveIndex} />
						</Box>
					) : (
						<Box marginTop={1} marginBottom={1}>
							<Text dimColor>No active groves. Press 'c' to create one!</Text>
						</Box>
					)}

					{/* Help text */}
					<Box marginTop={1} flexDirection="column">
						<Text dimColor>
							{groves.length > 0 ? '↑↓←→ Navigate' : ''} {groves.length > 0 && '• '}
							<Text bold>c</Text> Create {groves.length > 0 && '• Enter Open'} • <Text bold>m</Text> Menu
						</Text>
					</Box>
				</>
			)}
		</Box>
	);
}

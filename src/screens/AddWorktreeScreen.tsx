import React, { useMemo, useState } from 'react';

import { Box, Text, useInput } from 'ink';

import TextInput from 'ink-text-input';

import { useService } from '../di/index.js';
import { getMonorepoProjects } from '../git/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import {
	GroveServiceToken,
	GrovesServiceToken,
	RecentSelectionsServiceToken,
	RepositoryServiceToken,
} from '../services/tokens.js';
import type { RecentSelection, Repository, RepositorySelection } from '../storage/index.js';

type AddWorktreeStep = 'name' | 'repositories' | 'projects' | 'creating' | 'done' | 'error';

/**
 * Represents an item in the combined list (recent or repository)
 */
interface ListItem {
	type: 'recent' | 'repo';
	/** For 'recent' type */
	recent?: RecentSelection;
	/** For 'repo' type */
	repo?: Repository;
	repoIndex?: number;
	/** Display name for the item */
	displayName: string;
}

interface AddWorktreeScreenProps {
	groveId: string;
}

export function AddWorktreeScreen({ groveId }: AddWorktreeScreenProps) {
	const { replace, goBack } = useNavigation();
	const groveService = useService(GroveServiceToken);
	const grovesService = useService(GrovesServiceToken);
	const repositoryService = useService(RepositoryServiceToken);
	const recentSelectionsService = useService(RecentSelectionsServiceToken);

	const [step, setStep] = useState<AddWorktreeStep>('name');
	const [worktreeName, setWorktreeName] = useState('');
	const [repositories] = useState<Repository[]>(() => repositoryService.getAllRepositories());
	const [selectedRepoIndex, setSelectedRepoIndex] = useState<number | null>(null);
	const [cursorIndex, setCursorIndex] = useState(0);
	const [error, setError] = useState<string>('');
	const [logMessages, setLogMessages] = useState<string[]>([]);

	// Project selection state for monorepos
	const [selectedProjectPath, setSelectedProjectPath] = useState<string | null>(null);
	const [projectCursor, setProjectCursor] = useState(0);

	// Get recent selections (filtered to registered repos)
	const recentSelections = useMemo(() => {
		const registeredPaths = new Set(repositories.map((r) => r.path));
		return recentSelectionsService.getRecentSelections(registeredPaths);
	}, [repositories]);

	// Build combined list of recent items + repositories
	const listItems = useMemo((): ListItem[] => {
		const items: ListItem[] = [];

		for (const recent of recentSelections) {
			items.push({
				type: 'recent',
				recent,
				displayName: recentSelectionsService.getRecentSelectionDisplayName(recent),
			});
		}

		for (let i = 0; i < repositories.length; i++) {
			const repo = repositories[i];
			items.push({
				type: 'repo',
				repo,
				repoIndex: i,
				displayName: repo.name,
			});
		}

		return items;
	}, [recentSelections, repositories]);

	// Get grove name for display
	const groveName = useMemo(() => {
		const groveRef = grovesService.getGroveById(groveId);
		return groveRef?.name || 'Unknown Grove';
	}, [groveId, grovesService]);

	// Get selected repository
	const selectedRepo = selectedRepoIndex !== null ? repositories[selectedRepoIndex] : null;

	// Get projects for selected monorepo
	const projects = useMemo(() => {
		if (!selectedRepo || !selectedRepo.isMonorepo) {
			return [];
		}
		return getMonorepoProjects(selectedRepo.path);
	}, [selectedRepo]);

	// Build RepositorySelection from user selections
	const buildSelection = (): RepositorySelection | null => {
		if (selectedRepoIndex === null) {
			return null;
		}

		const repo = repositories[selectedRepoIndex];
		return {
			repository: repo,
			projectPath: selectedProjectPath || undefined,
		};
	};

	// Handle input for name entry
	useInput(
		(_input, key) => {
			if (step !== 'name') return;

			if (key.escape) {
				goBack();
			}
		},
		{ isActive: step === 'name' }
	);

	// Handle input for repository selection
	useInput(
		(input, key) => {
			if (step !== 'repositories') return;

			if (key.upArrow) {
				setCursorIndex((prev) => (prev > 0 ? prev - 1 : listItems.length - 1));
			} else if (key.downArrow) {
				setCursorIndex((prev) => (prev < listItems.length - 1 ? prev + 1 : 0));
			} else if (input === ' ' || key.return) {
				const item = listItems[cursorIndex];
				if (!item) return;

				if (item.type === 'recent' && item.recent) {
					// Find the repo for this recent selection
					const repoIndex = repositories.findIndex((r) => r.path === item.recent!.repositoryPath);
					if (repoIndex === -1) return;

					setSelectedRepoIndex(repoIndex);

					// Recent selections include their project path (or none for whole repo),
					// so skip the project selection step entirely.
					createWorktree(repoIndex, item.recent.projectPath ?? null);
				} else if (item.type === 'repo' && item.repo && item.repoIndex !== undefined) {
					const repo = item.repo;
					const repoIndex = item.repoIndex;
					setSelectedRepoIndex(repoIndex);

					// If monorepo with projects, go to project selection
					if (repo.isMonorepo) {
						const repoProjects = getMonorepoProjects(repo.path);
						if (repoProjects.length > 0) {
							setProjectCursor(0);
							setStep('projects');
							return;
						}
					}

					// Not a monorepo or no projects, proceed to creation
					createWorktree(repoIndex, null);
				}
			} else if (key.escape) {
				// Go back to name entry
				setStep('name');
			}
		},
		{ isActive: step === 'repositories' }
	);

	// Handle input for project selection
	useInput(
		(input, key) => {
			if (step !== 'projects') return;

			if (key.upArrow) {
				setProjectCursor((prev) => (prev > 0 ? prev - 1 : projects.length));
			} else if (key.downArrow) {
				setProjectCursor((prev) => (prev < projects.length ? prev + 1 : 0));
			} else if (input === ' ' || key.return) {
				// Select project (or whole repo if cursor is on "Entire repository")
				if (projectCursor === projects.length) {
					// "Entire repository" selected
					createWorktree(selectedRepoIndex!, null);
				} else {
					// Specific project selected
					const projectPath = projects[projectCursor];
					setSelectedProjectPath(projectPath);
					createWorktree(selectedRepoIndex!, projectPath);
				}
			} else if (key.escape) {
				// Go back to repository selection
				setSelectedRepoIndex(null);
				setStep('repositories');
			}
		},
		{ isActive: step === 'projects' }
	);

	// Handle escape key for other steps
	useInput(
		(_input, key) => {
			if (key.escape) {
				goBack();
			}
		},
		{ isActive: step === 'error' || step === 'done' }
	);

	const handleNameSubmit = (value: string) => {
		if (!value.trim()) {
			setError('Worktree name cannot be empty');
			setStep('error');
			return;
		}

		setWorktreeName(value.trim());

		if (repositories.length === 0) {
			setError('No repositories registered. Please add repositories in Settings first.');
			setStep('error');
			return;
		}

		setStep('repositories');
	};

	const createWorktree = (repoIndex: number, projectPath: string | null) => {
		setStep('creating');
		setLogMessages([]);

		const selection: RepositorySelection = {
			repository: repositories[repoIndex],
			projectPath: projectPath || undefined,
		};

		// Callback for live log streaming
		const handleLog = (message: string) => {
			setLogMessages((prev) => [...prev, message]);
		};

		groveService
			.addWorktreeToGrove(groveId, selection, worktreeName, handleLog)
			.then(() => {
				recentSelectionsService.addRecentSelections([selection]);
				setStep('done');
				setTimeout(() => replace('groveDetail', { groveId, focusWorktreeName: worktreeName }), 1500);
			})
			.catch((err) => {
				setError(err instanceof Error ? err.message : 'Failed to add worktree');
				setStep('error');
			});
	};

	if (step === 'name') {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="green">
						Add Worktree to: {groveName}
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text>Enter a name for the new worktree:</Text>
				</Box>

				<Box marginBottom={1}>
					<Text dimColor>This name will be used for the worktree folder and branch name.</Text>
				</Box>

				<Box marginBottom={1}>
					<Text color="cyan">Name: </Text>
					<TextInput value={worktreeName} onChange={setWorktreeName} onSubmit={handleNameSubmit} />
				</Box>

				<Box marginTop={1}>
					<Text dimColor>Press Enter to continue, Esc to cancel</Text>
				</Box>
			</Box>
		);
	}

	if (step === 'repositories') {
		const hasRecent = recentSelections.length > 0;

		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="green">
						Add Worktree: {worktreeName}
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text>Select a repository:</Text>
				</Box>

				<Box flexDirection="column" marginLeft={2}>
					{listItems.map((item, index) => {
						const isCursor = index === cursorIndex;
						const showSeparator = hasRecent && item.type === 'repo' && index === recentSelections.length;

						if (item.type === 'recent' && item.recent) {
							const key = item.recent.projectPath
								? `${item.recent.repositoryPath}::${item.recent.projectPath}`
								: item.recent.repositoryPath;
							return (
								<Box key={`recent-${key}`} flexDirection="column">
									{index === 0 && (
										<Box marginBottom={0}>
											<Text dimColor>Recently used:</Text>
										</Box>
									)}
									<Box>
										<Text color={isCursor ? 'cyan' : undefined} bold={isCursor}>
											{isCursor ? '❯ ' : '  '}
											<Text color="yellow">★</Text> {item.displayName}
										</Text>
									</Box>
								</Box>
							);
						} else if (item.type === 'repo' && item.repo) {
							const monorepoIndicator = item.repo.isMonorepo ? ' [monorepo]' : '';
							return (
								<Box key={`repo-${item.repo.path}`} flexDirection="column">
									{showSeparator && (
										<Box marginTop={1} marginBottom={0}>
											<Text dimColor>All repositories:</Text>
										</Box>
									)}
									<Box>
										<Text color={isCursor ? 'cyan' : undefined} bold={isCursor}>
											{isCursor ? '❯ ' : '  '}
											{item.repo.name}
											<Text dimColor>{monorepoIndicator}</Text>
										</Text>
									</Box>
								</Box>
							);
						}
						return null;
					})}
				</Box>

				<Box marginTop={1} flexDirection="column">
					<Text dimColor>• Use ↑/↓ to navigate</Text>
					<Text dimColor>• Enter or Space to select</Text>
					<Text dimColor>• Esc to go back</Text>
				</Box>
			</Box>
		);
	}

	if (step === 'projects') {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="green">
						Add Worktree: {worktreeName}
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text>
						Select a project from <Text color="yellow">{selectedRepo?.name}</Text>:
					</Text>
				</Box>

				<Box flexDirection="column" marginLeft={2}>
					{projects.map((projectPath, index) => {
						const isCursor = index === projectCursor;

						return (
							<Box key={projectPath}>
								<Text color={isCursor ? 'cyan' : undefined} bold={isCursor}>
									{isCursor ? '❯ ' : '  '}
									{projectPath}
								</Text>
							</Box>
						);
					})}
					{/* Option to select entire repository */}
					<Box marginTop={1}>
						<Text
							color={projectCursor === projects.length ? 'cyan' : undefined}
							bold={projectCursor === projects.length}
						>
							{projectCursor === projects.length ? '❯ ' : '  '}
							<Text dimColor>(Entire repository)</Text>
						</Text>
					</Box>
				</Box>

				<Box marginTop={1} flexDirection="column">
					<Text dimColor>• Use ↑/↓ to navigate</Text>
					<Text dimColor>• Enter or Space to select</Text>
					<Text dimColor>• Esc to go back</Text>
				</Box>
			</Box>
		);
	}

	if (step === 'creating') {
		const selection = buildSelection();
		const displayName = selection?.projectPath
			? `${selection.repository.name}/${selection.projectPath}`
			: selection?.repository.name || '';

		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="green">
						Adding Worktree: {worktreeName}
					</Text>
				</Box>
				<Box marginBottom={1}>
					<Text dimColor>Creating worktree from {displayName}...</Text>
				</Box>

				{/* Live log output */}
				{logMessages.length > 0 && (
					<Box flexDirection="column" borderStyle="single" borderColor="gray" padding={1} marginTop={1}>
						{logMessages.slice(-15).map((msg, index) => (
							<Text key={index} dimColor>
								{msg}
							</Text>
						))}
					</Box>
				)}
			</Box>
		);
	}

	if (step === 'done') {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="green">
						✓ Worktree Added Successfully!
					</Text>
				</Box>
				<Text>Worktree "{worktreeName}" has been added to the grove.</Text>
				<Box marginTop={1}>
					<Text dimColor>Returning to grove detail...</Text>
				</Box>
			</Box>
		);
	}

	if (step === 'error') {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="red">
						Error
					</Text>
				</Box>
				<Text color="red">{error}</Text>
				<Box marginTop={1}>
					<Text dimColor>Press Esc to go back</Text>
				</Box>
			</Box>
		);
	}

	return null;
}

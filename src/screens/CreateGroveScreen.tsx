import React, { useMemo, useState } from 'react';

import { Box, Text, useInput } from 'ink';

import TextInput from 'ink-text-input';

import { useService } from '../di/index.js';
import { getMonorepoProjects } from '../git/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import { GroveServiceToken, LLMServiceToken, RepositoryServiceToken } from '../services/tokens.js';
import {
	addRecentSelections,
	getRecentSelectionDisplayName,
	getRecentSelections,
} from '../storage/index.js';
import type { RecentSelection, Repository, RepositorySelection } from '../storage/index.js';

type CreateStep =
	| 'description'
	| 'generating'
	| 'generated'
	| 'name'
	| 'repositories'
	| 'projects'
	| 'creating'
	| 'done'
	| 'error';

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

export function CreateGroveScreen() {
	const { replace, goBack } = useNavigation();
	const groveService = useService(GroveServiceToken);
	const llmService = useService(LLMServiceToken);
	const repositoryService = useService(RepositoryServiceToken);

	// Start at 'description' if LLM is configured, otherwise start at 'name' (offline mode)
	const [step, setStep] = useState<CreateStep>(() =>
		llmService.isConfigured() ? 'description' : 'name'
	);
	const [description, setDescription] = useState('');
	const [groveName, setGroveName] = useState('');
	const [repositories] = useState<Repository[]>(() => repositoryService.getAllRepositories());
	const [selectedRepoIndices, setSelectedRepoIndices] = useState<Set<number>>(new Set());
	const [cursorIndex, setCursorIndex] = useState(0);
	const [error, setError] = useState<string>('');
	const [logMessages, setLogMessages] = useState<string[]>([]);

	// Project selection state for monorepos
	const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
	const [projectCursor, setProjectCursor] = useState(0);

	// Recent selections state
	const [selectedRecentKeys, setSelectedRecentKeys] = useState<Set<string>>(new Set());

	// Get recent selections (filtered to registered repos)
	const recentSelections = useMemo(() => {
		const registeredPaths = new Set(repositories.map((r) => r.path));
		return getRecentSelections(registeredPaths);
	}, [repositories]);

	// Build combined list of recent items + repositories
	const listItems = useMemo((): ListItem[] => {
		const items: ListItem[] = [];

		// Add recent selections first
		for (const recent of recentSelections) {
			items.push({
				type: 'recent',
				recent,
				displayName: getRecentSelectionDisplayName(recent),
			});
		}

		// Add all repositories
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

	// Generate key for recent selection
	const getRecentKey = (recent: RecentSelection): string => {
		return recent.projectPath
			? `${recent.repositoryPath}::${recent.projectPath}`
			: recent.repositoryPath;
	};

	// Get selected repositories
	const selectedRepos = useMemo(
		() => Array.from(selectedRepoIndices).map((index) => repositories[index]),
		[selectedRepoIndices, repositories]
	);

	// Get monorepos that are selected
	const selectedMonorepos = useMemo(
		() => selectedRepos.filter((repo) => repo.isMonorepo),
		[selectedRepos]
	);

	// Get non-monorepo selections
	const nonMonorepoRepos = useMemo(
		() => selectedRepos.filter((repo) => !repo.isMonorepo),
		[selectedRepos]
	);

	// Build flat list of all projects from selected monorepos for navigation
	const allProjects = useMemo(() => {
		const projects: { repo: Repository; projectPath: string }[] = [];
		for (const repo of selectedMonorepos) {
			const repoProjects = getMonorepoProjects(repo.path);
			for (const projectPath of repoProjects) {
				projects.push({ repo, projectPath });
			}
		}
		return projects;
	}, [selectedMonorepos]);

	// Generate unique key for project selection
	const getProjectKey = (repoPath: string, projectPath: string): string => {
		return `${repoPath}::${projectPath}`;
	};

	// Check if any monorepos are selected (excluding those covered by recent selections)
	const hasMonorepos = selectedMonorepos.length > 0;

	// Build RepositorySelection[] from user selections
	const buildSelections = (): RepositorySelection[] => {
		const selections: RepositorySelection[] = [];
		const addedKeys = new Set<string>();

		// Add selected recent items first
		for (const recent of recentSelections) {
			const key = getRecentKey(recent);
			if (selectedRecentKeys.has(key)) {
				// Find the repository
				const repo = repositories.find((r) => r.path === recent.repositoryPath);
				if (repo) {
					const selectionKey = recent.projectPath ? `${repo.path}::${recent.projectPath}` : repo.path;
					if (!addedKeys.has(selectionKey)) {
						selections.push({
							repository: repo,
							projectPath: recent.projectPath,
						});
						addedKeys.add(selectionKey);
					}
				}
			}
		}

		// Add non-monorepo selections (whole repo)
		for (const repo of nonMonorepoRepos) {
			if (!addedKeys.has(repo.path)) {
				selections.push({ repository: repo });
				addedKeys.add(repo.path);
			}
		}

		// Add monorepo project selections
		for (const repo of selectedMonorepos) {
			const repoProjects = getMonorepoProjects(repo.path);
			const selectedProjectPaths = repoProjects.filter((projectPath) =>
				selectedProjects.has(getProjectKey(repo.path, projectPath))
			);

			if (selectedProjectPaths.length === 0) {
				// If no projects selected, include the whole monorepo
				if (!addedKeys.has(repo.path)) {
					selections.push({ repository: repo });
					addedKeys.add(repo.path);
				}
			} else {
				// Add each selected project as a separate selection
				for (const projectPath of selectedProjectPaths) {
					const key = `${repo.path}::${projectPath}`;
					if (!addedKeys.has(key)) {
						selections.push({ repository: repo, projectPath });
						addedKeys.add(key);
					}
				}
			}
		}

		return selections;
	};

	// Check if we have any selections
	const hasAnySelection = selectedRepoIndices.size > 0 || selectedRecentKeys.size > 0;

	// Handle input for repository selection
	useInput(
		(input, key) => {
			if (step !== 'repositories') return;

			if (key.upArrow) {
				setCursorIndex((prev) => (prev > 0 ? prev - 1 : listItems.length - 1));
			} else if (key.downArrow) {
				setCursorIndex((prev) => (prev < listItems.length - 1 ? prev + 1 : 0));
			} else if (input === ' ') {
				// Toggle selection with spacebar
				const item = listItems[cursorIndex];
				if (item.type === 'recent' && item.recent) {
					const key = getRecentKey(item.recent);
					setSelectedRecentKeys((prev) => {
						const newSet = new Set(prev);
						if (newSet.has(key)) {
							newSet.delete(key);
						} else {
							newSet.add(key);
						}
						return newSet;
					});
				} else if (item.type === 'repo' && item.repoIndex !== undefined) {
					setSelectedRepoIndices((prev) => {
						const newSet = new Set(prev);
						if (newSet.has(item.repoIndex!)) {
							newSet.delete(item.repoIndex!);
						} else {
							newSet.add(item.repoIndex!);
						}
						return newSet;
					});
				}
			} else if (key.return) {
				// Proceed to next step
				// Allow empty grove creation (no repositories selected) - worktrees can be added later

				// If any monorepos are selected (not via recent), go to project selection step
				if (hasMonorepos && allProjects.length > 0) {
					setProjectCursor(0);
					setStep('projects');
				} else {
					// No monorepos (or no selections), proceed directly to creation
					createGrove();
				}
			} else if (key.escape) {
				goBack();
			}
		},
		{ isActive: step === 'repositories' }
	);

	// Handle input for project selection
	useInput(
		(input, key) => {
			if (step !== 'projects') return;

			if (key.upArrow) {
				setProjectCursor((prev) => (prev > 0 ? prev - 1 : allProjects.length - 1));
			} else if (key.downArrow) {
				setProjectCursor((prev) => (prev < allProjects.length - 1 ? prev + 1 : 0));
			} else if (input === ' ') {
				// Toggle project selection with spacebar
				const project = allProjects[projectCursor];
				const key = getProjectKey(project.repo.path, project.projectPath);
				setSelectedProjects((prev) => {
					const newSet = new Set(prev);
					if (newSet.has(key)) {
						newSet.delete(key);
					} else {
						newSet.add(key);
					}
					return newSet;
				});
			} else if (key.return) {
				// Proceed to creation
				createGrove();
			} else if (key.escape) {
				// Go back to repository selection
				setStep('repositories');
			}
		},
		{ isActive: step === 'projects' }
	);

	// Handle input for generated name confirmation
	useInput(
		(input, key) => {
			if (step !== 'generated') return;

			if (input === 'e') {
				// Edit the name manually
				setStep('name');
			} else if (input === 'r') {
				// Regenerate with same description
				handleDescriptionSubmit(description);
			} else if (key.return) {
				// Accept the name
				proceedToRepositorySelection();
			} else if (key.escape) {
				// Go back to description
				setStep('description');
			}
		},
		{ isActive: step === 'generated' }
	);

	// Handle escape key for other steps
	useInput(
		(_input, key) => {
			if (key.escape) {
				goBack();
			}
		},
		{ isActive: step === 'description' || step === 'name' || step === 'error' || step === 'done' }
	);

	const handleDescriptionSubmit = (value: string) => {
		const trimmed = value.trim();

		// Allow empty description to skip to manual name entry
		if (!trimmed) {
			setStep('name');
			return;
		}

		setDescription(trimmed);

		// Generate name using LLM
		setStep('generating');
		llmService
			.generateGroveName(trimmed)
			.then((result) => {
				setGroveName(result.name);
				setStep('generated');
			})
			.catch((err) => {
				setError(err instanceof Error ? err.message : 'Failed to generate grove name');
				setStep('error');
			});
	};

	const proceedToRepositorySelection = () => {
		if (!groveName.trim()) {
			setError('Grove name cannot be empty');
			setStep('error');
			return;
		}

		if (repositories.length === 0) {
			setError('No repositories registered. Please add repositories in Settings first.');
			setStep('error');
			return;
		}

		setStep('repositories');
	};

	const handleNameSubmit = (value: string) => {
		if (!value.trim()) {
			setError('Grove name cannot be empty');
			setStep('error');
			return;
		}

		setGroveName(value.trim());
		proceedToRepositorySelection();
	};

	const createGrove = () => {
		setStep('creating');
		setLogMessages([]); // Clear previous logs

		const selections = buildSelections();

		// Callback for live log streaming
		const handleLog = (message: string) => {
			setLogMessages((prev) => [...prev, message]);
		};

		groveService
			.createGrove(groveName, selections, handleLog)
			.then((metadata) => {
				// Save selections to recent history
				addRecentSelections(selections);
				setStep('done');
				setTimeout(() => replace('groveDetail', { groveId: metadata.id }), 1500);
			})
			.catch((err) => {
				setError(err instanceof Error ? err.message : 'Failed to create grove');
				setStep('error');
			});
	};

	if (step === 'description') {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="green">
						Create New Grove
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text>Describe what you'll be working on:</Text>
					<Text dimColor>(or press Enter with empty input to enter name manually)</Text>
				</Box>

				<Box marginBottom={1}>
					<Text color="cyan">Description: </Text>
					<TextInput value={description} onChange={setDescription} onSubmit={handleDescriptionSubmit} />
				</Box>

				<Box marginTop={1}>
					<Text dimColor>AI will generate a grove name from your description</Text>
					<Text dimColor>Press Enter to continue, Esc to cancel</Text>
				</Box>
			</Box>
		);
	}

	if (step === 'generating') {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="green">
						Generating Grove Name...
					</Text>
				</Box>
				<Text>AI is generating a name based on your description...</Text>
				<Box marginTop={1}>
					<Text dimColor>"{description}"</Text>
				</Box>
			</Box>
		);
	}

	if (step === 'generated') {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="green">
						Grove Name Generated
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text>AI generated this name:</Text>
				</Box>

				<Box marginBottom={1} marginLeft={2}>
					<Text bold color="cyan">
						{groveName}
					</Text>
				</Box>

				<Box marginTop={1} flexDirection="column">
					<Text>What would you like to do?</Text>
					<Text dimColor> • Press Enter to accept this name</Text>
					<Text dimColor> • Press 'e' to edit manually</Text>
					<Text dimColor> • Press 'r' to regenerate</Text>
					<Text dimColor> • Press Esc to go back</Text>
				</Box>
			</Box>
		);
	}

	if (step === 'name') {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="green">
						Create New Grove
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text>Enter a name for your grove:</Text>
				</Box>

				<Box marginBottom={1}>
					<Text color="cyan">Name: </Text>
					<TextInput value={groveName} onChange={setGroveName} onSubmit={handleNameSubmit} />
				</Box>

				<Box marginTop={1}>
					<Text dimColor>Press Enter to continue, Esc to cancel</Text>
				</Box>
			</Box>
		);
	}

	if (step === 'repositories') {
		const hasRecent = recentSelections.length > 0;
		const totalSelected = selectedRepoIndices.size + selectedRecentKeys.size;

		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="green">
						Create Grove: {groveName}
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text>Select repositories to include (Space to toggle, Enter to continue):</Text>
				</Box>

				<Box flexDirection="column" marginLeft={2}>
					{listItems.map((item, index) => {
						const isCursor = index === cursorIndex;

						// Add separator before repositories if we have recent items
						const showSeparator = hasRecent && item.type === 'repo' && index === recentSelections.length;

						if (item.type === 'recent' && item.recent) {
							const key = getRecentKey(item.recent);
							const isSelected = selectedRecentKeys.has(key);
							return (
								<Box key={`recent-${key}`} flexDirection="column">
									{index === 0 && (
										<Box marginBottom={0}>
											<Text dimColor>Recently used:</Text>
										</Box>
									)}
									<Box>
										<Text color={isCursor ? 'cyan' : undefined} bold={isCursor}>
											{isCursor ? '❯ ' : '  '}[{isSelected ? '✓' : ' '}] <Text color="yellow">★</Text>{' '}
											{item.displayName}
										</Text>
									</Box>
								</Box>
							);
						} else if (item.type === 'repo' && item.repo && item.repoIndex !== undefined) {
							const isSelected = selectedRepoIndices.has(item.repoIndex);
							const monorepoIndicator = item.repo.isMonorepo ? ' [monorepo]' : '';
							return (
								<Box key={`repo-${item.repoIndex}`} flexDirection="column">
									{showSeparator && (
										<Box marginTop={1} marginBottom={0}>
											<Text dimColor>All repositories:</Text>
										</Box>
									)}
									<Box>
										<Text color={isCursor ? 'cyan' : undefined} bold={isCursor}>
											{isCursor ? '❯ ' : '  '}[{isSelected ? '✓' : ' '}] {item.displayName}
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
					<Text dimColor>• Space to toggle selection</Text>
					<Text dimColor>
						• Enter to {hasMonorepos ? 'select projects' : 'create grove'}
						{!hasAnySelection && ' (empty grove - add worktrees later)'}
					</Text>
					<Text dimColor>• Esc to cancel</Text>
				</Box>

				<Box marginTop={1}>
					<Text color="yellow">
						Selected: {totalSelected} / {listItems.length}
					</Text>
				</Box>
			</Box>
		);
	}

	if (step === 'projects') {
		// Group projects by repository for display
		let currentRepo = '';

		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="green">
						Create Grove: {groveName}
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text>Select projects from monorepos (Space to toggle, Enter to create):</Text>
				</Box>

				<Box flexDirection="column" marginLeft={2}>
					{allProjects.map((project, index) => {
						const key = getProjectKey(project.repo.path, project.projectPath);
						const isSelected = selectedProjects.has(key);
						const isCursor = index === projectCursor;

						// Show repository header when it changes
						const showHeader = project.repo.path !== currentRepo;
						currentRepo = project.repo.path;

						return (
							<Box key={key} flexDirection="column">
								{showHeader && (
									<Box marginTop={index > 0 ? 1 : 0}>
										<Text color="yellow" bold>
											{project.repo.name}:
										</Text>
									</Box>
								)}
								<Box marginLeft={2}>
									<Text color={isCursor ? 'cyan' : undefined} bold={isCursor}>
										{isCursor ? '❯ ' : '  '}[{isSelected ? '✓' : ' '}] {project.projectPath}
									</Text>
								</Box>
							</Box>
						);
					})}
				</Box>

				<Box marginTop={1} flexDirection="column">
					<Text dimColor>• Use ↑/↓ to navigate</Text>
					<Text dimColor>• Space to toggle selection</Text>
					<Text dimColor>• Enter to create grove</Text>
					<Text dimColor>• Esc to go back</Text>
				</Box>

				<Box marginTop={1}>
					<Text color="yellow">
						Selected projects: {selectedProjects.size}
						{selectedProjects.size === 0 && <Text dimColor> (will use entire repos)</Text>}
					</Text>
				</Box>
			</Box>
		);
	}

	if (step === 'creating') {
		const selections = buildSelections();
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="green">
						Creating Grove: {groveName}
					</Text>
				</Box>
				<Box marginBottom={1}>
					<Text dimColor>Creating {selections.length} worktree(s)...</Text>
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
						✓ Grove Created Successfully!
					</Text>
				</Box>
				<Text>Grove "{groveName}" has been created.</Text>
				<Box marginTop={1}>
					<Text dimColor>Opening grove detail...</Text>
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

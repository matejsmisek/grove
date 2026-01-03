import React, { useMemo, useState } from 'react';

import { Box, Text, useInput } from 'ink';

import TextInput from 'ink-text-input';

import { useService } from '../di/index.js';
import { getMonorepoProjects } from '../git/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import { GroveServiceToken } from '../services/tokens.js';
import { getAllRepositories, initializeStorage } from '../storage/index.js';
import type { Repository, RepositorySelection } from '../storage/index.js';

type CreateStep = 'name' | 'repositories' | 'projects' | 'creating' | 'done' | 'error';

export function CreateGroveScreen() {
	const { navigate, goBack } = useNavigation();
	const groveService = useService(GroveServiceToken);
	const [step, setStep] = useState<CreateStep>('name');
	const [groveName, setGroveName] = useState('');
	const [repositories] = useState<Repository[]>(() => {
		initializeStorage();
		return getAllRepositories();
	});
	const [selectedRepoIndices, setSelectedRepoIndices] = useState<Set<number>>(new Set());
	const [cursorIndex, setCursorIndex] = useState(0);
	const [error, setError] = useState<string>('');

	// Project selection state for monorepos
	const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
	const [projectCursor, setProjectCursor] = useState(0);

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

	// Check if any monorepos are selected
	const hasMonorepos = selectedMonorepos.length > 0;

	// Build RepositorySelection[] from user selections
	const buildSelections = (): RepositorySelection[] => {
		const selections: RepositorySelection[] = [];

		// Add non-monorepo selections (whole repo)
		for (const repo of nonMonorepoRepos) {
			selections.push({ repository: repo });
		}

		// Add monorepo project selections
		for (const repo of selectedMonorepos) {
			const repoProjects = getMonorepoProjects(repo.path);
			const selectedProjectPaths = repoProjects.filter((projectPath) =>
				selectedProjects.has(getProjectKey(repo.path, projectPath))
			);

			if (selectedProjectPaths.length === 0) {
				// If no projects selected, include the whole monorepo
				selections.push({ repository: repo });
			} else {
				// Add each selected project as a separate selection
				for (const projectPath of selectedProjectPaths) {
					selections.push({ repository: repo, projectPath });
				}
			}
		}

		return selections;
	};

	// Handle input for repository selection
	useInput(
		(input, key) => {
			if (step !== 'repositories') return;

			if (key.upArrow) {
				setCursorIndex((prev) => (prev > 0 ? prev - 1 : repositories.length - 1));
			} else if (key.downArrow) {
				setCursorIndex((prev) => (prev < repositories.length - 1 ? prev + 1 : 0));
			} else if (input === ' ') {
				// Toggle selection with spacebar
				setSelectedRepoIndices((prev) => {
					const newSet = new Set(prev);
					if (newSet.has(cursorIndex)) {
						newSet.delete(cursorIndex);
					} else {
						newSet.add(cursorIndex);
					}
					return newSet;
				});
			} else if (key.return) {
				// Proceed to next step
				if (selectedRepoIndices.size === 0) {
					setError('Please select at least one repository');
					setStep('error');
					return;
				}

				// If any monorepos are selected, go to project selection step
				if (hasMonorepos && allProjects.length > 0) {
					setProjectCursor(0);
					setStep('projects');
				} else {
					// No monorepos, proceed directly to creation
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

	// Handle escape key for other steps
	useInput(
		(_input, key) => {
			if (key.escape) {
				goBack();
			}
		},
		{ isActive: step === 'name' || step === 'error' || step === 'done' }
	);

	const createGrove = () => {
		setStep('creating');

		const selections = buildSelections();

		groveService
			.createGrove(groveName, selections)
			.then(() => {
				setStep('done');
				setTimeout(() => navigate('home', {}), 1500);
			})
			.catch((err) => {
				setError(err instanceof Error ? err.message : 'Failed to create grove');
				setStep('error');
			});
	};

	const handleNameSubmit = (value: string) => {
		if (!value.trim()) {
			setError('Grove name cannot be empty');
			setStep('error');
			return;
		}

		setGroveName(value.trim());

		if (repositories.length === 0) {
			setError('No repositories registered. Please add repositories in Settings first.');
			setStep('error');
			return;
		}

		setStep('repositories');
	};

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
					{repositories.map((repo, index) => {
						const isSelected = selectedRepoIndices.has(index);
						const isCursor = index === cursorIndex;
						const monorepoIndicator = repo.isMonorepo ? ' [monorepo]' : '';
						return (
							<Box key={index}>
								<Text color={isCursor ? 'cyan' : undefined} bold={isCursor}>
									{isCursor ? '❯ ' : '  '}[{isSelected ? '✓' : ' '}] {repo.name}
									<Text dimColor>{monorepoIndicator}</Text>
								</Text>
							</Box>
						);
					})}
				</Box>

				<Box marginTop={1} flexDirection="column">
					<Text dimColor>• Use ↑/↓ to navigate</Text>
					<Text dimColor>• Space to toggle selection</Text>
					<Text dimColor>• Enter to {hasMonorepos ? 'select projects' : 'create grove'}</Text>
					<Text dimColor>• Esc to cancel</Text>
				</Box>

				<Box marginTop={1}>
					<Text color="yellow">
						Selected: {selectedRepoIndices.size} / {repositories.length}
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
						Creating Grove...
					</Text>
				</Box>
				<Text>Setting up "{groveName}"</Text>
				<Box marginTop={1}>
					<Text dimColor>Creating {selections.length} worktree(s)...</Text>
				</Box>
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
					<Text dimColor>Returning to home...</Text>
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

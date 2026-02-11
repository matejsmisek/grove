import React, { useMemo, useState } from 'react';

import { Box, Text, useInput } from 'ink';

import TextInput from 'ink-text-input';

import { useService } from '../di/index.js';
import { getMonorepoProjects } from '../git/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import {
	GroveServiceToken,
	GrovesServiceToken,
	RepositoryServiceToken,
} from '../services/tokens.js';
import type { Repository, RepositorySelection } from '../storage/index.js';

type AddWorktreeStep = 'name' | 'repositories' | 'projects' | 'creating' | 'done' | 'error';

interface AddWorktreeScreenProps {
	groveId: string;
}

export function AddWorktreeScreen({ groveId }: AddWorktreeScreenProps) {
	const { replace, goBack } = useNavigation();
	const groveService = useService(GroveServiceToken);
	const grovesService = useService(GrovesServiceToken);
	const repositoryService = useService(RepositoryServiceToken);

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
				setCursorIndex((prev) => (prev > 0 ? prev - 1 : repositories.length - 1));
			} else if (key.downArrow) {
				setCursorIndex((prev) => (prev < repositories.length - 1 ? prev + 1 : 0));
			} else if (input === ' ' || key.return) {
				// Select repository
				const repo = repositories[cursorIndex];
				setSelectedRepoIndex(cursorIndex);

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
				createWorktree(cursorIndex, null);
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
					{repositories.map((repo, index) => {
						const isCursor = index === cursorIndex;
						const monorepoIndicator = repo.isMonorepo ? ' [monorepo]' : '';

						return (
							<Box key={repo.path}>
								<Text color={isCursor ? 'cyan' : undefined} bold={isCursor}>
									{isCursor ? '❯ ' : '  '}
									{repo.name}
									<Text dimColor>{monorepoIndicator}</Text>
								</Text>
							</Box>
						);
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

import React, { useEffect, useMemo, useRef, useState } from 'react';

import { Box, Text, useInput } from 'ink';

import { AsanaNameInput } from '../components/AsanaNameInput.js';
import { RepositorySelector, getRecentKey } from '../components/RepositorySelector.js';
import { useService } from '../di/index.js';
import { getRepoProjects } from '../git/index.js';
import { useMonorepoProjects } from '../hooks/useMonorepoProjects.js';
import { useTask } from '../hooks/useTasks.js';
import { useNavigation } from '../navigation/useNavigation.js';
import {
	AsanaPluginToken,
	GroveServiceToken,
	LLMServiceToken,
	RecentSelectionsServiceToken,
	RepositoryServiceToken,
	TaskServiceToken,
} from '../services/tokens.js';
import type {
	GroveMetadata,
	Repository,
	RepositorySelection,
	WorktreeReference,
} from '../storage/index.js';
import { parseAsanaTaskUrl } from '../utils/index.js';

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

export function CreateGroveScreen() {
	const { replace, goBack } = useNavigation();
	const groveService = useService(GroveServiceToken);
	const llmService = useService(LLMServiceToken);
	const repositoryService = useService(RepositoryServiceToken);
	const recentSelectionsService = useService(RecentSelectionsServiceToken);
	const taskService = useService(TaskServiceToken);
	const asanaPlugin = useService(AsanaPluginToken);

	// Start at 'description' if LLM is configured, otherwise start at 'name' (offline mode)
	const [step, setStep] = useState<CreateStep>(() =>
		llmService.isConfigured() ? 'description' : 'name'
	);
	const [description, setDescription] = useState('');
	const [groveName, setGroveName] = useState('');

	// Asana "Create from Asana" flow. The reference and resolved name are mirrored into refs
	// so createGrove()/proceedToRepositorySelection() read the right values even when they run
	// in the same tick the name resolves (state updates are async).
	const [asanaBusy, setAsanaBusy] = useState(false);
	const [asanaError, setAsanaError] = useState<string>('');
	const asanaReferenceRef = useRef<WorktreeReference | undefined>(undefined);
	const groveNameRef = useRef('');
	const [repositories] = useState<Repository[]>(() => repositoryService.getAllRepositories());
	const [selectedRepoIndices, setSelectedRepoIndices] = useState<Set<number>>(new Set());
	const [cursorIndex, setCursorIndex] = useState(0);
	const [error, setError] = useState<string>('');
	const [nameError, setNameError] = useState<string>('');
	// True while the Asana-URL confirmation modal (inside AsanaNameInput) is open, so the
	// screen suspends its own Esc→goBack handling while the modal owns the key.
	const [asanaConfirmOpen, setAsanaConfirmOpen] = useState(false);

	// When there is exactly one repository to work with (a single registered repo,
	// or repo-scoped mode), we skip the multi-select repository step entirely.
	const singleRepoMode = repositories.length === 1;

	// Id of the background task running the grove creation, observed via useTask.
	const [taskId, setTaskId] = useState<string | null>(null);
	// Selections handed to the creation task, kept for the "creating" summary.
	const [pendingSelections, setPendingSelections] = useState<RepositorySelection[]>([]);
	const navHandledRef = useRef(false);
	const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Project selection state for monorepos
	const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
	const [projectCursor, setProjectCursor] = useState(0);

	// Recent selections state
	const [selectedRecentKeys, setSelectedRecentKeys] = useState<Set<string>>(new Set());

	// Monorepo project folders, loaded asynchronously to avoid blocking the render thread.
	const { projectsByRepo, projectsLoading } = useMonorepoProjects(repositories, getRepoProjects);

	// Get recent selections (filtered to registered repos)
	const recentSelections = useMemo(() => {
		const registeredPaths = new Set(repositories.map((r) => r.path));
		return recentSelectionsService.getRecentSelections(registeredPaths);
	}, [repositories, recentSelectionsService]);

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

	// Build flat list of all projects from selected monorepos for navigation.
	// Reads from the pre-loaded projectsByRepo map (no synchronous IO on render).
	const allProjects = useMemo(() => {
		const projects: { repo: Repository; projectPath: string }[] = [];
		for (const repo of selectedMonorepos) {
			const repoProjects = projectsByRepo.get(repo.path) ?? [];
			for (const projectPath of repoProjects) {
				projects.push({ repo, projectPath });
			}
		}
		return projects;
	}, [selectedMonorepos, projectsByRepo]);

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
			const repoProjects = projectsByRepo.get(repo.path) ?? [];
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

	const toggleRepo = (repoIndex: number) => {
		setSelectedRepoIndices((prev) => {
			const next = new Set(prev);
			if (next.has(repoIndex)) {
				next.delete(repoIndex);
			} else {
				next.add(repoIndex);
			}
			return next;
		});
	};

	const toggleRecent = (key: string) => {
		setSelectedRecentKeys((prev) => {
			const next = new Set(prev);
			if (next.has(key)) {
				next.delete(key);
			} else {
				next.add(key);
			}
			return next;
		});
	};

	// Repository step confirmed (Enter). Go to project selection when monorepos with
	// projects are selected, otherwise create the grove (possibly empty).
	const handleRepositoriesConfirm = () => {
		if (hasMonorepos && allProjects.length > 0) {
			setProjectCursor(0);
			setStep('projects');
		} else {
			createGrove();
		}
	};

	// Handle input for project selection
	useInput(
		(input, key) => {
			if (step !== 'projects') return;

			const projectCount = allProjects.length;

			if (key.upArrow) {
				setProjectCursor((prev) => (prev > 0 ? prev - 1 : Math.max(projectCount - 1, 0)));
			} else if (key.downArrow) {
				setProjectCursor((prev) => (prev < projectCount - 1 ? prev + 1 : 0));
			} else if (singleRepoMode) {
				// Single-repo monorepo: radio-style selection. Enter uses the highlighted
				// project, 'e' creates an empty grove (no worktree yet).
				if (input === 'e') {
					createGrove([]);
				} else if (key.return) {
					if (projectsLoading) {
						return;
					}
					const repo = repositories[0];
					const project = allProjects[projectCursor];
					if (project) {
						createGrove([{ repository: repo, projectPath: project.projectPath }]);
					} else {
						// No projects detected: fall back to a worktree for the whole repo.
						createGrove([{ repository: repo }]);
					}
				} else if (key.escape) {
					// Go back to name entry (there is no repository step in single-repo mode).
					setStep('name');
				}
			} else if (input === ' ') {
				// Multi-repo: toggle project selection with spacebar
				const project = allProjects[projectCursor];
				const projectKey = getProjectKey(project.repo.path, project.projectPath);
				setSelectedProjects((prev) => {
					const newSet = new Set(prev);
					if (newSet.has(projectKey)) {
						newSet.delete(projectKey);
					} else {
						newSet.add(projectKey);
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
		{
			isActive:
				(step === 'description' ||
					step === 'name' ||
					step === 'error' ||
					step === 'done' ||
					step === 'creating') &&
				!asanaConfirmOpen,
		}
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
				groveNameRef.current = result.name;
				setGroveName(result.name);
				setStep('generated');
			})
			.catch((err) => {
				setError(err instanceof Error ? err.message : 'Failed to generate grove name');
				setStep('error');
			});
	};

	const proceedToRepositorySelection = () => {
		const effectiveName = groveNameRef.current || groveName;
		if (!effectiveName.trim()) {
			setError('Grove name cannot be empty');
			setStep('error');
			return;
		}

		if (repositories.length === 0) {
			setError('No repositories registered. Please add repositories in Settings first.');
			setStep('error');
			return;
		}

		// Single repository: auto-select it. A monorepo still needs a project
		// chosen, so go straight to the (single-select) project step; otherwise
		// create the grove for the whole repo immediately.
		if (singleRepoMode) {
			const repo = repositories[0];
			if (repo.isMonorepo) {
				setSelectedRepoIndices(new Set([0]));
				setProjectCursor(0);
				setStep('projects');
			} else {
				createGrove([{ repository: repo }]);
			}
			return;
		}

		setStep('repositories');
	};

	const handleNameSubmit = (value: string) => {
		if (!value.trim()) {
			setNameError('Grove name cannot be empty');
			return;
		}

		setNameError('');
		// Manual name entry carries no external reference.
		asanaReferenceRef.current = undefined;
		groveNameRef.current = value.trim();
		setGroveName(value.trim());
		proceedToRepositorySelection();
	};

	// Resolve the grove name from a pasted Asana task URL, then continue the flow.
	const handleCreateFromAsana = (taskUrl: string) => {
		const parsed = parseAsanaTaskUrl(taskUrl);
		if (!parsed) {
			return;
		}

		if (!asanaPlugin) {
			setAsanaError('Asana plugin is not available.');
			return;
		}

		setAsanaError('');
		setNameError('');
		setAsanaBusy(true);

		asanaPlugin
			.getTask(parsed.gid)
			.then((task) => {
				setAsanaBusy(false);
				asanaReferenceRef.current = { type: 'asana', id: parsed.gid, url: task.url };
				groveNameRef.current = task.name;
				setGroveName(task.name);
				proceedToRepositorySelection();
			})
			.catch((err: unknown) => {
				setAsanaBusy(false);
				setAsanaError(err instanceof Error ? err.message : 'Failed to fetch Asana task');
			});
	};

	const createGrove = (explicitSelections?: RepositorySelection[]) => {
		const selections = explicitSelections ?? buildSelections();
		setPendingSelections(selections);
		navHandledRef.current = false;

		// Use the resolved name (ref stays correct even on a same-tick create) and the
		// external reference resolved via "Create from Asana" (undefined for manual entry).
		const name = groveNameRef.current || groveName;
		const reference = asanaReferenceRef.current;

		// Run the creation as a background task so it survives navigating away
		// from this screen. The task owns the work; this screen only observes it.
		const { id } = taskService.run<GroveMetadata>({
			type: 'createGrove',
			title: `Create grove "${name}"`,
			meta: { groveName: name },
			execute: async (ctx) => {
				const metadata = await groveService.createGrove(name, selections, ctx.log, reference);
				// Save selections to recent history on success, regardless of whether
				// this screen is still mounted.
				recentSelectionsService.addRecentSelections(selections);
				return metadata;
			},
		});

		setTaskId(id);
		setStep('creating');
	};

	// Observe the creation task while this screen is mounted: navigate to the
	// new grove on success, surface the error on failure. If the user has left
	// the screen, the task keeps running and is reachable from Background Tasks.
	const creationTask = useTask(taskId);
	useEffect(() => {
		if (!creationTask || navHandledRef.current) {
			return;
		}

		if (creationTask.status === 'succeeded') {
			navHandledRef.current = true;
			setStep('done');
			const metadata = creationTask.result as GroveMetadata | undefined;
			if (metadata) {
				navTimerRef.current = setTimeout(() => replace('groveDetail', { groveId: metadata.id }), 1500);
			}
		} else if (creationTask.status === 'failed') {
			navHandledRef.current = true;
			setError(creationTask.error?.message ?? 'Failed to create grove');
			setStep('error');
		}
	}, [creationTask, replace]);

	// Clear a pending navigation timer if the screen unmounts first.
	useEffect(() => {
		return () => {
			if (navTimerRef.current) {
				clearTimeout(navTimerRef.current);
			}
		};
	}, []);

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

				<AsanaNameInput
					value={description}
					onChange={(value) => {
						setDescription(value);
						if (asanaError) setAsanaError('');
					}}
					onSubmit={handleDescriptionSubmit}
					onCreateFromAsana={handleCreateFromAsana}
					onConfirmOpenChange={setAsanaConfirmOpen}
					isActive={step === 'description'}
					label="Description: "
					continueLabel="Use the URL as the description"
					busy={asanaBusy}
				/>

				{asanaError && (
					<Box marginTop={1}>
						<Text color="red">{asanaError}</Text>
					</Box>
				)}

				<Box marginTop={1}>
					<Text dimColor>AI will generate a grove name from your description</Text>
					<Text dimColor>Or paste an Asana task URL to name the grove from the task</Text>
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
					<Text dimColor>(or paste an Asana task URL to name it from the task)</Text>
				</Box>

				<AsanaNameInput
					value={groveName}
					onChange={(value) => {
						setGroveName(value);
						groveNameRef.current = value;
						if (nameError) setNameError('');
						if (asanaError) setAsanaError('');
					}}
					onSubmit={handleNameSubmit}
					onCreateFromAsana={handleCreateFromAsana}
					onConfirmOpenChange={setAsanaConfirmOpen}
					isActive={step === 'name'}
					label="Name: "
					continueLabel="Use the URL as the grove name"
					busy={asanaBusy}
				/>

				{nameError && (
					<Box marginTop={1}>
						<Text color="red">{nameError}</Text>
					</Box>
				)}

				{asanaError && (
					<Box marginTop={1}>
						<Text color="red">{asanaError}</Text>
					</Box>
				)}

				<Box marginTop={1}>
					<Text dimColor>Press Enter to continue, Esc to cancel</Text>
				</Box>
			</Box>
		);
	}

	if (step === 'repositories') {
		return (
			<RepositorySelector
				title={`Create Grove: ${groveName}`}
				instruction="Select repositories to include (Space to toggle, Enter to continue):"
				repositories={repositories}
				recent={recentSelections}
				getRecentDisplayName={(r) => recentSelectionsService.getRecentSelectionDisplayName(r)}
				projectsLoading={projectsLoading}
				multiSelect={true}
				cursorIndex={cursorIndex}
				onCursorChange={setCursorIndex}
				selectedRepoIndices={selectedRepoIndices}
				selectedRecentKeys={selectedRecentKeys}
				onToggleRepo={toggleRepo}
				onToggleRecent={toggleRecent}
				onConfirm={handleRepositoriesConfirm}
				onCancel={goBack}
			/>
		);
	}

	if (step === 'projects') {
		// Group projects by repository for display
		let currentRepo = '';

		const title = singleRepoMode ? repositories[0]?.name : 'monorepos';

		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="green">
						Create Grove: {groveName}
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text>
						{singleRepoMode
							? `Select a project from ${title} (Enter to use it):`
							: 'Select projects from monorepos (Space to toggle, Enter to create):'}
					</Text>
				</Box>

				{projectsLoading && allProjects.length === 0 ? (
					<Box marginLeft={2}>
						<Text dimColor>Loading projects…</Text>
					</Box>
				) : allProjects.length === 0 ? (
					<Box marginLeft={2}>
						<Text dimColor>No projects detected — a worktree for the whole repo will be created.</Text>
					</Box>
				) : (
					<Box flexDirection="column" marginLeft={2}>
						{allProjects.map((project, index) => {
							const key = getProjectKey(project.repo.path, project.projectPath);
							const isSelected = selectedProjects.has(key);
							const isCursor = index === projectCursor;

							// Show repository header when it changes (multi-repo only)
							const showHeader = !singleRepoMode && project.repo.path !== currentRepo;
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
									<Box marginLeft={singleRepoMode ? 0 : 2}>
										<Text color={isCursor ? 'cyan' : undefined} bold={isCursor}>
											{isCursor ? '❯ ' : '  '}
											{singleRepoMode ? '' : `[${isSelected ? '✓' : ' '}] `}
											{project.projectPath}
										</Text>
									</Box>
								</Box>
							);
						})}
					</Box>
				)}

				<Box marginTop={1} flexDirection="column">
					<Text dimColor>• Use ↑/↓ to navigate</Text>
					{singleRepoMode ? (
						<>
							<Text dimColor>• Enter to create grove for the highlighted project</Text>
							<Text dimColor>
								• Press <Text color="cyan">e</Text> to create an empty grove (add worktrees later)
							</Text>
							<Text dimColor>• Esc to go back</Text>
						</>
					) : (
						<>
							<Text dimColor>• Space to toggle selection</Text>
							<Text dimColor>• Enter to create grove</Text>
							<Text dimColor>• Esc to go back</Text>
						</>
					)}
				</Box>

				{!singleRepoMode && (
					<Box marginTop={1}>
						<Text color="yellow">
							Selected projects: {selectedProjects.size}
							{selectedProjects.size === 0 && <Text dimColor> (will use entire repos)</Text>}
						</Text>
					</Box>
				)}
			</Box>
		);
	}

	if (step === 'creating') {
		const selections = pendingSelections;
		const logLines = creationTask?.log ?? [];
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
				{logLines.length > 0 && (
					<Box flexDirection="column" borderStyle="single" borderColor="gray" padding={1} marginTop={1}>
						{logLines.slice(-15).map((line, index) => (
							<Text key={index} dimColor>
								{line.text}
							</Text>
						))}
					</Box>
				)}

				<Box marginTop={1}>
					<Text dimColor>Press Esc to keep this running in the background</Text>
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

import React, { useEffect, useMemo, useRef, useState } from 'react';

import { Box, Text, useInput } from 'ink';

import { AsanaNameInput } from '../components/AsanaNameInput.js';
import { ProjectSelector } from '../components/ProjectSelector.js';
import { RepositorySelector } from '../components/RepositorySelector.js';
import { useService } from '../di/index.js';
import { getMonorepoProjects } from '../git/index.js';
import { useMonorepoProjects } from '../hooks/useMonorepoProjects.js';
import { useTask } from '../hooks/useTasks.js';
import { useNavigation } from '../navigation/useNavigation.js';
import { ASANA_PLUGIN_ID, AsanaPlugin } from '../plugins/asana/index.js';
import {
	GroveServiceToken,
	GrovesServiceToken,
	PluginRegistryToken,
	RecentSelectionsServiceToken,
	RepositoryServiceToken,
	TaskServiceToken,
} from '../services/tokens.js';
import type {
	GroveMetadata,
	RecentSelection,
	RepositorySelection,
	WorktreeReference,
} from '../storage/index.js';
import { parseAsanaTaskUrl } from '../utils/index.js';

type AddWorktreeStep = 'name' | 'repositories' | 'projects' | 'creating' | 'done' | 'error';

interface AddWorktreeScreenProps {
	groveId: string;
	/**
	 * When set, the screen runs in "fork" mode: the repository is locked to the same repository
	 * as the worktree at this path, and the new worktree branches off that worktree's branch.
	 * Within a monorepo the user may still pick a different project.
	 */
	forkFromWorktreePath?: string;
}

export function AddWorktreeScreen({ groveId, forkFromWorktreePath }: AddWorktreeScreenProps) {
	const { replace, goBack } = useNavigation();
	const groveService = useService(GroveServiceToken);
	const grovesService = useService(GrovesServiceToken);
	const repositoryService = useService(RepositoryServiceToken);
	const recentSelectionsService = useService(RecentSelectionsServiceToken);
	const taskService = useService(TaskServiceToken);
	const pluginRegistry = useService(PluginRegistryToken);
	const asanaPlugin = pluginRegistry.get(ASANA_PLUGIN_ID) as AsanaPlugin | undefined;

	const [step, setStep] = useState<AddWorktreeStep>('name');
	const [worktreeName, setWorktreeName] = useState('');
	const [repositories] = useState(() => repositoryService.getAllRepositories());
	const [selectedRepoIndex, setSelectedRepoIndex] = useState<number | null>(null);
	const [cursorIndex, setCursorIndex] = useState(0);
	const [error, setError] = useState<string>('');
	const [nameError, setNameError] = useState<string>('');

	// Asana "Create from Asana" flow. The resolved reference is held in a ref so that
	// createWorktree() reads the correct value even when invoked in the same tick that
	// resolves it (state updates are async).
	const [asanaBusy, setAsanaBusy] = useState(false);
	const [asanaError, setAsanaError] = useState<string>('');
	const asanaReferenceRef = useRef<WorktreeReference | undefined>(undefined);
	// Resolved worktree name, mirrored into a ref so createWorktree() uses the right value
	// even when it runs in the same tick the name resolves (e.g. fork mode, Asana fetch).
	const worktreeNameRef = useRef('');

	// Id of the background task running the worktree creation, observed via useTask.
	const [taskId, setTaskId] = useState<string | null>(null);
	const navHandledRef = useRef(false);
	const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Project selection state for monorepos
	const [selectedProjectPath, setSelectedProjectPath] = useState<string | null>(null);
	const [projectCursor, setProjectCursor] = useState(0);

	// Monorepo project folders, loaded asynchronously to avoid blocking the render thread.
	const { projectsByRepo, projectsLoading } = useMonorepoProjects(repositories, getMonorepoProjects);

	// Recent selections (filtered to registered repos)
	const recentSelections = useMemo(() => {
		const registeredPaths = new Set(repositories.map((r) => r.path));
		return recentSelectionsService.getRecentSelections(registeredPaths);
	}, [repositories, recentSelectionsService]);

	// Grove name for display
	const groveName = useMemo(() => {
		const groveRef = grovesService.getGroveById(groveId);
		return groveRef?.name || 'Unknown Grove';
	}, [groveId, grovesService]);

	const isFork = forkFromWorktreePath !== undefined;

	// In fork mode, resolve the source worktree (the one being forked from). The new worktree is
	// locked to the same repository and branches off the source worktree's branch.
	const forkSource = useMemo(() => {
		if (!isFork) return null;
		const groveRef = grovesService.getGroveById(groveId);
		if (!groveRef) return null;
		const metadata = grovesService.readGroveMetadata(groveRef.path);
		if (!metadata) return null;
		const worktree = metadata.worktrees.find((w) => w.worktreePath === forkFromWorktreePath);
		if (!worktree) return null;
		const repoIndex = repositories.findIndex((r) => r.path === worktree.repositoryPath);
		return { worktree, repoIndex };
	}, [isFork, forkFromWorktreePath, groveId, grovesService, repositories]);

	const selectedRepo = selectedRepoIndex !== null ? repositories[selectedRepoIndex] : null;

	// Projects for the selected monorepo (from the pre-loaded map; no render-time IO)
	const projects = useMemo(() => {
		if (!selectedRepo || !selectedRepo.isMonorepo) {
			return [];
		}
		return projectsByRepo.get(selectedRepo.path) ?? [];
	}, [selectedRepo, projectsByRepo]);

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

	const createWorktree = (repoIndex: number, projectPath: string | null) => {
		const selection: RepositorySelection = {
			repository: repositories[repoIndex],
			projectPath: projectPath || undefined,
		};
		navHandledRef.current = false;

		// Use the resolved name (ref stays correct even on a same-tick create).
		const name = worktreeNameRef.current || worktreeName;
		// In fork mode, branch off the source worktree (its branch) and record the parentage.
		const forkParentPath = isFork ? forkFromWorktreePath : undefined;
		// External reference resolved via "Create from Asana" (undefined for manual entry).
		const reference = asanaReferenceRef.current;

		// Run as a background task so it survives navigating away from this screen.
		const { id } = taskService.run<GroveMetadata>({
			type: 'addWorktree',
			title: isFork ? `Fork worktree "${name}"` : `Add worktree "${name}"`,
			meta: { groveId, worktreeName: name },
			execute: async (ctx) => {
				const metadata = await groveService.addWorktreeToGrove(
					groveId,
					selection,
					name,
					ctx.log,
					forkParentPath,
					reference
				);
				recentSelectionsService.addRecentSelections([selection]);
				return metadata;
			},
		});

		setTaskId(id);
		setStep('creating');
	};

	const handleNameSubmit = (value: string) => {
		if (!value.trim()) {
			setNameError('Worktree name cannot be empty');
			return;
		}

		setNameError('');
		// Manual name entry carries no external reference.
		asanaReferenceRef.current = undefined;
		proceedWithName(value.trim());
	};

	// Resolve the worktree name from the pasted Asana task URL, then continue the flow.
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
				proceedWithName(task.name);
			})
			.catch((err: unknown) => {
				setAsanaBusy(false);
				setAsanaError(err instanceof Error ? err.message : 'Failed to fetch Asana task');
			});
	};

	// Advance past the name step with a resolved worktree name (entered manually or
	// fetched from Asana). Picks the repository/project step or jumps straight to
	// creation in fork mode, matching the manual flow.
	const proceedWithName = (name: string) => {
		worktreeNameRef.current = name;
		setWorktreeName(name);

		if (repositories.length === 0) {
			setError('No repositories registered. Please add repositories in Settings first.');
			setStep('error');
			return;
		}

		// Fork mode: the repository is locked to the source worktree's repository, so skip the
		// repository selection step entirely.
		if (isFork) {
			if (!forkSource || forkSource.repoIndex === -1) {
				setError('Could not resolve the repository for the worktree being forked.');
				setStep('error');
				return;
			}

			const repoIndex = forkSource.repoIndex;
			const repo = repositories[repoIndex];
			setSelectedRepoIndex(repoIndex);

			// For a monorepo, let the user pick which project to fork into (same monorepo only).
			if (repo.isMonorepo && (projectsByRepo.get(repo.path) ?? []).length > 0) {
				setProjectCursor(0);
				setStep('projects');
				return;
			}

			// Non-monorepo (or no projects detected): branch straight off the source worktree.
			createWorktree(repoIndex, null);
			return;
		}

		setStep('repositories');
	};

	// Repository chosen in the (non-fork) repository step.
	const handlePickRepo = (repoIndex: number) => {
		const repo = repositories[repoIndex];
		setSelectedRepoIndex(repoIndex);

		// Monorepo with projects: go to project selection. Otherwise create directly.
		if (repo.isMonorepo && (projectsByRepo.get(repo.path) ?? []).length > 0) {
			setProjectCursor(0);
			setStep('projects');
			return;
		}

		createWorktree(repoIndex, null);
	};

	// Recent item chosen: it already carries its project path, so skip the project step.
	const handlePickRecent = (recent: RecentSelection) => {
		const repoIndex = repositories.findIndex((r) => r.path === recent.repositoryPath);
		if (repoIndex === -1) return;
		setSelectedRepoIndex(repoIndex);
		createWorktree(repoIndex, recent.projectPath ?? null);
	};

	// Observe the task while mounted: navigate to the grove on success, surface
	// the error on failure. If the user leaves, it keeps running in the background.
	const creationTask = useTask(taskId);
	useEffect(() => {
		if (!creationTask || navHandledRef.current) {
			return;
		}

		if (creationTask.status === 'succeeded') {
			navHandledRef.current = true;
			setStep('done');
			navTimerRef.current = setTimeout(
				() => replace('groveDetail', { groveId, focusWorktreeName: worktreeName }),
				1500
			);
		} else if (creationTask.status === 'failed') {
			navHandledRef.current = true;
			setError(creationTask.error?.message ?? 'Failed to add worktree');
			setStep('error');
		}
	}, [creationTask, replace, groveId, worktreeName]);

	// Clear a pending navigation timer if the screen unmounts first.
	useEffect(() => {
		return () => {
			if (navTimerRef.current) {
				clearTimeout(navTimerRef.current);
			}
		};
	}, []);

	// Escape handling for the screen-owned steps. The repository/project steps own
	// their own key handling (RepositorySelector / ProjectSelector). During
	// 'creating', Esc leaves the task running in the background.
	useInput(
		(_input, key) => {
			if (key.escape) {
				goBack();
			}
		},
		{ isActive: step === 'name' || step === 'creating' || step === 'done' || step === 'error' }
	);

	if (step === 'name') {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="green">
						{isFork ? 'Fork Worktree in: ' : 'Add Worktree to: '}
						{groveName}
					</Text>
				</Box>

				{isFork && forkSource && (
					<Box marginBottom={1}>
						<Text dimColor>
							Forking from <Text color="yellow">{forkSource.worktree.branch}</Text> (
							{forkSource.worktree.repositoryName})
						</Text>
					</Box>
				)}

				<Box marginBottom={1}>
					<Text>Enter a name for the new worktree:</Text>
				</Box>

				<Box marginBottom={1}>
					<Text dimColor>
						This name will be used for the worktree folder and branch name. Paste an Asana task URL to
						name it from the task.
					</Text>
				</Box>

				<AsanaNameInput
					value={worktreeName}
					onChange={(value) => {
						setWorktreeName(value);
						worktreeNameRef.current = value;
						if (nameError) setNameError('');
						if (asanaError) setAsanaError('');
					}}
					onSubmit={handleNameSubmit}
					onCreateFromAsana={handleCreateFromAsana}
					isActive={step === 'name'}
					label="Name: "
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
				title={`Add Worktree: ${worktreeName}`}
				instruction="Select a repository:"
				repositories={repositories}
				recent={recentSelections}
				getRecentDisplayName={(r) => recentSelectionsService.getRecentSelectionDisplayName(r)}
				projectsLoading={projectsLoading}
				multiSelect={false}
				cursorIndex={cursorIndex}
				onCursorChange={setCursorIndex}
				onPickRecent={handlePickRecent}
				onPickRepo={handlePickRepo}
				onCancel={() => setStep('name')}
			/>
		);
	}

	if (step === 'projects') {
		return (
			<ProjectSelector
				title={`${isFork ? 'Fork Worktree: ' : 'Add Worktree: '}${worktreeName}`}
				repoName={selectedRepo?.name ?? ''}
				projects={projects}
				cursor={projectCursor}
				onCursorChange={setProjectCursor}
				onPickProject={(projectPath) => {
					setSelectedProjectPath(projectPath);
					createWorktree(selectedRepoIndex!, projectPath);
				}}
				onPickEntireRepo={() => createWorktree(selectedRepoIndex!, null)}
				onCancel={() => {
					if (isFork) {
						// Fork mode skips repository selection; go back to name entry.
						setStep('name');
					} else {
						setSelectedRepoIndex(null);
						setStep('repositories');
					}
				}}
			/>
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
						{isFork ? 'Forking Worktree: ' : 'Adding Worktree: '}
						{worktreeName}
					</Text>
				</Box>
				<Box marginBottom={1}>
					<Text dimColor>
						{isFork
							? `Forking ${displayName} off ${forkSource?.worktree.branch ?? ''}...`
							: `Creating worktree from ${displayName}...`}
					</Text>
				</Box>

				{/* Live log output */}
				{(creationTask?.log.length ?? 0) > 0 && (
					<Box flexDirection="column" borderStyle="single" borderColor="gray" padding={1} marginTop={1}>
						{(creationTask?.log ?? []).slice(-15).map((line, index) => (
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

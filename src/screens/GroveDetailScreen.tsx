import React, { useEffect, useRef, useState } from 'react';

import { Box, type DOMElement, Text, useInput } from 'ink';

import {
	type InkMouseEvent,
	getBoundingClientRect,
	useOnPress,
	useOnRelease,
} from '@ink-tools/ink-mouse';
import fs from 'fs';
import path from 'path';

import { AsanaReferenceCell } from '../components/AsanaReferenceCell.js';
import TextInput from '../components/GroveTextInput.js';
import { MergeRequestCell } from '../components/MergeRequestCell.js';
import { SessionIndicator } from '../components/SessionIndicator.js';
import { ClickableTile } from '../components/home/ClickableTile.js';
import { useService } from '../di/index.js';
import { useMergeRequestStatus } from '../hooks/useMergeRequestStatus.js';
import { useNavigation } from '../navigation/useNavigation.js';
import { ASANA_PLUGIN_ID, AsanaPlugin } from '../plugins/asana/index.js';
import { getContextDisplayName } from '../services/WorkspaceService.js';
import {
	detectTerminal,
	getIDEDisplayName,
	openIDEInPath,
	openTerminalInPath,
	resolveIDEForPath,
} from '../services/index.js';
import {
	ClaudeSessionServiceToken,
	GitServiceToken,
	GroveServiceToken,
	GrovesServiceToken,
	PluginRegistryToken,
	SessionsServiceToken,
	SettingsServiceToken,
	WorkspaceServiceToken,
} from '../services/tokens.js';
import type { BranchUpstreamStatus, FileChangeStats } from '../services/types.js';
import { GroveConfigService } from '../storage/index.js';
import type { AgentSession, Settings, Worktree, WorktreeReference } from '../storage/types.js';
import { parseAsanaTaskUrl } from '../utils/index.js';
import { openUrl, wasLinkRecentlyOpened } from '../utils/links.js';

interface WorktreeDetails {
	worktree: Worktree;
	branch: string;
	fileStats: FileChangeStats;
	hasUnpushedCommits: boolean;
	upstreamStatus: BranchUpstreamStatus;
	/** Nesting depth in the fork tree (0 = root, >0 = forked from another worktree) */
	depth: number;
	/**
	 * For each ancestor level (one entry per level above the immediate parent), whether a vertical
	 * guide line should be drawn — i.e. that ancestor still has siblings appearing below this row.
	 * Length is `depth - 1`.
	 */
	ancestorGuides: boolean[];
	/** Whether this worktree is the last child of its parent (controls └─ vs ├─). */
	isLastChild: boolean;
}

/**
 * Order worktrees so forks appear directly beneath the worktree they were forked from, and compute
 * the tree-guide metadata for each (nesting depth, which ancestor lines continue, and whether the
 * node is the last child). Roots and siblings keep their original relative order. Forks whose
 * parent is missing from the grove are treated as roots.
 */
function orderWorktreesAsTree(details: WorktreeDetails[]): WorktreeDetails[] {
	const byPath = new Map<string, WorktreeDetails>();
	for (const d of details) {
		byPath.set(d.worktree.worktreePath, d);
	}

	const childrenOf = new Map<string, WorktreeDetails[]>();
	const roots: WorktreeDetails[] = [];
	for (const d of details) {
		const parentPath = d.worktree.forkedFromPath;
		if (parentPath && byPath.has(parentPath)) {
			const siblings = childrenOf.get(parentPath) ?? [];
			siblings.push(d);
			childrenOf.set(parentPath, siblings);
		} else {
			roots.push(d);
		}
	}

	const ordered: WorktreeDetails[] = [];
	const visit = (
		detail: WorktreeDetails,
		depth: number,
		ancestorGuides: boolean[],
		isLastChild: boolean
	) => {
		ordered.push({ ...detail, depth, ancestorGuides, isLastChild });

		const children = childrenOf.get(detail.worktree.worktreePath) ?? [];
		// A child's ancestor guides are this node's guides plus, for non-root parents, whether this
		// node continues (has a sibling below). Roots are not connected by a left-hand guide line.
		const childGuides = depth === 0 ? [] : [...ancestorGuides, !isLastChild];
		children.forEach((child, index) => {
			visit(child, depth + 1, childGuides, index === children.length - 1);
		});
	};
	roots.forEach((root, index) => {
		visit(root, 0, [], index === roots.length - 1);
	});

	return ordered;
}

/** A single guide column: a full-height vertical line when `draw`, otherwise blank padding. */
function VerticalGuide({ draw }: { draw: boolean }) {
	if (!draw) {
		return <Box flexShrink={0} width={1} marginRight={1} />;
	}
	return (
		<Box
			flexShrink={0}
			marginRight={1}
			borderStyle="single"
			borderColor="gray"
			borderTop={false}
			borderBottom={false}
			borderRight={false}
			borderLeft={true}
		/>
	);
}

/**
 * The elbow connector for a fork: a vertical line dropping from the parent above that turns right
 * (└─ for a last child, ├─ otherwise) into the worktree box, like a branch in a file explorer. For
 * a non-last child the line continues below the elbow to reach the next sibling.
 */
function ElbowGuide({ isLast }: { isLast: boolean }) {
	return (
		<Box flexShrink={0} flexDirection="column" width={2}>
			{/* Vertical line dropping from the parent down to the elbow (biased long to reach up) */}
			<Box
				flexGrow={2}
				borderStyle="single"
				borderColor="gray"
				borderTop={false}
				borderBottom={false}
				borderRight={false}
				borderLeft={true}
			/>
			<Text color="gray">{isLast ? '└─' : '├─'}</Text>
			{isLast ? (
				<Box flexGrow={1} />
			) : (
				<Box
					flexGrow={1}
					borderStyle="single"
					borderColor="gray"
					borderTop={false}
					borderBottom={false}
					borderRight={false}
					borderLeft={true}
				/>
			)}
		</Box>
	);
}

/**
 * Renders the left-hand tree guides for a forked worktree: a vertical line for each ancestor level
 * that still has siblings below, then the elbow connector linking it to its parent.
 */
function TreeGutter({ guides, isLast }: { guides: boolean[]; isLast: boolean }) {
	return (
		<>
			{guides.map((draw, i) => (
				<VerticalGuide key={i} draw={draw} />
			))}
			<ElbowGuide isLast={isLast} />
		</>
	);
}

interface SessionCounts {
	activeCount: number;
	idleCount: number;
	attentionCount: number;
	closedCount: number;
}

// Format file change stats for display
function formatFileStats(stats: FileChangeStats): string {
	if (stats.total === 0) {
		return 'Clean';
	}

	const parts: string[] = [];
	if (stats.modified > 0) parts.push(`${stats.modified} modified`);
	if (stats.added > 0) parts.push(`${stats.added} added`);
	if (stats.deleted > 0) parts.push(`${stats.deleted} deleted`);
	if (stats.untracked > 0) parts.push(`${stats.untracked} untracked`);

	return parts.join(', ');
}

/**
 * Renders a single worktree panel. Shared between the grove detail list and the worktree actions
 * menu so both stay in sync. The list passes `showInitActions={false}` to keep rows compact; the
 * detail/actions view (and single-worktree mode) passes `showInitActions={true}`.
 */
function WorktreePanel({
	detail,
	isSelected,
	sessionCounts,
	showInitActions,
	asanaEnabled = false,
	onAttachAsana,
}: {
	detail: WorktreeDetails;
	isSelected: boolean;
	sessionCounts: SessionCounts;
	showInitActions: boolean;
	/** Whether the Asana plugin is enabled (controls the reference line / attach affordance). */
	asanaEnabled?: boolean;
	/** Called when the unlinked "Attach Asana" affordance is clicked. */
	onAttachAsana?: () => void;
}) {
	const isClosed = detail.worktree.closed === true;
	const mr = useMergeRequestStatus(
		isClosed ? undefined : detail.worktree.repositoryPath,
		detail.branch,
		!isClosed
	);
	const repoLabel = detail.worktree.projectPath
		? `${detail.worktree.repositoryName}.${detail.worktree.projectPath}`
		: detail.worktree.repositoryName;
	const hasChanges = !isClosed && detail.fileStats.total > 0;
	const hasSessions =
		sessionCounts.activeCount > 0 ||
		sessionCounts.idleCount > 0 ||
		sessionCounts.attentionCount > 0 ||
		sessionCounts.closedCount > 0;

	return (
		<Box
			flexGrow={1}
			flexDirection="column"
			borderStyle={isSelected ? 'round' : 'single'}
			borderColor={isClosed ? 'gray' : isSelected ? 'cyan' : 'gray'}
			paddingX={1}
		>
			{/* Worktree Name with Session Indicator */}
			<Box>
				<Text bold color={isClosed ? 'gray' : isSelected ? 'cyan' : undefined}>
					{detail.worktree.name || repoLabel}
				</Text>
				{isClosed && <Text dimColor> (Closed)</Text>}
				{!isClosed && hasSessions && (
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
					{/* Repository (repo.project for monorepo) */}
					<Box>
						<Text dimColor>Repository: </Text>
						<Text>{repoLabel}</Text>
					</Box>

					{/* Branch */}
					<Box>
						<Text dimColor>Branch: </Text>
						<Text color="yellow">{detail.branch}</Text>
						{detail.upstreamStatus === 'gone' && <Text color="green"> (Merged)</Text>}
					</Box>

					{/* File Changes + Merge Request status (same line) */}
					<Box>
						<Text dimColor>Files: </Text>
						<Text color={hasChanges ? 'yellow' : 'green'}>
							{hasChanges ? `${detail.fileStats.total} changed` : 'Clean'}
						</Text>
						{hasChanges && <Text dimColor> ({formatFileStats(detail.fileStats)})</Text>}
						<MergeRequestCell mr={mr} marginLeft={2} />
					</Box>

					{/* External reference line. Linked tasks always show; the "Attach Asana"
					    affordance appears for unlinked worktrees only when the plugin is enabled. */}
					{detail.worktree.reference?.type === 'asana' ? (
						<AsanaReferenceCell url={detail.worktree.reference.url} />
					) : asanaEnabled ? (
						<AsanaReferenceCell onAttach={onAttachAsana} />
					) : null}

					{/* Unpushed Commits */}
					{detail.hasUnpushedCommits && (
						<Box>
							<Text color="yellow">⚠ Unpushed commits</Text>
						</Box>
					)}

					{/* InitActions Status (detail view only) */}
					{showInitActions && detail.worktree.initActionsStatus && (
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
}

interface WorktreeAction {
	label: string;
	action: () => void;
}

/**
 * The list of worktree actions, rendered for both the multi-worktree actions
 * menu and the single-worktree inline actions. Clickable: pressing a row selects
 * it (like arrow navigation) and releasing runs it (like Enter).
 *
 * We attach a single click handler to the list container and derive the row from
 * the pointer's Y offset, rather than making each row independently clickable.
 * ink-mouse's hit-test bounds are inclusive on every edge (bottom = top +
 * height), so adjacent one-line rows share a boundary row and a per-row approach
 * would fire several actions for one click.
 */
function WorktreeActionList({
	actions,
	selectedIndex,
	onSelect,
	onActivate,
}: {
	actions: WorktreeAction[];
	selectedIndex: number;
	onSelect: (index: number) => void;
	onActivate: (index: number) => void;
}) {
	const ref = useRef<DOMElement>(null);

	// Rows are contiguous and one line tall, so the clicked row index is simply
	// the pointer's offset from the list's top. Returns null for non-left clicks
	// or clicks outside the rows.
	const rowFromEvent = (event: InkMouseEvent): number | null => {
		if (event.button !== 'left') {
			return null;
		}
		const rect = getBoundingClientRect(ref.current);
		if (!rect) {
			return null;
		}
		const row = event.y - rect.top;
		return row >= 0 && row < actions.length ? row : null;
	};

	useOnPress(ref, (event) => {
		const row = rowFromEvent(event);
		if (row !== null) {
			onSelect(row);
		}
	});
	useOnRelease(ref, (event) => {
		const row = rowFromEvent(event);
		if (row !== null) {
			onActivate(row);
		}
	});

	return (
		<Box ref={ref} flexDirection="column" marginBottom={1}>
			{actions.map((action, index) => (
				<Text key={action.label} color={selectedIndex === index ? 'cyan' : undefined}>
					{selectedIndex === index ? '❯ ' : '  '}
					{action.label}
				</Text>
			))}
		</Box>
	);
}

interface GroveDetailScreenProps {
	groveId: string;
	focusWorktreeName?: string;
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

export function GroveDetailScreen({ groveId, focusWorktreeName }: GroveDetailScreenProps) {
	const { goBack, navigate } = useNavigation();
	const gitService = useService(GitServiceToken);
	const claudeSessionService = useService(ClaudeSessionServiceToken);
	const grovesService = useService(GrovesServiceToken);
	const groveService = useService(GroveServiceToken);
	const sessionsService = useService(SessionsServiceToken);
	const settingsService = useService(SettingsServiceToken);
	const workspaceService = useService(WorkspaceServiceToken);
	const pluginRegistry = useService(PluginRegistryToken);
	const asanaEnabled = pluginRegistry.isEnabled(ASANA_PLUGIN_ID);
	const asanaPlugin = pluginRegistry.get(ASANA_PLUGIN_ID) as AsanaPlugin | undefined;
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
	const workspaceName = getContextDisplayName(workspaceContext);
	const [showInitLog, setShowInitLog] = useState(false);
	const [initLogContent, setInitLogContent] = useState<string>('');
	// Whether closed worktrees are shown. Defaults to hidden and is not persisted.
	const [showClosed, setShowClosed] = useState(false);

	// Asana "Attach reference" flow. When a worktree path is set, a paste-the-URL prompt
	// takes over the screen; submitting verifies the task via the API before persisting.
	const [attachingWorktreePath, setAttachingWorktreePath] = useState<string | null>(null);
	const [attachInput, setAttachInput] = useState('');
	const [attachError, setAttachError] = useState<string>('');
	const [attachBusy, setAttachBusy] = useState(false);

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
							depth: 0,
							ancestorGuides: [],
							isLastChild: true,
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
						depth: 0,
						ancestorGuides: [],
						isLastChild: true,
					};
				});

				// Order worktrees as a fork tree (parents followed by their forks) and assign depth.
				const details = orderWorktreesAsTree(await Promise.all(detailsPromises));
				setWorktreeDetails(details);

				// If focusWorktreeName is provided, select that worktree and show actions
				if (focusWorktreeName && details.length > 1) {
					const focusIndex = details.findIndex(
						(d) => !d.worktree.closed && d.worktree.name === focusWorktreeName
					);
					if (focusIndex !== -1) {
						setSelectedIndex(focusIndex);
						setShowActions(true);
						setSelectedActionIndex(0);
					} else {
						// Fallback: select first non-closed worktree
						const firstOpenIndex = details.findIndex((d) => !d.worktree.closed);
						if (firstOpenIndex !== -1) {
							setSelectedIndex(firstOpenIndex);
						}
					}
				} else {
					// Set initial selection to first non-closed worktree
					const firstOpenIndex = details.findIndex((d) => !d.worktree.closed);
					if (firstOpenIndex !== -1) {
						setSelectedIndex(firstOpenIndex);
					}
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
	const handleContinueInClaude = () => {
		const selected = worktreeDetails[selectedIndex].worktree;
		const targetPath = getWorktreePath(selected);
		const result = claudeSessionService.continueSession(
			targetPath,
			selected.repositoryPath,
			selected.projectPath,
			undefined,
			groveName,
			selected.name
		);
		setShowActions(false);
		if (result.success) {
			setResultMessage(`Continuing Claude session in ${selected.repositoryName}`);
			setTimeout(() => setResultMessage(null), 2000);
		} else {
			setError(result.message);
		}
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

	const handleOpenInTerminal = async () => {
		const settings = settingsService.readSettings();

		// Resolve terminal config, respecting Claude terminal preference
		const terminalConfig = settings.selectedClaudeTerminal
			? ((await detectTerminal(settings.selectedClaudeTerminal)) ?? settings.terminal)
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

	const handleFork = () => {
		const selected = worktreeDetails[selectedIndex].worktree;
		setShowActions(false);
		navigate('forkWorktree', { groveId, worktreePath: selected.worktreePath });
	};

	const handleCloseWorktree = () => {
		const selected = worktreeDetails[selectedIndex].worktree;
		setShowActions(false);
		navigate('closeWorktree', { groveId, worktreePath: selected.worktreePath });
	};

	// Open the attach-Asana prompt for a worktree.
	const startAttachAsana = (worktreePath: string) => {
		setShowActions(false);
		setAttachingWorktreePath(worktreePath);
		setAttachInput('');
		setAttachError('');
		setAttachBusy(false);
	};

	const cancelAttachAsana = () => {
		setAttachingWorktreePath(null);
		setAttachInput('');
		setAttachError('');
		setAttachBusy(false);
	};

	// Verify the pasted Asana task URL via the API, then persist it onto the worktree.
	const submitAttachAsana = (value: string) => {
		const worktreePath = attachingWorktreePath;
		if (!worktreePath) {
			return;
		}

		const parsed = parseAsanaTaskUrl(value);
		if (!parsed) {
			setAttachError('That does not look like an Asana task URL.');
			return;
		}
		if (!asanaPlugin) {
			setAttachError('Asana plugin is not available.');
			return;
		}

		setAttachBusy(true);
		setAttachError('');

		asanaPlugin
			.getTask(parsed.gid)
			.then((task) => {
				const reference: WorktreeReference = { type: 'asana', id: parsed.gid, url: task.url };
				groveService.setWorktreeReference(groveId, worktreePath, reference);
				// Reflect the new reference locally so the panel updates without a full reload.
				setWorktreeDetails((prev) =>
					prev.map((d) =>
						d.worktree.worktreePath === worktreePath
							? { ...d, worktree: { ...d.worktree, reference } }
							: d
					)
				);
				cancelAttachAsana();
				setResultMessage(`Linked Asana task: ${task.name}`);
				setTimeout(() => setResultMessage(null), 2000);
			})
			.catch((err: unknown) => {
				setAttachBusy(false);
				setAttachError(err instanceof Error ? err.message : 'Failed to fetch Asana task');
			});
	};

	// Keyboard affordance for the selected worktree: open the linked task, or start attaching.
	const handleReferenceShortcut = () => {
		if (!asanaEnabled) {
			return;
		}
		const selected = worktreeDetails[selectedIndex]?.worktree;
		if (!selected || selected.closed) {
			return;
		}
		if (selected.reference?.type === 'asana') {
			openUrl(selected.reference.url);
		} else {
			startAttachAsana(selected.worktreePath);
		}
	};

	// Worktree action options (dynamically built based on worktree state)
	const selectedWorktree = worktreeDetails[selectedIndex]?.worktree;
	const isSelectedWorktreeClosed = selectedWorktree?.closed === true;
	// Check if there are any past Claude sessions for the selected worktree
	const hasPastSessions =
		selectedWorktree &&
		!isSelectedWorktreeClosed &&
		groveSessions.some(
			(s) => s.worktreePath === selectedWorktree.worktreePath && s.agentType === 'claude'
		);

	const worktreeActions = isSelectedWorktreeClosed
		? []
		: [
				// Conditionally add "Continue in Claude" if there are past sessions
				...(hasPastSessions
					? [
							{
								label: 'Continue in Claude',
								action: handleContinueInClaude,
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
				{
					label: 'Fork',
					action: handleFork,
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

	// Closed worktrees are hidden by default; track which ones are visible
	const closedCount = worktreeDetails.filter((d) => d.worktree.closed).length;
	const hasClosed = closedCount > 0;
	const visibleDetails = showClosed
		? worktreeDetails
		: worktreeDetails.filter((d) => !d.worktree.closed);

	// Mouse: pressing a worktree panel selects it (like arrow navigation), and
	// releasing on it opens its actions (like Enter). Closed worktrees are
	// non-interactive, matching the keyboard which skips them.
	const handleWorktreePress = (index: number) => {
		if (worktreeDetails[index]?.worktree.closed) {
			return;
		}
		setSelectedIndex(index);
	};

	const handleWorktreeActivate = (index: number) => {
		if (worktreeDetails[index]?.worktree.closed) {
			return;
		}
		setSelectedIndex(index);
		// In single-worktree mode the actions are already shown inline, so there's
		// nothing extra to open.
		if (!isSingleWorktreeMode) {
			setShowActions(true);
			setSelectedActionIndex(0);
		}
	};

	// Mouse: releasing on an action item runs it (like Enter on a selected action).
	const handleActionActivate = (index: number) => {
		setSelectedActionIndex(index);
		worktreeActions[index]?.action();
	};

	// Handle keyboard navigation
	useInput(
		(input, key) => {
			if (attachingWorktreePath !== null) {
				// The attach prompt's text input handles typing/submit; only Esc cancels here.
				if (key.escape) {
					cancelAttachAsana();
				}
				return;
			}

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
				} else if (input === 'C' && isSingleWorktreeMode) {
					// Close all merged worktrees (Shift+C)
					const hasMerged = worktreeDetails.some(
						(d) => !d.worktree.closed && d.upstreamStatus === 'gone'
					);
					if (hasMerged) {
						navigate('closeMergedWorktrees', { groveId });
					}
				} else if (input === 'c' && isSingleWorktreeMode) {
					// Allow closing grove from single-worktree mode
					navigate('closeGrove', { groveId });
				} else if (input === 'a' && isSingleWorktreeMode) {
					// Allow adding worktree from single-worktree mode
					navigate('addWorktree', { groveId });
				} else if (input === 'd' && isSingleWorktreeMode) {
					// Toggle visibility of closed worktrees
					setShowClosed((prev) => !prev);
				} else if (input === 'r' && isSingleWorktreeMode && asanaEnabled) {
					// Open or attach the worktree's Asana reference
					handleReferenceShortcut();
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
				} else if (input === 'C') {
					// Close all merged worktrees (Shift+C)
					const hasMerged = worktreeDetails.some(
						(d) => !d.worktree.closed && d.upstreamStatus === 'gone'
					);
					if (hasMerged) {
						navigate('closeMergedWorktrees', { groveId });
					}
				} else if (input === 'c') {
					navigate('closeGrove', { groveId });
				} else if (input === 'a') {
					navigate('addWorktree', { groveId });
				} else if (input === 'd') {
					// Toggle visibility of closed worktrees
					setShowClosed((prev) => !prev);
				} else if (input === 'r' && asanaEnabled) {
					// Open or attach the selected worktree's Asana reference
					handleReferenceShortcut();
				}
			}
		},
		{ isActive: !resultMessage }
	);

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

	if (attachingWorktreePath !== null) {
		const attachingWorktree = worktreeDetails.find(
			(d) => d.worktree.worktreePath === attachingWorktreePath
		)?.worktree;

		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="green">
						Attach Asana Task
					</Text>
				</Box>

				{attachingWorktree && (
					<Box marginBottom={1}>
						<Text dimColor>Worktree: {attachingWorktree.name || attachingWorktree.repositoryName}</Text>
					</Box>
				)}

				<Box marginBottom={1}>
					<Text>Paste the Asana task URL:</Text>
				</Box>

				<Box borderStyle="round" borderColor="cyan" paddingX={1} width="100%">
					<Text color="cyan">URL: </Text>
					{attachBusy ? (
						<Text dimColor>Verifying task…</Text>
					) : (
						<Box flexGrow={1}>
							<TextInput
								value={attachInput}
								onChange={(value) => {
									setAttachInput(value);
									if (attachError) setAttachError('');
								}}
								onSubmit={submitAttachAsana}
								placeholder="https://app.asana.com/..."
							/>
						</Box>
					)}
				</Box>

				{attachError && (
					<Box marginTop={1}>
						<Text color="red">{attachError}</Text>
					</Box>
				)}

				<Box marginTop={1}>
					<Text dimColor>Enter to verify &amp; link • ESC to cancel</Text>
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

					{/* Selected Worktree Info — same panel as the list, with init actions */}
					{worktreeDetails[selectedIndex] && (
						<Box marginBottom={1}>
							<WorktreePanel
								detail={worktreeDetails[selectedIndex]}
								isSelected={true}
								sessionCounts={getSessionCounts(worktreeDetails[selectedIndex].worktree.worktreePath)}
								showInitActions={true}
								asanaEnabled={asanaEnabled}
								onAttachAsana={() => startAttachAsana(worktreeDetails[selectedIndex].worktree.worktreePath)}
							/>
						</Box>
					)}

					{/* Actions */}
					<WorktreeActionList
						actions={worktreeActions}
						selectedIndex={selectedActionIndex}
						onSelect={setSelectedActionIndex}
						onActivate={handleActionActivate}
					/>

					{/* Help text */}
					<Box marginTop={1}>
						<Text dimColor>↑↓ Navigate • Enter/Click Select • ESC Cancel</Text>
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
							Worktrees ({visibleDetails.length})
						</Text>
						{hasClosed && !showClosed && <Text dimColor> ({closedCount} closed hidden)</Text>}
					</Box>

					{visibleDetails.length === 0 ? (
						<Box marginLeft={2}>
							<Text dimColor>
								{worktreeDetails.length === 0
									? 'No worktrees in this grove'
									: 'No open worktrees — press d to show closed'}
							</Text>
						</Box>
					) : (
						<Box flexDirection="column">
							{worktreeDetails.map((detail, index) => {
								const isSelected = index === selectedIndex;
								const isClosed = detail.worktree.closed === true;

								// Hide closed worktrees unless the user has toggled them on
								if (isClosed && !showClosed) {
									return null;
								}

								const sessionCounts = getSessionCounts(detail.worktree.worktreePath);

								// Keep forks visually attached to their parent: no gap before a row that is a
								// descendant (depth > 0). A gap is added before the next top-level worktree.
								let nextVisibleDepth: number | null = null;
								for (let k = index + 1; k < worktreeDetails.length; k++) {
									const next = worktreeDetails[k];
									if (next.worktree.closed && !showClosed) {
										continue;
									}
									nextVisibleDepth = next.depth;
									break;
								}
								const marginBottom = nextVisibleDepth !== null && nextVisibleDepth > 0 ? 0 : 1;

								return (
									<Box key={detail.worktree.worktreePath} flexDirection="row" marginBottom={marginBottom}>
										{/* Fork tree guides linking forked worktrees to their parent */}
										{detail.depth > 0 && (
											<TreeGutter guides={detail.ancestorGuides} isLast={detail.isLastChild} />
										)}
										<ClickableTile
											flexGrow={1}
											onPress={() => handleWorktreePress(index)}
											onRelease={() => {
												// A click on the MR link also fires this tile handler (overlapping
												// bounds, no propagation). Defer a tick so the link handler can mark
												// itself, then skip activation if a link was just opened.
												setTimeout(() => {
													if (wasLinkRecentlyOpened()) {
														return;
													}
													handleWorktreeActivate(index);
												}, 0);
											}}
										>
											<WorktreePanel
												detail={detail}
												isSelected={isSelected}
												sessionCounts={sessionCounts}
												showInitActions={isSingleWorktreeMode}
												asanaEnabled={asanaEnabled}
												onAttachAsana={() => startAttachAsana(detail.worktree.worktreePath)}
											/>
										</ClickableTile>
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

							<WorktreeActionList
								actions={worktreeActions}
								selectedIndex={selectedActionIndex}
								onSelect={setSelectedActionIndex}
								onActivate={handleActionActivate}
							/>
						</>
					)}

					{/* Help text */}
					<Box marginTop={1} flexDirection="column">
						<Text dimColor>
							↑↓ Navigate • <Text bold>Enter</Text> Select • <Text bold>a</Text> Add Worktree •{' '}
							<Text bold>c</Text> Close Grove • <Text bold>Shift+C</Text> Close Merged •{' '}
							{hasClosed && (
								<>
									<Text bold>d</Text> {showClosed ? 'Hide' : 'Show'} Closed •{' '}
								</>
							)}
							{asanaEnabled && (
								<>
									<Text bold>r</Text> Reference •{' '}
								</>
							)}
							<Text bold>ESC</Text> Back
						</Text>
					</Box>
				</>
			)}
		</Box>
	);
}

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

import {
	AgentSessionIndicator,
	AgentStatusIcon,
	getAgentStatusMeta,
} from '../components/AgentSessionIndicator.js';
import { AsanaReferenceCell } from '../components/AsanaReferenceCell.js';
import TextInput from '../components/GroveTextInput.js';
import { MergeRequestCell } from '../components/MergeRequestCell.js';
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
	GroveConfigServiceToken,
	GroveServiceToken,
	GrovesServiceToken,
	PluginRegistryToken,
	SettingsServiceToken,
	WorkspaceServiceToken,
} from '../services/tokens.js';
import type { BranchUpstreamStatus, FileChangeStats } from '../services/types.js';
import type { IGroveConfigService } from '../storage/GroveConfigService.js';
import type { Settings, Worktree, WorktreeReference } from '../storage/types.js';
import {
	type ClaudeAgentInfo,
	agentMatchesWorktree,
	shortSessionId,
} from '../utils/claudeAgents.js';
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
	agentSessions,
	showInitActions,
	showSessions = true,
	asanaEnabled = false,
	onAttachAsana,
}: {
	detail: WorktreeDetails;
	isSelected: boolean;
	/** Live Claude sessions (interactive + background) matched to this worktree. */
	agentSessions: ClaudeAgentInfo[];
	showInitActions: boolean;
	/** Whether to show the inline session indicator (hidden in the detail view, where session panels show status). */
	showSessions?: boolean;
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
	const hasSessions = showSessions && agentSessions.length > 0;

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
						<AgentSessionIndicator sessions={agentSessions} detailed />
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
function getIDEConfigForWorktree(
	groveConfigService: IGroveConfigService,
	worktree: Worktree,
	settings: Settings,
	targetPath: string
) {
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

/**
 * The active modal/panel of the grove detail screen, modelled as one discriminated union so
 * invalid combinations (e.g. the init-log viewer open while the Claude submenu is active) are
 * unrepresentable. Plain cursor state (selectedIndex / selectedActionIndex / submenuIndex) and
 * fetched data live outside this union — they persist across modes, like the worktree list cursor.
 *
 * - `list`        — multi-worktree list (the base view when there is more than one worktree).
 * - `actions`     — the worktree actions menu. The base view in single-worktree mode (always shown
 *                   inline); an overlay in multi-worktree mode.
 * - `claudeSubmenu` — the Claude launch / per-session / archive-confirm submenu.
 * - `asanaAttach` — the "paste the Asana task URL" prompt.
 * - `initLog`     — the init-actions log viewer.
 */
type UIMode =
	| { type: 'list' }
	| { type: 'actions' }
	| { type: 'claudeSubmenu'; mode: 'launch' | 'session' | 'archiveConfirm'; sessionId?: string }
	| { type: 'asanaAttach'; worktreePath: string; input: string; error: string; busy: boolean }
	| { type: 'initLog'; content: string };

export function GroveDetailScreen({ groveId, focusWorktreeName }: GroveDetailScreenProps) {
	const { goBack, navigate } = useNavigation();
	const gitService = useService(GitServiceToken);
	const claudeSessionService = useService(ClaudeSessionServiceToken);
	const groveConfigService = useService(GroveConfigServiceToken);
	const grovesService = useService(GrovesServiceToken);
	const groveService = useService(GroveServiceToken);
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
	const [resultMessage, setResultMessage] = useState<string | null>(null);
	// The active modal/panel. Plain cursors (below) persist across mode changes.
	const [uiMode, setUIMode] = useState<UIMode>({ type: 'list' });
	// Cursor into the combined worktree-actions list (Claude rows + worktreeActions).
	const [selectedActionIndex, setSelectedActionIndex] = useState(0);
	// Cursor into the active Claude submenu's options.
	const [submenuIndex, setSubmenuIndex] = useState(0);
	// Live Claude sessions (interactive + background) from `claude agents --json`,
	// refreshed in the background. Drives the per-worktree status icons + panels.
	const [agentSessions, setAgentSessions] = useState<ClaudeAgentInfo[]>([]);
	// Launching a Claude session blocks (spawnSync / $EDITOR), which freezes the
	// Ink render loop. We show a loading screen first and run the blocking work
	// from an effect on the next tick, so the feedback paints before we block.
	const [launchingMessage, setLaunchingMessage] = useState<string | null>(null);
	const launchRunnerRef = useRef<(() => void) | null>(null);

	// Get workspace context to display workspace name
	const workspaceContext = workspaceService.getCurrentContext();
	const workspaceName = getContextDisplayName(workspaceContext);
	// Whether closed worktrees are shown. Defaults to hidden and is not persisted.
	const [showClosed, setShowClosed] = useState(false);

	// Single-worktree groves show their actions inline; the multi-worktree list/overlay split
	// does not apply. Computed early because the mode helpers below depend on it.
	const isSingleWorktreeMode = worktreeDetails.length === 1;

	// Close any open overlay back to the base view: the inline actions in single-worktree mode
	// (always visible), or the worktree list otherwise. Cursor state is intentionally preserved.
	const closeToBase = () => {
		setUIMode(isSingleWorktreeMode ? { type: 'actions' } : { type: 'list' });
	};

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
						setUIMode({ type: 'actions' });
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
					// Single-worktree groves show their actions inline from the start.
					if (details.length === 1) {
						setUIMode({ type: 'actions' });
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

	// Poll live Claude sessions from `claude agents --json` in the background.
	// The CLI reports the authoritative status, refreshed every 30 seconds.
	//
	// A monotonic request id guards against out-of-order resolution: a slow in-flight
	// request must not overwrite the result of a newer one. `claudeSessionService` is a
	// DI singleton, so it's intentionally omitted from the deps — including it would
	// needlessly re-arm the interval.
	useEffect(() => {
		let cancelled = false;
		let latest = 0;

		const refreshAgents = async () => {
			const id = ++latest;
			const sessions = await claudeSessionService.listTrackedSessions();
			if (!cancelled && id === latest) {
				setAgentSessions(sessions);
			}
		};

		void refreshAgents();
		const interval = setInterval(() => void refreshAgents(), 30 * 1000);

		return () => {
			cancelled = true;
			clearInterval(interval);
		};
	}, []);

	// Run a pending launch once its loading screen has been committed/painted.
	// `setTimeout` yields to the event loop so Ink flushes the message to the
	// terminal before the (blocking) launch runs.
	useEffect(() => {
		if (!launchingMessage || !launchRunnerRef.current) {
			return;
		}
		const timer = setTimeout(() => {
			const run = launchRunnerRef.current;
			launchRunnerRef.current = null;
			run?.();
		}, 0);
		return () => clearTimeout(timer);
	}, [launchingMessage]);

	// Show a loading screen, then run the (blocking) launch work on the next tick.
	const beginLaunch = (message: string, run: () => void) => {
		closeToBase();
		launchRunnerRef.current = run;
		setLaunchingMessage(message);
	};

	// Live Claude sessions (interactive + background) matched to a worktree: by
	// the background session's short id, or by any session whose cwd is inside
	// the worktree directory (covers interactive claudes and monorepo subdirs).
	const getAgentSessionsForWorktree = (worktree: Worktree): ClaudeAgentInfo[] => {
		// `agentSessions` is already reconciled (archived sessions excluded), so we
		// only need to match the live ones to this worktree.
		return agentSessions.filter((agent) =>
			agentMatchesWorktree(agent, worktree.worktreePath, worktree.bgSessionId)
		);
	};

	// Worktree action handlers
	// Persist a worktree's background session id (and reflect it locally so the
	// session panel appears without a full reload). Shared by the launch actions.
	const persistBackgroundSession = (worktree: Worktree, sessionId: string, sessionName?: string) => {
		try {
			groveService.setWorktreeBackgroundSession(
				groveId,
				worktree.worktreePath,
				sessionId,
				sessionName
			);
		} catch {
			// Ignore persistence errors; still reflect the session locally
		}
		setWorktreeDetails((prev) =>
			prev.map((d) =>
				d.worktree.worktreePath === worktree.worktreePath
					? { ...d, worktree: { ...d.worktree, bgSessionId: sessionId, bgSessionName: sessionName } }
					: d
			)
		);
	};

	// Finish a launch: clear the loading screen and show a result or error.
	const finishLaunch = (success: boolean, message: string) => {
		setLaunchingMessage(null);
		if (success) {
			setResultMessage(message);
			setTimeout(() => setResultMessage(null), 2000);
		} else {
			setError(message);
		}
	};

	// Standard launch: start a background session (no prompt) and attach right
	// away, so it's a tracked, re-attachable agent. Persist its session id.
	const handleOpenInClaude = () => {
		const selected = worktreeDetails[selectedIndex].worktree;
		const targetPath = getWorktreePath(selected);
		beginLaunch(`Launching Claude in ${selected.repositoryName}…`, () => {
			const result = claudeSessionService.launchStandardSession(
				targetPath,
				selected.repositoryPath,
				selected.projectPath,
				undefined,
				groveName,
				selected.name
			);
			if (result.sessionId) {
				persistBackgroundSession(selected, result.sessionId, result.sessionName);
			}
			finishLaunch(
				result.success,
				result.success ? `Opened Claude session in ${selected.repositoryName}` : result.message
			);
		});
	};

	// Instant Claude: edit the prompt template, dispatch a background session via
	// `claude --bg`, and persist its session id so a tracked session panel appears.
	const handleInstantClaude = () => {
		const selected = worktreeDetails[selectedIndex].worktree;
		const targetPath = getWorktreePath(selected);
		beginLaunch(`Opening prompt editor for ${selected.repositoryName}…`, () => {
			const result = claudeSessionService.launchInstantSession(
				targetPath,
				selected.repositoryPath,
				selected.projectPath,
				groveName,
				selected.name
			);
			if (result.success && result.sessionId) {
				persistBackgroundSession(selected, result.sessionId, result.sessionName);
				finishLaunch(true, `Started Instant Claude in ${selected.repositoryName}`);
			} else {
				finishLaunch(false, result.message);
			}
		});
	};

	// Instant Claude from Asana: fetch the linked task, seed the prompt template's
	// `{prompt}` placeholder with the task name + description, then dispatch a
	// background session (same flow as Instant Claude). Fetching is async, so we
	// show a loading screen first and run the blocking editor/launch once resolved.
	const handleInstantClaudeFromAsana = () => {
		const selected = worktreeDetails[selectedIndex].worktree;
		const reference = selected.reference;
		if (!asanaPlugin || reference?.type !== 'asana') {
			return;
		}
		const targetPath = getWorktreePath(selected);
		closeToBase();
		setLaunchingMessage(`Fetching Asana task for ${selected.repositoryName}…`);
		asanaPlugin
			.getTask(reference.id)
			.then((task) => {
				const promptBody = asanaPlugin.buildInstantClaudePrompt(task);
				beginLaunch(`Opening prompt editor for ${selected.repositoryName}…`, () => {
					const result = claudeSessionService.launchInstantSessionFromReference(
						targetPath,
						selected.repositoryPath,
						promptBody,
						selected.projectPath,
						groveName,
						selected.name
					);
					if (result.success && result.sessionId) {
						persistBackgroundSession(selected, result.sessionId, result.sessionName);
						finishLaunch(true, `Started Instant Claude from Asana in ${selected.repositoryName}`);
					} else {
						finishLaunch(false, result.message);
					}
				});
			})
			.catch((err: unknown) => {
				finishLaunch(false, err instanceof Error ? err.message : 'Failed to fetch Asana task');
			});
	};

	// Attach to a background session (`claude attach <short id>`).
	const handleAttachSession = (session: ClaudeAgentInfo) => {
		const selected = worktreeDetails[selectedIndex].worktree;
		const targetPath = getWorktreePath(selected);
		beginLaunch(`Attaching to Claude in ${selected.repositoryName}…`, () => {
			const result = claudeSessionService.attachSession(
				shortSessionId(session.sessionId ?? ''),
				targetPath,
				selected.repositoryPath,
				selected.projectPath,
				undefined,
				groveName,
				selected.name
			);
			finishLaunch(
				result.success,
				result.success ? `Attaching to Claude in ${selected.repositoryName}` : result.message
			);
		});
	};

	// Resume a standard (interactive) session (`claude --resume <session id>`).
	const handleResumeSession = (session: ClaudeAgentInfo) => {
		const selected = worktreeDetails[selectedIndex].worktree;
		const targetPath = getWorktreePath(selected);
		const settings = settingsService.readSettings();
		const terminal =
			settings.selectedClaudeTerminal ?? claudeSessionService.detectTerminal() ?? undefined;
		if (!terminal) {
			closeToBase();
			setError('No supported terminal found. This feature requires KDE Konsole or Kitty.');
			return;
		}
		beginLaunch(`Resuming Claude session in ${selected.repositoryName}…`, () => {
			const result = claudeSessionService.resumeSession(
				session.sessionId ?? '',
				targetPath,
				terminal,
				groveName,
				selected.name
			);
			finishLaunch(
				result.success,
				result.success ? `Resuming Claude session in ${selected.repositoryName}` : result.message
			);
		});
	};

	// Archive a session so Grove stops tracking/showing it (with confirmation).
	// Removes it from Claude's agent list (`claude rm`) and flags it archived in
	// the registry; the live list is then refreshed so it disappears.
	const handleArchiveSession = (session: ClaudeAgentInfo) => {
		const sessionId = session.sessionId;
		if (!sessionId) {
			return;
		}
		claudeSessionService.archiveSession(sessionId);
		// Reflect locally so the session disappears without waiting for the poll.
		setAgentSessions((prev) => prev.filter((agent) => agent.sessionId !== sessionId));
		setResultMessage('Terminated Claude session');
		setTimeout(() => setResultMessage(null), 2000);
	};

	// List the archived/terminated Claude sessions for the selected worktree and
	// allow resuming them.
	const handleShowArchivedSessions = () => {
		const selected = worktreeDetails[selectedIndex].worktree;
		closeToBase();
		navigate('archivedSessions', { groveId, worktreePath: selected.worktreePath });
	};

	const handleOpenInTerminal = async () => {
		const settings = settingsService.readSettings();

		// Resolve terminal config, respecting Claude terminal preference
		const terminalConfig = settings.selectedClaudeTerminal
			? ((await detectTerminal(settings.selectedClaudeTerminal)) ?? settings.terminal)
			: settings.terminal;

		if (!terminalConfig) {
			closeToBase();
			setError('No terminal configured. Please restart Grove to detect available terminals.');
			return;
		}

		const selectedWorktree = worktreeDetails[selectedIndex].worktree;
		const targetPath = getWorktreePath(selectedWorktree);
		const result = openTerminalInPath(targetPath, terminalConfig);
		closeToBase();
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
		const { config, resolvedType } = getIDEConfigForWorktree(
			groveConfigService,
			selectedWorktree,
			settings,
			targetPath
		);

		if (!config) {
			closeToBase();
			setError('No IDE configured. Please configure an IDE in Settings or .grove.json.');
			return;
		}

		const result = openIDEInPath(targetPath, config);
		closeToBase();
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
			closeToBase();
			setError('No init actions were executed for this worktree');
			return;
		}

		// Log file is now stored in the grove directory (next to CONTEXT.md)
		const logPath = path.join(grovePath, selectedWorktree.initActionsStatus.logFile);

		try {
			const content = fs.readFileSync(logPath, 'utf-8');
			setUIMode({ type: 'initLog', content });
		} catch (err) {
			closeToBase();
			setError(`Failed to read init log: ${err instanceof Error ? err.message : 'Unknown error'}`);
		}
	};

	const handleFork = () => {
		const selected = worktreeDetails[selectedIndex].worktree;
		closeToBase();
		navigate('forkWorktree', { groveId, worktreePath: selected.worktreePath });
	};

	const handleCloseWorktree = () => {
		const selected = worktreeDetails[selectedIndex].worktree;
		closeToBase();
		navigate('closeWorktree', { groveId, worktreePath: selected.worktreePath });
	};

	// Open the attach-Asana prompt for a worktree.
	const startAttachAsana = (worktreePath: string) => {
		setUIMode({ type: 'asanaAttach', worktreePath, input: '', error: '', busy: false });
	};

	const cancelAttachAsana = () => {
		closeToBase();
	};

	// Verify the pasted Asana task URL via the API, then persist it onto the worktree.
	const submitAttachAsana = (value: string) => {
		if (uiMode.type !== 'asanaAttach') {
			return;
		}
		const worktreePath = uiMode.worktreePath;

		const parsed = parseAsanaTaskUrl(value);
		if (!parsed) {
			setUIMode({ ...uiMode, error: 'That does not look like an Asana task URL.' });
			return;
		}
		if (!asanaPlugin) {
			setUIMode({ ...uiMode, error: 'Asana plugin is not available.' });
			return;
		}

		setUIMode({ ...uiMode, busy: true, error: '' });

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
				const message = err instanceof Error ? err.message : 'Failed to fetch Asana task';
				setUIMode((prev) =>
					prev.type === 'asanaAttach' ? { ...prev, busy: false, error: message } : prev
				);
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

	// Non-Claude worktree actions. Claude launching/resuming lives in the Claude
	// panels below the worktree panel (see renderClaudeSection).
	const worktreeActions = isSelectedWorktreeClosed
		? []
		: [
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
					label: 'Show Archived Sessions',
					action: handleShowArchivedSessions,
				},
				{
					label: 'Close Worktree',
					action: handleCloseWorktree,
				},
			];

	// Claude sessions tracked to the worktree whose actions are shown.
	const actionsSessions = selectedWorktree ? getAgentSessionsForWorktree(selectedWorktree) : [];
	// The actions list is: [Launch Claude, ...one row per session, ...worktreeActions].
	const claudeRowCount = isSelectedWorktreeClosed ? 0 : 1 + actionsSessions.length;
	const totalActionItems = claudeRowCount + worktreeActions.length;

	// Options shown in the active Claude submenu (launch / per-session / archive confirm).
	const getClaudeSubmenuOptions = (): { label: string; run: () => void }[] => {
		if (uiMode.type !== 'claudeSubmenu') {
			return [];
		}
		if (uiMode.mode === 'launch') {
			const options = [
				{
					label: 'Launch background claude',
					run: () => {
						closeToBase();
						handleInstantClaude();
					},
				},
				{
					label: 'Launch standard claude',
					run: () => {
						closeToBase();
						handleOpenInClaude();
					},
				},
			];
			// Offer seeding the prompt from a linked Asana task, when one is attached
			// and the Asana plugin is active.
			const selected = worktreeDetails[selectedIndex]?.worktree;
			if (asanaEnabled && asanaPlugin && selected?.reference?.type === 'asana') {
				options.push({
					label: 'Launch instant Claude from Asana',
					run: () => {
						closeToBase();
						handleInstantClaudeFromAsana();
					},
				});
			}
			return options;
		}
		const session = actionsSessions.find((s) => s.sessionId === uiMode.sessionId);
		if (!session) {
			return [];
		}
		if (uiMode.mode === 'session') {
			const isBackground = session.kind === 'background';
			return [
				isBackground
					? {
							label: 'Attach',
							run: () => {
								closeToBase();
								handleAttachSession(session);
							},
						}
					: {
							label: 'Resume',
							run: () => {
								closeToBase();
								handleResumeSession(session);
							},
						},
				{
					label: 'Terminate',
					run: () => {
						setUIMode({
							type: 'claudeSubmenu',
							mode: 'archiveConfirm',
							sessionId: session.sessionId ?? '',
						});
						setSubmenuIndex(0);
					},
				},
			];
		}
		// archiveConfirm
		return [
			{
				label: 'Yes, terminate this session',
				run: () => {
					closeToBase();
					handleArchiveSession(session);
				},
			},
			{
				label: 'Cancel',
				run: () => {
					setUIMode({ type: 'claudeSubmenu', mode: 'session', sessionId: session.sessionId ?? '' });
					setSubmenuIndex(0);
				},
			},
		];
	};

	// Activate an item in the combined actions list (Claude rows + worktreeActions).
	// Claude rows are ordered [...one row per session, Launch Claude].
	const activateActionItem = (index: number) => {
		if (claudeRowCount > 0 && index >= 0 && index < actionsSessions.length) {
			const session = actionsSessions[index];
			setUIMode({ type: 'claudeSubmenu', mode: 'session', sessionId: session.sessionId ?? '' });
			setSubmenuIndex(0);
			return;
		}
		if (claudeRowCount > 0 && index === actionsSessions.length) {
			setUIMode({ type: 'claudeSubmenu', mode: 'launch' });
			setSubmenuIndex(0);
			return;
		}
		worktreeActions[index - claudeRowCount]?.action();
	};

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
			setUIMode({ type: 'actions' });
			setSelectedActionIndex(0);
		}
	};

	// Mouse: releasing on an action-list item runs it. `index` is local to the
	// worktreeActions list, which sits after the Claude rows in the combined list.
	const handleActionActivate = (index: number) => {
		setSelectedActionIndex(claudeRowCount + index);
		worktreeActions[index]?.action();
	};

	// Handle keyboard navigation. Each mode owns only its own keys; transitions
	// between modes (especially Esc) are explicit per branch.
	useInput(
		(input, key) => {
			switch (uiMode.type) {
				case 'asanaAttach': {
					// The attach prompt's text input handles typing/submit; only Esc cancels here.
					if (key.escape) {
						cancelAttachAsana();
					}
					return;
				}
				case 'initLog': {
					// Init log viewer: Esc returns to the base view.
					if (key.escape) {
						closeToBase();
					}
					return;
				}
				case 'claudeSubmenu': {
					// Claude submenu navigation (launch / per-session / archive confirm).
					const options = getClaudeSubmenuOptions();
					if (key.escape) {
						// archiveConfirm steps back to the per-session menu; everything else closes.
						if (uiMode.mode === 'archiveConfirm') {
							setUIMode({ type: 'claudeSubmenu', mode: 'session', sessionId: uiMode.sessionId });
						} else {
							closeToBase();
						}
						setSubmenuIndex(0);
					} else if (key.upArrow && options.length > 0) {
						setSubmenuIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
					} else if (key.downArrow && options.length > 0) {
						setSubmenuIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
					} else if (key.return && options.length > 0) {
						options[Math.min(submenuIndex, options.length - 1)].run();
					}
					return;
				}
				case 'actions': {
					// Actions menu navigation (the inline menu in single-worktree mode, or the
					// overlay in multi-worktree mode).
					if (key.escape) {
						if (!isSingleWorktreeMode) {
							// Multiple worktrees: close the actions overlay back to the list.
							setUIMode({ type: 'list' });
							setSelectedActionIndex(0);
						} else {
							// Single worktree: go back to home.
							goBack();
						}
					} else if (
						(key.leftArrow || key.rightArrow) &&
						claudeRowCount > 1 &&
						selectedActionIndex < claudeRowCount
					) {
						// The Claude panels sit side by side, so left/right cycle between them.
						const dir = key.rightArrow ? 1 : -1;
						setSelectedActionIndex((prev) => (prev + dir + claudeRowCount) % claudeRowCount);
					} else if (key.upArrow && totalActionItems > 0) {
						// Up/down move between the Claude panel block and the menu below it;
						// the panels (left/right) count as a single row here.
						setSelectedActionIndex((prev) => {
							if (claudeRowCount > 0 && prev < claudeRowCount) {
								return totalActionItems - 1;
							}
							if (claudeRowCount > 0 && prev === claudeRowCount) {
								return 0;
							}
							return prev > 0 ? prev - 1 : totalActionItems - 1;
						});
					} else if (key.downArrow && totalActionItems > 0) {
						setSelectedActionIndex((prev) => {
							if (claudeRowCount > 0 && prev < claudeRowCount) {
								return claudeRowCount;
							}
							return prev < totalActionItems - 1 ? prev + 1 : 0;
						});
					} else if (key.return && totalActionItems > 0) {
						activateActionItem(Math.min(selectedActionIndex, totalActionItems - 1));
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
					return;
				}
				case 'list': {
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
						setUIMode({ type: 'actions' });
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
					return;
				}
			}
		},
		{ isActive: !resultMessage && !launchingMessage }
	);

	// Renders the Claude section shown in the worktree actions/detail view: the
	// active submenu, or the "Launch Claude" panel followed by one panel per
	// tracked session.
	const renderClaudeSection = () => {
		if (isSelectedWorktreeClosed) {
			return null;
		}

		if (uiMode.type === 'claudeSubmenu') {
			const options = getClaudeSubmenuOptions();
			const title =
				uiMode.mode === 'launch'
					? 'Launch Claude'
					: uiMode.mode === 'archiveConfirm'
						? 'Terminate this session?'
						: 'Session actions';
			return (
				<Box flexDirection="column" marginBottom={1}>
					<Box marginBottom={1}>
						<Text bold color="green">
							{title}
						</Text>
					</Box>
					{uiMode.mode === 'archiveConfirm' && (
						<Box marginBottom={1}>
							<Text dimColor>
								This terminates the running Claude session (`claude rm`) and removes it from Grove. You can
								always resume the session later.
							</Text>
						</Box>
					)}
					{options.map((opt, i) => (
						<Text key={opt.label} color={submenuIndex === i ? 'cyan' : undefined}>
							{submenuIndex === i ? '❯ ' : '  '}
							{opt.label}
						</Text>
					))}
					<Box marginTop={1}>
						<Text dimColor>↑↓ Navigate • Enter Select • ESC Back</Text>
					</Box>
				</Box>
			);
		}

		const launchIndex = actionsSessions.length;
		const launchSelected = selectedActionIndex === launchIndex;
		const panelWidth = 42;

		return (
			<Box flexDirection="row" flexWrap="wrap" marginBottom={1}>
				{/* One panel per tracked session (rows 0..N-1) */}
				{actionsSessions.map((session, i) => {
					const isSel = selectedActionIndex === i;
					const meta = getAgentStatusMeta(session.status);
					const status = session.status ?? 'unknown';
					const statusText =
						session.waitingFor && (status === 'waiting' || status === 'blocked')
							? `${status} — ${session.waitingFor}`
							: status;
					return (
						<ClickableTile
							key={session.sessionId ?? i}
							onPress={() => setSelectedActionIndex(i)}
							onRelease={() => activateActionItem(i)}
						>
							<Box
								borderStyle={isSel ? 'round' : 'single'}
								borderColor={isSel ? 'cyan' : 'gray'}
								paddingX={1}
								marginRight={1}
								marginBottom={1}
								width={panelWidth}
								flexDirection="column"
							>
								<Text bold color={isSel ? 'cyan' : undefined} wrap="truncate-end">
									{session.name || shortSessionId(session.sessionId ?? '')}
								</Text>
								<Box>
									<Text dimColor>Status: </Text>
									<AgentStatusIcon status={session.status} />
									<Text color={meta.color} wrap="truncate-end">
										{' '}
										{statusText}
									</Text>
								</Box>
								<Text dimColor wrap="truncate-end">
									ID: {shortSessionId(session.sessionId ?? '') || 'unknown'}
								</Text>
							</Box>
						</ClickableTile>
					);
				})}

				{/* Launch Claude panel (last row), sized to match the session panels */}
				<ClickableTile
					onPress={() => setSelectedActionIndex(launchIndex)}
					onRelease={() => activateActionItem(launchIndex)}
				>
					<Box
						borderStyle={launchSelected ? 'round' : 'single'}
						borderColor={launchSelected ? 'cyan' : 'gray'}
						paddingX={1}
						marginRight={1}
						marginBottom={1}
						width={panelWidth}
						flexDirection="column"
						justifyContent="center"
					>
						<Text bold color={launchSelected ? 'cyan' : undefined}>
							＋ Launch Claude
						</Text>
						<Text dimColor>Background or</Text>
						<Text dimColor>standard session</Text>
					</Box>
				</ClickableTile>
			</Box>
		);
	};

	if (launchingMessage) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="cyan">{launchingMessage}</Text>
				<Box marginTop={1}>
					<Text dimColor>Please wait…</Text>
				</Box>
			</Box>
		);
	}

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

	if (uiMode.type === 'initLog') {
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
					{uiMode.content.split('\n').map((line, index) => (
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

	if (uiMode.type === 'asanaAttach') {
		const attachMode = uiMode;
		const attachingWorktree = worktreeDetails.find(
			(d) => d.worktree.worktreePath === attachMode.worktreePath
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
					{attachMode.busy ? (
						<Text dimColor>Verifying task…</Text>
					) : (
						<Box flexGrow={1}>
							<TextInput
								value={attachMode.input}
								onChange={(value) => {
									setUIMode((prev) =>
										prev.type === 'asanaAttach' ? { ...prev, input: value, error: '' } : prev
									);
								}}
								onSubmit={submitAttachAsana}
								placeholder="https://app.asana.com/..."
							/>
						</Box>
					)}
				</Box>

				{attachMode.error && (
					<Box marginTop={1}>
						<Text color="red">{attachMode.error}</Text>
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
			{(uiMode.type === 'actions' || uiMode.type === 'claudeSubmenu') && !isSingleWorktreeMode ? (
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
								agentSessions={getAgentSessionsForWorktree(worktreeDetails[selectedIndex].worktree)}
								showInitActions={true}
								showSessions={false}
								asanaEnabled={asanaEnabled}
								onAttachAsana={() => startAttachAsana(worktreeDetails[selectedIndex].worktree.worktreePath)}
							/>
						</Box>
					)}

					{/* Claude: launch panel + tracked sessions (or active submenu) */}
					{renderClaudeSection()}

					{/* Other actions */}
					{uiMode.type !== 'claudeSubmenu' && (
						<WorktreeActionList
							actions={worktreeActions}
							selectedIndex={selectedActionIndex - claudeRowCount}
							onSelect={(i) => setSelectedActionIndex(claudeRowCount + i)}
							onActivate={handleActionActivate}
						/>
					)}

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

								const worktreeAgentSessions = getAgentSessionsForWorktree(detail.worktree);

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
												agentSessions={worktreeAgentSessions}
												showInitActions={isSingleWorktreeMode}
												showSessions={!isSingleWorktreeMode}
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
									Claude
								</Text>
							</Box>

							{/* Claude: launch panel + tracked sessions (or active submenu) */}
							{renderClaudeSection()}

							{uiMode.type !== 'claudeSubmenu' && (
								<>
									<Box marginBottom={1}>
										<Text bold underline>
											Actions
										</Text>
									</Box>

									<WorktreeActionList
										actions={worktreeActions}
										selectedIndex={selectedActionIndex - claudeRowCount}
										onSelect={(i) => setSelectedActionIndex(claudeRowCount + i)}
										onActivate={handleActionActivate}
									/>
								</>
							)}
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

import React, { useMemo } from 'react';

import { Box, Text, useInput } from 'ink';

import type { RecentSelection, Repository } from '../storage/index.js';

/** An item in the combined list (recent selection or registered repository). */
interface ListItem {
	type: 'recent' | 'repo';
	recent?: RecentSelection;
	repo?: Repository;
	repoIndex?: number;
	displayName: string;
}

interface RepositorySelectorProps {
	/** Green bold header line. */
	title: string;
	/** Instruction line under the header. */
	instruction: string;
	repositories: Repository[];
	recent: RecentSelection[];
	getRecentDisplayName: (recent: RecentSelection) => string;
	/** Whether monorepo project folders are still loading (gates the next step). */
	projectsLoading: boolean;
	/** Multi-select (grove creation) vs single-select (add worktree). */
	multiSelect: boolean;
	/** Cursor position, owned by the parent so it survives a return from the project step. */
	cursorIndex: number;
	onCursorChange: (index: number) => void;
	onCancel: () => void;
	/** Single-select: a recent item was chosen. */
	onPickRecent?: (recent: RecentSelection) => void;
	/** Single-select: a repository was chosen (gated for monorepo loading). */
	onPickRepo?: (repoIndex: number) => void;
	/** Multi-select: the parent-owned set of selected repository indices. */
	selectedRepoIndices?: Set<number>;
	/** Multi-select: the parent-owned set of selected recent keys. */
	selectedRecentKeys?: Set<string>;
	onToggleRepo?: (repoIndex: number) => void;
	onToggleRecent?: (key: string) => void;
	/** Multi-select: the user confirmed their selection (Enter). */
	onConfirm?: () => void;
}

/** Stable key for a recent selection (repo path, plus project path when present). */
export function getRecentKey(recent: RecentSelection): string {
	return recent.projectPath
		? `${recent.repositoryPath}::${recent.projectPath}`
		: recent.repositoryPath;
}

/**
 * Repository selection step shared by the grove-creation and add-worktree flows.
 * Renders the recent + repository list and owns key handling, but is otherwise
 * controlled: the cursor and (in multi-select) the selection sets live in the
 * parent so they survive a round-trip through the project step.
 */
export function RepositorySelector({
	title,
	instruction,
	repositories,
	recent,
	getRecentDisplayName,
	projectsLoading,
	multiSelect,
	cursorIndex,
	onCursorChange,
	onCancel,
	onPickRecent,
	onPickRepo,
	selectedRepoIndices,
	selectedRecentKeys,
	onToggleRepo,
	onToggleRecent,
	onConfirm,
}: RepositorySelectorProps) {
	const listItems = useMemo((): ListItem[] => {
		const items: ListItem[] = [];

		for (const r of recent) {
			items.push({ type: 'recent', recent: r, displayName: getRecentDisplayName(r) });
		}

		for (let i = 0; i < repositories.length; i++) {
			items.push({
				type: 'repo',
				repo: repositories[i],
				repoIndex: i,
				displayName: repositories[i].name,
			});
		}

		return items;
	}, [recent, repositories, getRecentDisplayName]);

	const repoSet = selectedRepoIndices ?? new Set<number>();
	const recentSet = selectedRecentKeys ?? new Set<string>();

	// Selected monorepos drive the "select projects" hint and the Enter gate.
	const hasMonorepos = useMemo(
		() => Array.from(repoSet).some((i) => repositories[i]?.isMonorepo),
		[repoSet, repositories]
	);
	const hasAnySelection = repoSet.size > 0 || recentSet.size > 0;

	useInput((input, key) => {
		if (key.upArrow) {
			onCursorChange(cursorIndex > 0 ? cursorIndex - 1 : listItems.length - 1);
			return;
		}
		if (key.downArrow) {
			onCursorChange(cursorIndex < listItems.length - 1 ? cursorIndex + 1 : 0);
			return;
		}
		if (key.escape) {
			onCancel();
			return;
		}

		const item = listItems[cursorIndex];

		if (multiSelect) {
			if (input === ' ') {
				if (item?.type === 'recent' && item.recent) {
					onToggleRecent?.(getRecentKey(item.recent));
				} else if (item?.type === 'repo' && item.repoIndex !== undefined) {
					onToggleRepo?.(item.repoIndex);
				}
			} else if (key.return) {
				// Wait for monorepo project folders before deciding the next step.
				if (hasMonorepos && projectsLoading) {
					return;
				}
				onConfirm?.();
			}
			return;
		}

		// Single-select: Space or Enter chooses the highlighted item.
		if (input === ' ' || key.return) {
			if (!item) return;

			if (item.type === 'recent' && item.recent) {
				onPickRecent?.(item.recent);
			} else if (item.type === 'repo' && item.repo && item.repoIndex !== undefined) {
				// Monorepos may need a project step; wait until folders are loaded.
				if (item.repo.isMonorepo && projectsLoading) {
					return;
				}
				onPickRepo?.(item.repoIndex);
			}
		}
	});

	const hasRecent = recent.length > 0;
	const totalSelected = repoSet.size + recentSet.size;

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="green">
					{title}
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text>{instruction}</Text>
			</Box>

			<Box flexDirection="column" marginLeft={2}>
				{listItems.map((item, index) => {
					const isCursor = index === cursorIndex;
					const showSeparator = hasRecent && item.type === 'repo' && index === recent.length;

					if (item.type === 'recent' && item.recent) {
						const key = getRecentKey(item.recent);
						const isSelected = recentSet.has(key);
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
										{multiSelect ? `[${isSelected ? '✓' : ' '}] ` : ''}
										<Text color="yellow">★</Text> {item.displayName}
									</Text>
								</Box>
							</Box>
						);
					}

					if (item.type === 'repo' && item.repo && item.repoIndex !== undefined) {
						const isSelected = repoSet.has(item.repoIndex);
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
										{isCursor ? '❯ ' : '  '}
										{multiSelect ? `[${isSelected ? '✓' : ' '}] ` : ''}
										{item.displayName}
										<Text dimColor>{monorepoIndicator}</Text>
									</Text>
								</Box>
							</Box>
						);
					}

					return null;
				})}
			</Box>

			{multiSelect ? (
				<>
					<Box marginTop={1} flexDirection="column">
						<Text dimColor>• Use ↑/↓ to navigate</Text>
						<Text dimColor>• Space to toggle selection</Text>
						<Text dimColor>
							• Enter to {hasMonorepos ? 'select projects' : 'create grove'}
							{!hasAnySelection && ' (empty grove - add worktrees later)'}
						</Text>
						<Text dimColor>• Esc to cancel</Text>
					</Box>

					{hasMonorepos && projectsLoading && (
						<Box marginTop={1}>
							<Text dimColor>Loading monorepo projects…</Text>
						</Box>
					)}

					<Box marginTop={1}>
						<Text color="yellow">
							Selected: {totalSelected} / {listItems.length}
						</Text>
					</Box>
				</>
			) : (
				<>
					<Box marginTop={1} flexDirection="column">
						<Text dimColor>• Use ↑/↓ to navigate</Text>
						<Text dimColor>• Enter or Space to select</Text>
						<Text dimColor>• Esc to go back</Text>
					</Box>

					{projectsLoading && (
						<Box marginTop={1}>
							<Text dimColor>Loading monorepo projects…</Text>
						</Box>
					)}
				</>
			)}
		</Box>
	);
}

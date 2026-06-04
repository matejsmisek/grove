import React from 'react';

import { Box, Text } from 'ink';

import { useService } from '../../di/index.js';
import { useMergeRequestStatus } from '../../hooks/useMergeRequestStatus.js';
import { GrovesServiceToken } from '../../services/tokens.js';
import type { GroveReference } from '../../storage/index.js';
import { formatTimeAgo } from '../../utils/time.js';
import { MergeRequestCell } from '../MergeRequestCell.js';
import { SessionIndicator } from '../SessionIndicator.js';

type GrovePanelProps = {
	grove: GroveReference;
	isSelected: boolean;
	sessionCounts?: {
		active: number;
		idle: number;
		attention: number;
		closed: number;
	};
	width?: number;
};

export function GrovePanel({ grove, isSelected, sessionCounts, width = 24 }: GrovePanelProps) {
	const grovesService = useService(GrovesServiceToken);

	// Get grove metadata to count worktrees
	let worktreeCount = 0;
	let repoDisplayName = '';
	// For single-worktree groves, the grove maps 1:1 to a branch, so we surface its MR.
	let singleRepositoryPath: string | undefined;
	let singleBranch: string | undefined;
	try {
		const metadata = grovesService.readGroveMetadata(grove.path);
		if (metadata) {
			worktreeCount = metadata.worktrees.length;
			// For single worktree groves, get the repo name
			if (worktreeCount === 1) {
				const worktree = metadata.worktrees[0];
				if (worktree) {
					repoDisplayName = worktree.repositoryName;
					// For monorepos, append the project name
					if (worktree.projectPath) {
						const projectName = worktree.projectPath.split('/').pop() || '';
						repoDisplayName = `${repoDisplayName}.${projectName}`;
					}
					if (!worktree.closed) {
						singleRepositoryPath = worktree.repositoryPath;
						singleBranch = worktree.branch;
					}
				}
			}
		}
	} catch {
		// If we can't read metadata, just show 0
	}

	const mr = useMergeRequestStatus(singleRepositoryPath, singleBranch, worktreeCount === 1);

	return (
		<Box
			borderStyle="round"
			borderColor={isSelected ? 'cyan' : 'gray'}
			paddingX={1}
			paddingY={1}
			width={width}
			flexDirection="column"
		>
			{/* Grove name */}
			<Box>
				<Text bold color={isSelected ? 'cyan' : 'white'}>
					{grove.name}
				</Text>
			</Box>

			{/* Time ago */}
			<Box marginTop={1}>
				<Text dimColor>Created {formatTimeAgo(grove.createdAt)}</Text>
			</Box>

			{/* Worktree count or repo name */}
			<Box marginTop={1}>
				<Text color="green">
					{worktreeCount === 1
						? repoDisplayName
						: `${worktreeCount} worktree${worktreeCount !== 1 ? 's' : ''}`}
				</Text>
			</Box>

			{/* Merge request status (single-worktree groves only) */}
			{mr && (
				<Box marginTop={1}>
					<MergeRequestCell mr={mr} />
				</Box>
			)}

			{/* Session indicators */}
			{sessionCounts && (
				<Box marginTop={1}>
					<SessionIndicator
						activeCount={sessionCounts.active}
						idleCount={sessionCounts.idle}
						attentionCount={sessionCounts.attention}
						closedCount={sessionCounts.closed}
					/>
				</Box>
			)}
		</Box>
	);
}

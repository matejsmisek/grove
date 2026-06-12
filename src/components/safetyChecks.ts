import type { BranchUpstreamStatus } from '../services/types.js';
import type { SafetyCheck } from './SafetyConfirmation.js';

export interface WorktreeCheckInput {
	hasUncommittedChanges: boolean;
	hasUnpushedCommits: boolean;
	upstreamStatus: BranchUpstreamStatus;
}

/**
 * A worktree has issues (work that would be lost on close) when it has
 * uncommitted changes, unpushed commits (also covers a no-upstream branch whose
 * HEAD is not on any remote), or a pushed-but-unmerged branch ('active'). An
 * untouched branch with no upstream and nothing to lose is not an issue.
 */
export function worktreeHasIssues(input: WorktreeCheckInput): boolean {
	return (
		input.hasUncommittedChanges || input.hasUnpushedCommits || input.upstreamStatus === 'active'
	);
}

/** Build the three standard safety-check lines for a worktree. */
export function buildWorktreeSafetyChecks(input: WorktreeCheckInput): SafetyCheck[] {
	const branchStatus: SafetyCheck =
		input.upstreamStatus === 'gone'
			? { label: 'Branch status', status: 'ok', valueText: 'Merged' }
			: input.upstreamStatus === 'active'
				? { label: 'Branch status', status: 'warning', valueText: 'Not merged' }
				: input.hasUnpushedCommits
					? { label: 'Branch status', status: 'warning', valueText: 'No upstream' }
					: { label: 'Branch status', status: 'ok', valueText: 'No upstream' };

	return [
		{
			label: 'Uncommitted changes',
			status: input.hasUncommittedChanges ? 'warning' : 'ok',
			valueText: input.hasUncommittedChanges ? 'Yes' : 'No',
		},
		{
			label: 'Unpushed commits',
			status: input.hasUnpushedCommits ? 'warning' : 'ok',
			valueText: input.hasUnpushedCommits ? 'Yes' : 'No',
		},
		branchStatus,
	];
}

/**
 * Shared safety evaluation for closing a worktree from the CLI.
 *
 * This mirrors the checks the interactive close screens run (uncommitted changes,
 * unpushed commits, branch upstream status — see `components/safetyChecks.ts`) and
 * layers two improvements the CLI needs:
 *
 *  1. A best-effort `git fetch --prune` so a branch whose upstream was merged and
 *     then deleted on the remote is correctly reported as `gone` (merged) instead
 *     of looking like it was never pushed.
 *  2. A GitLab merge-request override: when the plugin is enabled and the branch's
 *     tied MR is merged, the branch/push status is authoritative proof the work
 *     landed and is ignored (only genuinely local uncommitted changes still flag).
 */
import { worktreeHasIssues } from '../components/safetyChecks.js';
import type { GitLabPlugin } from '../plugins/gitlab/GitLabPlugin.js';
import type { IGitService } from '../services/GitService.js';
import type { BranchUpstreamStatus } from '../services/types.js';
import type { Worktree } from '../storage/types.js';

export interface WorktreeSafety {
	hasUncommittedChanges: boolean;
	hasUnpushedCommits: boolean;
	upstreamStatus: BranchUpstreamStatus;
	/** True when a tied GitLab MR is merged; overrides branch/push status. */
	mrMerged: boolean;
	/** Overall verdict: would closing this worktree risk losing work? */
	hasIssues: boolean;
}

export interface WorktreeSafetyDeps {
	gitService: IGitService;
	gitlabPlugin: GitLabPlugin;
}

export interface WorktreeSafetyOptions {
	/**
	 * Run a best-effort `git fetch --prune` before inspecting branch status so a
	 * merged-and-deleted remote branch is detected as gone. Failures are ignored.
	 */
	prune?: boolean;
}

/**
 * Evaluate whether a worktree can be closed without losing work.
 */
export async function computeWorktreeSafety(
	deps: WorktreeSafetyDeps,
	worktree: Worktree,
	options: WorktreeSafetyOptions = {}
): Promise<WorktreeSafety> {
	const { gitService } = deps;
	const repoPath = worktree.worktreePath;

	if (options.prune) {
		// Best-effort: refresh remote-tracking refs so an upstream deleted after a
		// merge shows as `gone`. Never fail the check on a network error.
		try {
			await gitService.pruneRemote(repoPath);
		} catch {
			// Offline or no remote — fall back to the last-known local state.
		}
	}

	const [hasUncommittedChanges, hasUnpushedCommits, upstreamStatus] = await Promise.all([
		gitService.hasUncommittedChanges(repoPath),
		gitService.hasUnpushedCommits(repoPath),
		gitService.getBranchUpstreamStatus(repoPath),
	]);

	const mrMerged = await isTiedMergeRequestMerged(deps, worktree);

	// A merged MR means the branch's commits have landed, so unpushed/unmerged
	// branch state no longer represents lost work. Uncommitted changes live only
	// in the working tree and are never captured by an MR, so they always count.
	const baseIssues = worktreeHasIssues({
		hasUncommittedChanges,
		hasUnpushedCommits,
		upstreamStatus,
	});
	const hasIssues = mrMerged ? hasUncommittedChanges : baseIssues;

	return { hasUncommittedChanges, hasUnpushedCommits, upstreamStatus, mrMerged, hasIssues };
}

/**
 * Human-readable reasons a worktree is flagged, for CLI warnings. Empty when the
 * worktree is safe to close.
 */
export function describeWorktreeIssues(safety: WorktreeSafety): string[] {
	const reasons: string[] = [];
	if (safety.hasUncommittedChanges) {
		reasons.push('uncommitted changes');
	}
	if (!safety.mrMerged) {
		if (safety.hasUnpushedCommits) {
			reasons.push('unpushed commits');
		}
		if (safety.upstreamStatus === 'active') {
			reasons.push('branch not merged');
		}
	}
	return reasons;
}

/**
 * Whether the GitLab MR tied to the worktree's branch is merged. Returns false
 * (no override) when the plugin is disabled/unconfigured, when there is no MR, or
 * on any lookup error — the git-based checks then decide.
 */
async function isTiedMergeRequestMerged(
	deps: WorktreeSafetyDeps,
	worktree: Worktree
): Promise<boolean> {
	const { gitService, gitlabPlugin } = deps;

	if (!gitlabPlugin.isEnabled() || !gitlabPlugin.getAccessToken()) {
		return false;
	}

	try {
		const remoteUrl = await gitService.getRemoteUrl(worktree.repositoryPath);
		if (!remoteUrl) {
			return false;
		}
		const status = await gitlabPlugin.getMergeRequestStatus(remoteUrl, worktree.branch);
		return status?.status === 'merged';
	} catch {
		return false;
	}
}

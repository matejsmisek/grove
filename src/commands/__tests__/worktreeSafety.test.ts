import { describe, expect, it, vi } from 'vitest';

import type { GitLabPlugin } from '../../plugins/gitlab/GitLabPlugin.js';
import type { IGitService } from '../../services/GitService.js';
import type { BranchUpstreamStatus } from '../../services/types.js';
import type { Worktree } from '../../storage/types.js';
import {
	type WorktreeSafetyDeps,
	computeWorktreeSafety,
	describeWorktreeIssues,
} from '../worktreeSafety.js';

function createWorktree(overrides: Partial<Worktree> = {}): Worktree {
	return {
		id: 'wt-1',
		name: 'test-repo',
		repositoryName: 'test-repo',
		repositoryPath: '/repos/test-repo',
		worktreePath: '/groves/g/test-repo.worktree',
		branch: 'grove/test',
		...overrides,
	};
}

interface GitState {
	uncommitted?: boolean;
	unpushed?: boolean;
	upstream?: BranchUpstreamStatus;
	pruneRejects?: boolean;
	remoteUrl?: string | null;
}

function createDeps(
	git: GitState = {},
	gitlab: Partial<{
		enabled: boolean;
		token: string | undefined;
		mrStatus: string | null;
	}> = {}
): { deps: WorktreeSafetyDeps; pruneRemote: ReturnType<typeof vi.fn> } {
	const pruneRemote = vi.fn(async () => {
		if (git.pruneRejects) {
			throw new Error('offline');
		}
		return { success: true, stdout: '', stderr: '', exitCode: 0 };
	});

	const gitService = {
		hasUncommittedChanges: vi.fn(async () => git.uncommitted ?? false),
		hasUnpushedCommits: vi.fn(async () => git.unpushed ?? false),
		getBranchUpstreamStatus: vi.fn(async () => git.upstream ?? 'none'),
		getRemoteUrl: vi.fn(async () => git.remoteUrl ?? 'git@gitlab.com:group/test-repo.git'),
		pruneRemote,
	} as unknown as IGitService;

	const gitlabPlugin = {
		isEnabled: vi.fn(() => gitlab.enabled ?? false),
		getAccessToken: vi.fn(() => (gitlab.token === undefined ? undefined : gitlab.token)),
		getMergeRequestStatus: vi.fn(async () =>
			gitlab.mrStatus === undefined || gitlab.mrStatus === null
				? null
				: { iid: 1, webUrl: 'x', status: gitlab.mrStatus, approvalsGiven: 0, approvalsRequired: 0 }
		),
	} as unknown as GitLabPlugin;

	return { deps: { gitService, gitlabPlugin }, pruneRemote };
}

describe('computeWorktreeSafety', () => {
	it('reports no issues for a clean, upstream-less worktree', async () => {
		const { deps } = createDeps({ upstream: 'none' });
		const safety = await computeWorktreeSafety(deps, createWorktree());
		expect(safety.hasIssues).toBe(false);
	});

	it('flags uncommitted changes', async () => {
		const { deps } = createDeps({ uncommitted: true, upstream: 'none' });
		const safety = await computeWorktreeSafety(deps, createWorktree());
		expect(safety.hasIssues).toBe(true);
		expect(describeWorktreeIssues(safety)).toContain('uncommitted changes');
	});

	it('flags unpushed commits and an unmerged (active) branch', async () => {
		const unpushed = await computeWorktreeSafety(
			createDeps({ unpushed: true, upstream: 'none' }).deps,
			createWorktree()
		);
		expect(unpushed.hasIssues).toBe(true);

		const active = await computeWorktreeSafety(
			createDeps({ upstream: 'active' }).deps,
			createWorktree()
		);
		expect(active.hasIssues).toBe(true);
		expect(describeWorktreeIssues(active)).toContain('branch not merged');
	});

	it('treats a gone upstream (merged + deleted) as safe', async () => {
		const { deps } = createDeps({ upstream: 'gone' });
		const safety = await computeWorktreeSafety(deps, createWorktree());
		expect(safety.hasIssues).toBe(false);
	});

	it('runs a best-effort prune when requested and tolerates its failure', async () => {
		const { deps, pruneRemote } = createDeps({ upstream: 'gone', pruneRejects: true });
		const safety = await computeWorktreeSafety(deps, createWorktree(), { prune: true });
		expect(pruneRemote).toHaveBeenCalledWith('/groves/g/test-repo.worktree');
		expect(safety.hasIssues).toBe(false);
	});

	it('does not prune unless asked', async () => {
		const { deps, pruneRemote } = createDeps({ upstream: 'none' });
		await computeWorktreeSafety(deps, createWorktree());
		expect(pruneRemote).not.toHaveBeenCalled();
	});

	describe('GitLab MR override', () => {
		it('ignores branch/push status when the tied MR is merged', async () => {
			const { deps } = createDeps(
				{ unpushed: true, upstream: 'active' },
				{ enabled: true, token: 'tok', mrStatus: 'merged' }
			);
			const safety = await computeWorktreeSafety(deps, createWorktree());
			expect(safety.mrMerged).toBe(true);
			expect(safety.hasIssues).toBe(false);
			expect(describeWorktreeIssues(safety)).toEqual([]);
		});

		it('still flags uncommitted changes even when the MR is merged', async () => {
			const { deps } = createDeps(
				{ uncommitted: true, unpushed: true, upstream: 'active' },
				{ enabled: true, token: 'tok', mrStatus: 'merged' }
			);
			const safety = await computeWorktreeSafety(deps, createWorktree());
			expect(safety.hasIssues).toBe(true);
			expect(describeWorktreeIssues(safety)).toEqual(['uncommitted changes']);
		});

		it('does not override when the MR is still open', async () => {
			const { deps } = createDeps(
				{ upstream: 'active' },
				{ enabled: true, token: 'tok', mrStatus: 'open' }
			);
			const safety = await computeWorktreeSafety(deps, createWorktree());
			expect(safety.mrMerged).toBe(false);
			expect(safety.hasIssues).toBe(true);
		});

		it('does not consult GitLab when the plugin is disabled or unconfigured', async () => {
			const disabled = createDeps({ upstream: 'active' }, { enabled: false, token: 'tok' });
			await computeWorktreeSafety(disabled.deps, createWorktree());
			expect(disabled.deps.gitlabPlugin.getMergeRequestStatus).not.toHaveBeenCalled();

			const noToken = createDeps({ upstream: 'active' }, { enabled: true, token: undefined });
			await computeWorktreeSafety(noToken.deps, createWorktree());
			expect(noToken.deps.gitlabPlugin.getMergeRequestStatus).not.toHaveBeenCalled();
		});

		it('falls back to git checks when the MR lookup throws', async () => {
			const { deps } = createDeps(
				{ upstream: 'active' },
				{ enabled: true, token: 'tok', mrStatus: 'merged' }
			);
			vi.mocked(deps.gitlabPlugin.getMergeRequestStatus).mockRejectedValueOnce(new Error('boom'));
			const safety = await computeWorktreeSafety(deps, createWorktree());
			expect(safety.mrMerged).toBe(false);
			expect(safety.hasIssues).toBe(true);
		});
	});
});

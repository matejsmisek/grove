import { describe, expect, it } from 'vitest';

import { buildWorktreeSafetyChecks, worktreeHasIssues } from '../safetyChecks.js';

describe('worktreeHasIssues', () => {
	it('flags uncommitted changes', () => {
		expect(
			worktreeHasIssues({
				hasUncommittedChanges: true,
				hasUnpushedCommits: false,
				upstreamStatus: 'gone',
			})
		).toBe(true);
	});

	it('flags unpushed commits', () => {
		expect(
			worktreeHasIssues({
				hasUncommittedChanges: false,
				hasUnpushedCommits: true,
				upstreamStatus: 'none',
			})
		).toBe(true);
	});

	it('flags an active (pushed but unmerged) branch', () => {
		expect(
			worktreeHasIssues({
				hasUncommittedChanges: false,
				hasUnpushedCommits: false,
				upstreamStatus: 'active',
			})
		).toBe(true);
	});

	it('treats a merged, clean worktree as safe', () => {
		expect(
			worktreeHasIssues({
				hasUncommittedChanges: false,
				hasUnpushedCommits: false,
				upstreamStatus: 'gone',
			})
		).toBe(false);
	});

	it('treats an untouched no-upstream branch as safe', () => {
		expect(
			worktreeHasIssues({
				hasUncommittedChanges: false,
				hasUnpushedCommits: false,
				upstreamStatus: 'none',
			})
		).toBe(false);
	});
});

describe('buildWorktreeSafetyChecks', () => {
	it('renders Yes/No with warning/ok status for changes and commits', () => {
		const [uncommitted, unpushed] = buildWorktreeSafetyChecks({
			hasUncommittedChanges: true,
			hasUnpushedCommits: false,
			upstreamStatus: 'gone',
		});

		expect(uncommitted).toEqual({
			label: 'Uncommitted changes',
			status: 'warning',
			valueText: 'Yes',
		});
		expect(unpushed).toEqual({ label: 'Unpushed commits', status: 'ok', valueText: 'No' });
	});

	it('maps a gone upstream to a merged branch status', () => {
		const checks = buildWorktreeSafetyChecks({
			hasUncommittedChanges: false,
			hasUnpushedCommits: false,
			upstreamStatus: 'gone',
		});
		expect(checks[2]).toEqual({ label: 'Branch status', status: 'ok', valueText: 'Merged' });
	});

	it('maps an active upstream to a not-merged warning', () => {
		const checks = buildWorktreeSafetyChecks({
			hasUncommittedChanges: false,
			hasUnpushedCommits: false,
			upstreamStatus: 'active',
		});
		expect(checks[2]).toEqual({ label: 'Branch status', status: 'warning', valueText: 'Not merged' });
	});

	it('warns about no upstream when there are unpushed commits', () => {
		const checks = buildWorktreeSafetyChecks({
			hasUncommittedChanges: false,
			hasUnpushedCommits: true,
			upstreamStatus: 'none',
		});
		expect(checks[2]).toEqual({
			label: 'Branch status',
			status: 'warning',
			valueText: 'No upstream',
		});
	});

	it('treats no upstream with nothing to lose as ok', () => {
		const checks = buildWorktreeSafetyChecks({
			hasUncommittedChanges: false,
			hasUnpushedCommits: false,
			upstreamStatus: 'none',
		});
		expect(checks[2]).toEqual({ label: 'Branch status', status: 'ok', valueText: 'No upstream' });
	});
});

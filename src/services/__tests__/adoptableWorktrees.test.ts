import { describe, expect, it, vi } from 'vitest';

import type { IGrovesService } from '../../storage/GrovesService.js';
import type { GroveMetadata, Repository, Worktree } from '../../storage/types.js';
import type { IGitService } from '../GitService.js';
import { GitService } from '../GitService.js';
import { findAdoptableWorktrees } from '../adoptableWorktrees.js';

function createRepository(path: string, name: string): Repository {
	return { path, name, registeredAt: new Date().toISOString() };
}

/**
 * Build the porcelain output `git worktree list --porcelain` produces for a
 * main checkout plus the given linked worktrees.
 */
function porcelain(repoPath: string, worktrees: Array<{ path: string; branch?: string }>): string {
	const blocks = [
		`worktree ${repoPath}\nHEAD 1111111111111111111111111111111111111111\nbranch refs/heads/main\n`,
		...worktrees.map(
			(wt) =>
				`worktree ${wt.path}\nHEAD 2222222222222222222222222222222222222222\n${
					wt.branch ? `branch refs/heads/${wt.branch}\n` : 'detached\n'
				}`
		),
	];
	return blocks.join('\n');
}

/**
 * IGitService stub: listWorktrees serves canned porcelain per repo path;
 * parseWorktreeList reuses the real (pure) implementation.
 */
function createGitService(porcelainByRepo: Record<string, string>): IGitService {
	const real = new GitService();
	return {
		listWorktrees: vi.fn((repoPath: string) =>
			Promise.resolve(
				porcelainByRepo[repoPath] !== undefined
					? { success: true, stdout: porcelainByRepo[repoPath], stderr: '', exitCode: 0 }
					: { success: false, stdout: '', stderr: 'not a repo', exitCode: 128 }
			)
		),
		parseWorktreeList: (output: string) => real.parseWorktreeList(output),
	} as unknown as IGitService;
}

function createGrovesService(trackedWorktrees: Partial<Worktree>[]): IGrovesService {
	const metadata = {
		id: 'grove-1',
		name: 'Test Grove',
		worktrees: trackedWorktrees,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	} as GroveMetadata;

	return {
		getAllGroves: vi.fn().mockReturnValue([
			{
				id: 'grove-1',
				name: 'Test Grove',
				path: '/groves/test-grove',
				createdAt: metadata.createdAt,
				updatedAt: metadata.updatedAt,
			},
		]),
		readGroveMetadata: vi.fn().mockReturnValue(metadata),
	} as unknown as IGrovesService;
}

describe('findAdoptableWorktrees', () => {
	it('returns linked worktrees, excluding the main checkout', async () => {
		const repo = createRepository('/repos/app', 'app');
		const gitService = createGitService({
			'/repos/app': porcelain('/repos/app', [{ path: '/elsewhere/feature-wt', branch: 'feature' }]),
		});

		const found = await findAdoptableWorktrees(gitService, createGrovesService([]), [repo]);

		expect(found).toEqual([
			{ repository: repo, worktreePath: '/elsewhere/feature-wt', branch: 'feature' },
		]);
	});

	it('excludes worktrees a grove already tracks, unless the entry is closed', async () => {
		const repo = createRepository('/repos/app', 'app');
		const gitService = createGitService({
			'/repos/app': porcelain('/repos/app', [
				{ path: '/wt/tracked', branch: 'tracked' },
				{ path: '/wt/closed', branch: 'closed' },
				{ path: '/wt/free', branch: 'free' },
			]),
		});
		const grovesService = createGrovesService([
			{ worktreePath: '/wt/tracked' },
			{ worktreePath: '/wt/closed', closed: true },
		]);

		const found = await findAdoptableWorktrees(gitService, grovesService, [repo]);

		expect(found.map((wt) => wt.worktreePath)).toEqual(['/wt/closed', '/wt/free']);
	});

	it('skips repositories whose worktrees cannot be listed', async () => {
		const broken = createRepository('/repos/broken', 'broken');
		const ok = createRepository('/repos/ok', 'ok');
		const gitService = createGitService({
			'/repos/ok': porcelain('/repos/ok', [{ path: '/wt/ok-feature', branch: 'feature' }]),
		});

		const found = await findAdoptableWorktrees(gitService, createGrovesService([]), [broken, ok]);

		expect(found.map((wt) => wt.worktreePath)).toEqual(['/wt/ok-feature']);
	});

	it('reports a detached worktree with the "detached" pseudo-branch', async () => {
		const repo = createRepository('/repos/app', 'app');
		const gitService = createGitService({
			'/repos/app': porcelain('/repos/app', [{ path: '/wt/detached' }]),
		});

		const found = await findAdoptableWorktrees(gitService, createGrovesService([]), [repo]);

		expect(found).toEqual([{ repository: repo, worktreePath: '/wt/detached', branch: 'detached' }]);
	});

	it('returns an empty list when there are no linked worktrees', async () => {
		const repo = createRepository('/repos/app', 'app');
		const gitService = createGitService({ '/repos/app': porcelain('/repos/app', []) });

		const found = await findAdoptableWorktrees(gitService, createGrovesService([]), [repo]);

		expect(found).toEqual([]);
	});
});

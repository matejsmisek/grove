import { Volume } from 'memfs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { findMainRepoRootSync, getMonorepoProjects } from '../utils.js';

// Mock filesystem (mirrors the pattern used in service tests)
let vol: Volume;

vi.mock('fs', () => {
	return {
		default: new Proxy(
			{},
			{
				get(_target, prop) {
					return vol?.[prop as keyof Volume];
				},
			}
		),
		...Object.fromEntries(
			Object.getOwnPropertyNames(Volume.prototype)
				.filter((key) => key !== 'constructor')
				.map((key) => [key, (...args: unknown[]) => vol?.[key as keyof Volume]?.(...args)])
		),
	};
});

describe('getMonorepoProjects', () => {
	beforeEach(() => {
		vol = new Volume();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('returns directory names sorted, excluding files', async () => {
		vol.mkdirSync('/repo/packages', { recursive: true });
		vol.mkdirSync('/repo/apps', { recursive: true });
		vol.writeFileSync('/repo/README.md', 'x');

		const projects = await getMonorepoProjects('/repo');

		expect(projects).toEqual(['apps', 'packages']);
	});

	it('excludes ignored and hidden directories', async () => {
		vol.mkdirSync('/repo/src', { recursive: true });
		vol.mkdirSync('/repo/node_modules', { recursive: true });
		vol.mkdirSync('/repo/dist', { recursive: true });
		vol.mkdirSync('/repo/.git', { recursive: true });
		vol.mkdirSync('/repo/.hidden', { recursive: true });

		const projects = await getMonorepoProjects('/repo');

		expect(projects).toEqual(['src']);
	});

	it('returns an empty array for a non-existent directory', async () => {
		const projects = await getMonorepoProjects('/does/not/exist');

		expect(projects).toEqual([]);
	});
});

describe('findMainRepoRootSync', () => {
	beforeEach(() => {
		vol = new Volume();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('returns the repo root when .git is a directory', () => {
		vol.mkdirSync('/repos/app/.git', { recursive: true });

		expect(findMainRepoRootSync('/repos/app')).toBe('/repos/app');
	});

	it('finds the repo root from a nested subdirectory', () => {
		vol.mkdirSync('/repos/app/.git', { recursive: true });
		vol.mkdirSync('/repos/app/src/deep', { recursive: true });

		expect(findMainRepoRootSync('/repos/app/src/deep')).toBe('/repos/app');
	});

	it('resolves a linked worktree (.git file) back to the main repo root', () => {
		vol.mkdirSync('/repos/app/.git/worktrees/wt', { recursive: true });
		vol.mkdirSync('/repos/app/.grove/groves/g/wt', { recursive: true });
		vol.writeFileSync('/repos/app/.grove/groves/g/wt/.git', 'gitdir: /repos/app/.git/worktrees/wt\n');

		expect(findMainRepoRootSync('/repos/app/.grove/groves/g/wt')).toBe('/repos/app');
	});

	it('returns undefined when there is no git repo', () => {
		vol.mkdirSync('/plain/dir', { recursive: true });

		expect(findMainRepoRootSync('/plain/dir')).toBeUndefined();
	});
});

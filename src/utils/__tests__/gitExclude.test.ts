import { Volume } from 'memfs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureGroveGitExcluded } from '../gitExclude.js';

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

describe('ensureGroveGitExcluded', () => {
	beforeEach(() => {
		vol = new Volume();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('creates the exclude file and adds the .grove/ entry', () => {
		vol.mkdirSync('/repo/.git', { recursive: true });

		ensureGroveGitExcluded('/repo');

		const content = vol.readFileSync('/repo/.git/info/exclude', 'utf-8') as string;
		expect(content).toContain('.grove/');
	});

	it('appends to an existing exclude file with a trailing newline', () => {
		vol.mkdirSync('/repo/.git/info', { recursive: true });
		vol.writeFileSync('/repo/.git/info/exclude', '*.log\n');

		ensureGroveGitExcluded('/repo');

		const content = vol.readFileSync('/repo/.git/info/exclude', 'utf-8') as string;
		expect(content).toBe('*.log\n.grove/\n');
	});

	it('adds a separating newline when the file lacks a trailing newline', () => {
		vol.mkdirSync('/repo/.git/info', { recursive: true });
		vol.writeFileSync('/repo/.git/info/exclude', '*.log');

		ensureGroveGitExcluded('/repo');

		const content = vol.readFileSync('/repo/.git/info/exclude', 'utf-8') as string;
		expect(content).toBe('*.log\n.grove/\n');
	});

	it('is idempotent when .grove/ is already excluded', () => {
		vol.mkdirSync('/repo/.git/info', { recursive: true });
		vol.writeFileSync('/repo/.git/info/exclude', '.grove/\n');

		ensureGroveGitExcluded('/repo');

		const content = vol.readFileSync('/repo/.git/info/exclude', 'utf-8') as string;
		expect(content).toBe('.grove/\n');
	});

	it('treats a bare .grove entry as already excluded', () => {
		vol.mkdirSync('/repo/.git/info', { recursive: true });
		vol.writeFileSync('/repo/.git/info/exclude', '.grove\n');

		ensureGroveGitExcluded('/repo');

		const content = vol.readFileSync('/repo/.git/info/exclude', 'utf-8') as string;
		expect(content).toBe('.grove\n');
	});

	it('does nothing when .git is not a directory (e.g. a worktree)', () => {
		vol.mkdirSync('/wt', { recursive: true });
		vol.writeFileSync('/wt/.git', 'gitdir: /repo/.git/worktrees/wt\n');

		expect(() => ensureGroveGitExcluded('/wt')).not.toThrow();
		expect(vol.existsSync('/wt/.git/info/exclude')).toBe(false);
	});
});

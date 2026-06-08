import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	__resetDirenvCacheForTests,
	dirNeedsDirenv,
	getDirenvAllowWarning,
	getDirenvDirStatus,
	isDirenvAvailable,
	prefixCommandWithDirenv,
	wrapSpawnWithDirenv,
} from '../direnv.js';

// Whether `which direnv` "succeeds", and the canned `direnv status` output.
let direnvInstalled = true;
let statusOutput = '';

vi.mock('child_process', () => ({
	execSync: vi.fn((cmd: string) => {
		if (cmd.includes('which direnv') && !direnvInstalled) {
			throw new Error('not found');
		}
		return '';
	}),
	spawnSync: vi.fn(() => ({ stdout: statusOutput, stderr: '' })),
}));

const FOUND_ALLOWED = `Found RC path /repo/.envrc
Found RC allowed true`;

const FOUND_NOT_ALLOWED = `Found RC path /repo/.envrc
Found RC allowed false`;

const NONE = `No .envrc or .env found`;

describe('direnv utils', () => {
	beforeEach(() => {
		direnvInstalled = true;
		statusOutput = NONE;
		__resetDirenvCacheForTests();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('isDirenvAvailable', () => {
		it('returns true when direnv is on PATH', () => {
			expect(isDirenvAvailable()).toBe(true);
		});

		it('returns false when direnv is missing', () => {
			direnvInstalled = false;
			expect(isDirenvAvailable()).toBe(false);
		});
	});

	describe('getDirenvDirStatus', () => {
		it('reports no envrc when direnv is not installed', () => {
			direnvInstalled = false;
			expect(getDirenvDirStatus('/repo')).toEqual({ hasEnvrc: false, allowed: false });
		});

		it('reports no envrc when none is found', () => {
			statusOutput = NONE;
			expect(getDirenvDirStatus('/repo')).toEqual({ hasEnvrc: false, allowed: false });
		});

		it('detects a resolved (parent) .envrc and its path', () => {
			statusOutput = FOUND_ALLOWED;
			const status = getDirenvDirStatus('/repo/sub/deep');
			expect(status.hasEnvrc).toBe(true);
			expect(status.rcPath).toBe('/repo/.envrc');
			expect(status.allowed).toBe(true);
		});

		it('reports allowed=false when the .envrc is not yet allowed', () => {
			statusOutput = FOUND_NOT_ALLOWED;
			const status = getDirenvDirStatus('/repo');
			expect(status.hasEnvrc).toBe(true);
			expect(status.allowed).toBe(false);
		});
	});

	describe('dirNeedsDirenv', () => {
		it('is true when an envrc resolves', () => {
			statusOutput = FOUND_NOT_ALLOWED;
			expect(dirNeedsDirenv('/repo')).toBe(true);
		});

		it('is false when no envrc resolves', () => {
			statusOutput = NONE;
			expect(dirNeedsDirenv('/repo')).toBe(false);
		});
	});

	describe('wrapSpawnWithDirenv', () => {
		it('wraps command + args with `direnv exec <dir>` when needed', () => {
			statusOutput = FOUND_ALLOWED;
			const wrapped = wrapSpawnWithDirenv('/repo', 'claude', ['--bg', '--name', 'x']);
			expect(wrapped).toEqual({
				command: 'direnv',
				args: ['exec', '/repo', 'claude', '--bg', '--name', 'x'],
			});
		});

		it('preserves directories containing spaces in the argv form', () => {
			statusOutput = FOUND_ALLOWED;
			const wrapped = wrapSpawnWithDirenv('/my repo/wt', 'bash', ['-c', 'echo hi']);
			expect(wrapped.args).toEqual(['exec', '/my repo/wt', 'bash', '-c', 'echo hi']);
		});

		it('returns the original command + args when direnv is not needed', () => {
			statusOutput = NONE;
			const wrapped = wrapSpawnWithDirenv('/repo', 'claude', ['--bg']);
			expect(wrapped).toEqual({ command: 'claude', args: ['--bg'] });
		});
	});

	describe('getDirenvAllowWarning', () => {
		it('warns with the rc path when an .envrc is found but not allowed', () => {
			statusOutput = FOUND_NOT_ALLOWED;
			const warning = getDirenvAllowWarning('/repo');
			expect(warning).toContain('/repo/.envrc');
			expect(warning).toContain('direnv allow');
		});

		it('does not warn when the .envrc is allowed (incl. whitelisted)', () => {
			statusOutput = FOUND_ALLOWED;
			expect(getDirenvAllowWarning('/repo')).toBeUndefined();
		});

		it('does not warn when there is no .envrc', () => {
			statusOutput = NONE;
			expect(getDirenvAllowWarning('/repo')).toBeUndefined();
		});

		it('does not warn when direnv is not installed', () => {
			direnvInstalled = false;
			expect(getDirenvAllowWarning('/repo')).toBeUndefined();
		});
	});

	describe('prefixCommandWithDirenv', () => {
		it('prefixes the command with `direnv exec <dir>` when needed', () => {
			statusOutput = FOUND_ALLOWED;
			expect(prefixCommandWithDirenv('/repo', 'claude --resume abc')).toBe(
				'direnv exec /repo claude --resume abc'
			);
		});

		it('returns the original command when direnv is not needed', () => {
			statusOutput = NONE;
			expect(prefixCommandWithDirenv('/repo', 'claude')).toBe('claude');
		});
	});
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	detectDirenvAvailable,
	dirNeedsDirenv,
	getDirenvAllowWarning,
	getDirenvDirStatus,
	getDirenvWarning,
	getStaleDirenvWarning,
	hasStaleDirenvEnv,
	isDirenvAvailable,
	prefixCommandWithDirenv,
	shouldRunUnderDirenv,
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

// A directory whose OWN .envrc is found and also currently loaded (the normal
// "you are inside a direnv project" case) — Found and Loaded paths match.
const FOUND_AND_LOADED_SAME = `Loaded RC path /repo/.envrc
Loaded RC allowed true
Found RC path /repo/.envrc
Found RC allowed true`;

// A directory with NO .envrc of its own, but the process still carries a direnv
// environment loaded from a DIFFERENT directory (stale inherited env). This is
// the bug case: only Loaded lines, no Found lines.
const LOADED_STALE_NO_ENVRC = `Loaded RC path /other/project/.envrc
Loaded RC allowed true
No .envrc or .env found`;

// A directory that DOES have its own .envrc, but the loaded environment is from a
// different directory (the wrong env is currently active).
const FOUND_BUT_LOADED_OTHER = `Loaded RC path /other/project/.envrc
Loaded RC allowed true
Found RC path /repo/.envrc
Found RC allowed true`;

describe('direnv utils', () => {
	beforeEach(() => {
		direnvInstalled = true;
		statusOutput = NONE;
		detectDirenvAvailable();
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
			detectDirenvAvailable();
			expect(isDirenvAvailable()).toBe(false);
		});
	});

	describe('getDirenvDirStatus', () => {
		it('reports no envrc when direnv is not installed', () => {
			direnvInstalled = false;
			detectDirenvAvailable();
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

		it('does NOT treat an inherited (Loaded-only) env as the directory using direnv', () => {
			// The bug: a stale `Loaded RC path` from another directory must not be
			// read as this directory having an .envrc.
			statusOutput = LOADED_STALE_NO_ENVRC;
			const status = getDirenvDirStatus('/repo');
			expect(status.hasEnvrc).toBe(false);
			expect(status.rcPath).toBeUndefined();
			expect(status.loadedRcPath).toBe('/other/project/.envrc');
		});

		it('reports the directory rcPath from Found, not the inherited Loaded path', () => {
			statusOutput = FOUND_BUT_LOADED_OTHER;
			const status = getDirenvDirStatus('/repo');
			expect(status.hasEnvrc).toBe(true);
			expect(status.rcPath).toBe('/repo/.envrc');
			expect(status.loadedRcPath).toBe('/other/project/.envrc');
		});

		it('matches Found and Loaded paths for a normal loaded project', () => {
			statusOutput = FOUND_AND_LOADED_SAME;
			const status = getDirenvDirStatus('/repo');
			expect(status.hasEnvrc).toBe(true);
			expect(status.rcPath).toBe('/repo/.envrc');
			expect(status.loadedRcPath).toBe('/repo/.envrc');
		});
	});

	describe('hasStaleDirenvEnv', () => {
		it('is true when an env is loaded but the directory has no .envrc', () => {
			statusOutput = LOADED_STALE_NO_ENVRC;
			expect(hasStaleDirenvEnv('/repo')).toBe(true);
		});

		it('is true when the loaded env is from a different directory', () => {
			statusOutput = FOUND_BUT_LOADED_OTHER;
			expect(hasStaleDirenvEnv('/repo')).toBe(true);
		});

		it('is false when the loaded env matches the directory .envrc', () => {
			statusOutput = FOUND_AND_LOADED_SAME;
			expect(hasStaleDirenvEnv('/repo')).toBe(false);
		});

		it('is false when nothing is loaded', () => {
			statusOutput = NONE;
			expect(hasStaleDirenvEnv('/repo')).toBe(false);
		});
	});

	describe('shouldRunUnderDirenv', () => {
		it('is true when the directory uses direnv', () => {
			statusOutput = FOUND_ALLOWED;
			expect(shouldRunUnderDirenv('/repo')).toBe(true);
		});

		it('is true when a stale env must be scrubbed (no .envrc but env loaded)', () => {
			statusOutput = LOADED_STALE_NO_ENVRC;
			expect(shouldRunUnderDirenv('/repo')).toBe(true);
		});

		it('is false when no .envrc resolves and nothing is loaded', () => {
			statusOutput = NONE;
			expect(shouldRunUnderDirenv('/repo')).toBe(false);
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

		it('wraps to SCRUB a stale inherited env even when the dir has no .envrc', () => {
			statusOutput = LOADED_STALE_NO_ENVRC;
			const wrapped = wrapSpawnWithDirenv('/repo', 'claude', ['--bg']);
			expect(wrapped).toEqual({ command: 'direnv', args: ['exec', '/repo', 'claude', '--bg'] });
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
			detectDirenvAvailable();
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

		it('prefixes to scrub a stale inherited env even with no .envrc', () => {
			statusOutput = LOADED_STALE_NO_ENVRC;
			expect(prefixCommandWithDirenv('/repo', 'claude')).toBe('direnv exec /repo claude');
		});
	});

	describe('getStaleDirenvWarning', () => {
		it('warns when an env is loaded but the directory has no .envrc', () => {
			statusOutput = LOADED_STALE_NO_ENVRC;
			const warning = getStaleDirenvWarning('/repo');
			expect(warning).toContain('/other/project/.envrc');
			expect(warning).toContain('no .envrc');
		});

		it('warns when the loaded env is from a different directory', () => {
			statusOutput = FOUND_BUT_LOADED_OTHER;
			const warning = getStaleDirenvWarning('/repo');
			expect(warning).toContain('/other/project/.envrc');
			expect(warning).toContain('/repo/.envrc');
		});

		it('does not warn when the loaded env matches the directory', () => {
			statusOutput = FOUND_AND_LOADED_SAME;
			expect(getStaleDirenvWarning('/repo')).toBeUndefined();
		});

		it('does not warn when nothing is loaded', () => {
			statusOutput = NONE;
			expect(getStaleDirenvWarning('/repo')).toBeUndefined();
		});
	});

	describe('getDirenvWarning', () => {
		it('surfaces a stale-env warning', () => {
			statusOutput = LOADED_STALE_NO_ENVRC;
			expect(getDirenvWarning('/repo')).toContain('stale environment');
		});

		it('surfaces an unallowed-.envrc warning', () => {
			statusOutput = FOUND_NOT_ALLOWED;
			expect(getDirenvWarning('/repo')).toContain('direnv allow');
		});

		it('is undefined when there is nothing to warn about', () => {
			statusOutput = FOUND_ALLOWED;
			expect(getDirenvWarning('/repo')).toBeUndefined();
		});
	});
});

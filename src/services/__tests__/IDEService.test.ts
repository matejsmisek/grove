import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { detectAvailableIDEs, getEffectiveIDEConfig, isCommandAvailable } from '../IDEService.js';

// Shared mutable set of "installed" commands, hoisted so the vi.mock factory can
// close over it.
const { state } = vi.hoisted(() => ({ state: { installed: new Set<string>() } }));

vi.mock('../../utils/commandExists.js', () => ({
	commandExists: vi.fn((command: string) => Promise.resolve(state.installed.has(command))),
}));

describe('IDEService', () => {
	beforeEach(() => {
		state.installed = new Set();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('isCommandAvailable', () => {
		it('resolves true for an installed command', async () => {
			state.installed = new Set(['code']);
			await expect(isCommandAvailable('code')).resolves.toBe(true);
		});

		it('resolves false for a missing command', async () => {
			await expect(isCommandAvailable('nope')).resolves.toBe(false);
		});
	});

	describe('detectAvailableIDEs', () => {
		it('returns an empty list when nothing is installed', async () => {
			await expect(detectAvailableIDEs()).resolves.toEqual([]);
		});

		it('detects a single IDE without offering jetbrains-auto', async () => {
			state.installed = new Set(['code']);
			await expect(detectAvailableIDEs()).resolves.toEqual(['vscode']);
		});

		it('offers jetbrains-auto when a JetBrains IDE is present, after vscode', async () => {
			state.installed = new Set(['code', 'phpstorm']);
			await expect(detectAvailableIDEs()).resolves.toEqual(['vscode', 'jetbrains-auto', 'phpstorm']);
		});

		it('prepends jetbrains-auto when no vscode is present', async () => {
			state.installed = new Set(['idea']);
			await expect(detectAvailableIDEs()).resolves.toEqual(['jetbrains-auto', 'idea']);
		});

		it('detects an IDE via its alternative command', async () => {
			// vscode's primary is `code`; `code-insiders` is an alternative.
			state.installed = new Set(['code-insiders']);
			await expect(detectAvailableIDEs()).resolves.toEqual(['vscode']);
		});
	});

	describe('getEffectiveIDEConfig', () => {
		it('returns the default config when the command is available', async () => {
			state.installed = new Set(['vim']);
			await expect(getEffectiveIDEConfig('vim')).resolves.toEqual({
				command: 'vim',
				args: ['{path}'],
			});
		});

		it('falls back to an alternative command when the primary is missing', async () => {
			state.installed = new Set(['nvim']);
			await expect(getEffectiveIDEConfig('vim')).resolves.toEqual({
				command: 'nvim',
				args: ['{path}'],
			});
		});

		it('returns the default command even when nothing is found', async () => {
			await expect(getEffectiveIDEConfig('pycharm')).resolves.toEqual({
				command: 'pycharm',
				args: ['{path}'],
			});
		});

		it('prefers a provided custom config', async () => {
			const custom = { command: 'mycode', args: ['--wait', '{path}'] };
			await expect(getEffectiveIDEConfig('vscode', { vscode: custom })).resolves.toEqual(custom);
		});

		it('returns undefined for an invalid IDE type', async () => {
			const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
			await expect(getEffectiveIDEConfig('not-an-ide')).resolves.toBeUndefined();
			warn.mockRestore();
		});
	});
});

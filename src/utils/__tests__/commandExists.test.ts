import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearCommandExistsCache, commandExists } from '../commandExists.js';

// Controlled platform value and the set of "installed" commands per test.
let mockPlatform: NodeJS.Platform = 'linux';
let installedCommands: Set<string> = new Set();
// Records the (cmd, args) the helper spawned, so we can assert which probe ran.
const spawnCalls: { cmd: string; args: string[] }[] = [];

vi.mock('os', () => ({
	default: {
		platform: () => mockPlatform,
	},
	platform: () => mockPlatform,
}));

// Mock spawn so `which <cmd>` / `where <cmd>` exits 0 only for installed commands.
vi.mock('child_process', () => ({
	spawn: vi.fn((cmd: string, args: string[]) => {
		spawnCalls.push({ cmd, args });
		const emitter = new EventEmitter() as EventEmitter & { unref: () => void };
		emitter.unref = () => {};
		const target = args[0];
		// Defer the close event so listeners attach first.
		queueMicrotask(() => {
			emitter.emit('close', installedCommands.has(target) ? 0 : 1);
		});
		return emitter;
	}),
}));

describe('commandExists', () => {
	beforeEach(() => {
		mockPlatform = 'linux';
		installedCommands = new Set();
		spawnCalls.length = 0;
		clearCommandExistsCache();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('resolves true for an installed command', async () => {
		installedCommands = new Set(['konsole']);
		await expect(commandExists('konsole')).resolves.toBe(true);
	});

	it('resolves false for a missing command', async () => {
		await expect(commandExists('does-not-exist')).resolves.toBe(false);
	});

	it('uses `which` on non-Windows platforms', async () => {
		installedCommands = new Set(['kitty']);
		await commandExists('kitty');
		expect(spawnCalls[0]).toEqual({ cmd: 'which', args: ['kitty'] });
	});

	it('uses `where` on Windows', async () => {
		mockPlatform = 'win32';
		installedCommands = new Set(['code']);
		await commandExists('code');
		expect(spawnCalls[0]).toEqual({ cmd: 'where', args: ['code'] });
	});

	it('caches the result and probes a command only once', async () => {
		installedCommands = new Set(['vim']);
		const first = await commandExists('vim');
		const second = await commandExists('vim');
		expect(first).toBe(true);
		expect(second).toBe(true);
		// Only one spawn despite two calls — the result is memoized.
		expect(spawnCalls).toHaveLength(1);
	});

	it('shares one in-flight probe across concurrent callers', async () => {
		installedCommands = new Set(['idea']);
		const [a, b] = await Promise.all([commandExists('idea'), commandExists('idea')]);
		expect(a).toBe(true);
		expect(b).toBe(true);
		expect(spawnCalls).toHaveLength(1);
	});

	it('clearCommandExistsCache forces a re-probe', async () => {
		await commandExists('git');
		clearCommandExistsCache();
		await commandExists('git');
		expect(spawnCalls).toHaveLength(2);
	});
});

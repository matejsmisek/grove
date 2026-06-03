import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { detectAvailableTerminals } from '../TerminalService.js';

// Controlled platform value and set of "installed" commands per test.
let mockPlatform: NodeJS.Platform = 'linux';
let installedCommands: Set<string> = new Set();

vi.mock('os', () => ({
	default: {
		platform: () => mockPlatform,
	},
	platform: () => mockPlatform,
}));

// Mock spawn so `which <cmd>` "succeeds" (exit 0) only for installed commands.
vi.mock('child_process', () => ({
	spawn: vi.fn((_cmd: string, args: string[]) => {
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

describe('TerminalService.detectAvailableTerminals', () => {
	beforeEach(() => {
		mockPlatform = 'linux';
		installedCommands = new Set();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('returns only installed terminals on linux, in preference order', async () => {
		installedCommands = new Set(['konsole', 'alacritty']);

		const result = await detectAvailableTerminals();

		expect(result.map((t) => t.command)).toEqual(['konsole', 'alacritty']);
		// First entry (preference order) is the detected default.
		expect(result[0].command).toBe('konsole');
		expect(result[0].args).toContain('{path}');
	});

	it('returns an empty list on linux when no terminal is installed', async () => {
		installedCommands = new Set();

		const result = await detectAvailableTerminals();

		expect(result).toEqual([]);
	});

	it('returns Terminal.app on macOS without probing', async () => {
		mockPlatform = 'darwin';

		const result = await detectAvailableTerminals();

		expect(result).toHaveLength(1);
		expect(result[0].command).toBe('open');
	});

	it('returns cmd on Windows', async () => {
		mockPlatform = 'win32';

		const result = await detectAvailableTerminals();

		expect(result).toHaveLength(1);
		expect(result[0].command).toBe('cmd');
	});
});

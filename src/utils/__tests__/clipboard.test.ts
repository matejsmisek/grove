import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { copyToClipboard } from '../clipboard.js';

// Records the argv of each spawnSync call, and a per-command canned result.
const calls: Array<{ command: string; args: string[]; input?: string }> = [];
let results: Record<string, { status: number; error?: Error }> = {};

vi.mock('child_process', () => ({
	spawnSync: vi.fn((command: string, args: string[], options: { input?: string }) => {
		calls.push({ command, args, input: options?.input });
		const result = results[command];
		if (!result) {
			// Simulate "command not found".
			return { status: null, error: new Error('spawn ENOENT') };
		}
		return { status: result.status, error: result.error };
	}),
}));

const originalPlatform = process.platform;

function setPlatform(platform: NodeJS.Platform): void {
	Object.defineProperty(process, 'platform', { value: platform, configurable: true });
}

describe('copyToClipboard', () => {
	beforeEach(() => {
		calls.length = 0;
		results = {};
	});

	afterEach(() => {
		vi.clearAllMocks();
		Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
	});

	it('uses pbcopy on macOS and passes the text via stdin', () => {
		setPlatform('darwin');
		results = { pbcopy: { status: 0 } };

		expect(copyToClipboard('hello')).toBe(true);
		expect(calls).toEqual([{ command: 'pbcopy', args: [], input: 'hello' }]);
	});

	it('uses clip on Windows', () => {
		setPlatform('win32');
		results = { clip: { status: 0 } };

		expect(copyToClipboard('hello')).toBe(true);
		expect(calls[0].command).toBe('clip');
	});

	it('falls through Linux tools until one succeeds', () => {
		setPlatform('linux');
		// wl-copy missing, xclip succeeds.
		results = { xclip: { status: 0 } };

		expect(copyToClipboard('cmd')).toBe(true);
		expect(calls.map((c) => c.command)).toEqual(['wl-copy', 'xclip']);
	});

	it('returns false when no clipboard tool is available', () => {
		setPlatform('linux');
		results = {};

		expect(copyToClipboard('cmd')).toBe(false);
		expect(calls.map((c) => c.command)).toEqual(['wl-copy', 'xclip', 'xsel']);
	});

	it('returns false when a tool exits non-zero', () => {
		setPlatform('darwin');
		results = { pbcopy: { status: 1 } };

		expect(copyToClipboard('cmd')).toBe(false);
	});
});

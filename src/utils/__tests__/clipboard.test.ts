import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { copyToClipboard } from '../clipboard.js';

// Records the argv of each spawn call. `available` decides, per command, whether
// the fake child emits 'spawn' (present) or 'error' (missing, e.g. ENOENT).
const calls: Array<{ command: string; args: string[] }> = [];
let available: Record<string, boolean> = {};
let lastInput: string | undefined;

vi.mock('child_process', () => ({
	spawn: vi.fn((command: string, args: string[]) => {
		calls.push({ command, args });
		const child = new EventEmitter() as EventEmitter & {
			stdin: { end: (t: string) => void; on: () => void };
			unref: () => void;
		};
		child.stdin = {
			end: (t: string) => {
				lastInput = t;
			},
			on: () => {},
		};
		child.unref = () => {};
		// Emit asynchronously, like a real spawn.
		queueMicrotask(() => {
			if (available[command]) {
				child.emit('spawn');
			} else {
				child.emit('error', new Error(`spawn ${command} ENOENT`));
			}
		});
		return child;
	}),
}));

const originalPlatform = process.platform;

function setPlatform(platform: NodeJS.Platform): void {
	Object.defineProperty(process, 'platform', { value: platform, configurable: true });
}

describe('copyToClipboard', () => {
	beforeEach(() => {
		calls.length = 0;
		available = {};
		lastInput = undefined;
	});

	afterEach(() => {
		vi.clearAllMocks();
		Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
	});

	it('uses pbcopy on macOS and passes the text via stdin', async () => {
		setPlatform('darwin');
		available = { pbcopy: true };

		await expect(copyToClipboard('hello')).resolves.toBe(true);
		expect(calls).toEqual([{ command: 'pbcopy', args: [] }]);
		expect(lastInput).toBe('hello');
	});

	it('uses clip on Windows', async () => {
		setPlatform('win32');
		available = { clip: true };

		await expect(copyToClipboard('hello')).resolves.toBe(true);
		expect(calls[0].command).toBe('clip');
	});

	it('falls through Linux tools until one launches', async () => {
		setPlatform('linux');
		// wl-copy missing, xclip present.
		available = { xclip: true };

		await expect(copyToClipboard('cmd')).resolves.toBe(true);
		expect(calls.map((c) => c.command)).toEqual(['wl-copy', 'xclip']);
	});

	it('falls back to clip.exe under WSL (no X/Wayland tools present)', async () => {
		setPlatform('linux');
		available = { 'clip.exe': true };

		await expect(copyToClipboard('cmd')).resolves.toBe(true);
		expect(calls.map((c) => c.command)).toEqual(['wl-copy', 'xclip', 'xsel', 'clip.exe']);
	});

	it('returns false when no clipboard tool is available', async () => {
		setPlatform('linux');
		available = {};

		await expect(copyToClipboard('cmd')).resolves.toBe(false);
		expect(calls.map((c) => c.command)).toEqual(['wl-copy', 'xclip', 'xsel', 'clip.exe']);
	});
});

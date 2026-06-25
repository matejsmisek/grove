import { describe, expect, it } from 'vitest';

import { ALL_TERMINAL_ADAPTERS } from '../adapters.js';
import {
	adaptersForPlatform,
	commandToTerminalId,
	getAdapter,
	getTerminalDisplayName,
} from '../registry.js';

describe('terminal registry', () => {
	it('exposes a unique id per adapter', () => {
		const ids = ALL_TERMINAL_ADAPTERS.map((a) => a.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('resolves adapters and display names by id', () => {
		expect(getAdapter('konsole')?.displayName).toBe('KDE Konsole');
		expect(getTerminalDisplayName('kitty')).toBe('Kitty');
		expect(getTerminalDisplayName('custom')).toBe('Custom command');
	});

	it('filters adapters by platform', () => {
		const linux = adaptersForPlatform('linux').map((a) => a.id);
		expect(linux).toContain('konsole');
		expect(linux).toContain('gnome-terminal');
		expect(linux).not.toContain('iterm2');
		expect(linux).not.toContain('terminal-app');

		const darwin = adaptersForPlatform('darwin').map((a) => a.id);
		expect(darwin).toContain('terminal-app');
		expect(darwin).toContain('iterm2');
		expect(darwin).not.toContain('gnome-terminal');

		const win = adaptersForPlatform('win32').map((a) => a.id);
		expect(win).toContain('cmd');
		expect(win).toContain('windows-terminal');
	});

	it('maps legacy commands to terminal ids (for migration)', () => {
		expect(commandToTerminalId('konsole')).toBe('konsole');
		expect(commandToTerminalId('gnome-terminal')).toBe('gnome-terminal');
		// macOS Terminal.app was launched via `open -a Terminal`.
		expect(commandToTerminalId('open')).toBe('terminal-app');
		// Unknown command falls through so the caller can use `custom`.
		expect(commandToTerminalId('my-weird-term')).toBeUndefined();
	});

	describe('konsole adapter (file-based, multi-tab)', () => {
		const adapter = getAdapter('konsole')!;

		it('opens a plain terminal with the working directory', () => {
			const spec = adapter.openTerminal('/work/dir');
			expect(spec.command).toBe('konsole');
			expect(spec.args).toEqual(['--workdir', '/work/dir']);
		});

		it('writes a tabs session file from the rendered template', () => {
			const spec = adapter.launchClaude({
				workingDir: '/work/dir',
				tabs: [
					{ title: 'claude', command: 'claude' },
					{ title: 'cmd', command: 'bash' },
				],
				renderedTemplate: 'title: Claude ;; command: claude',
				tmpDir: '/tmp/grove',
				sessionToken: 'abc123',
			});
			expect(spec.command).toBe('konsole');
			expect(spec.args).toContain('--tabs-from-file');
			expect(spec.sessionFile?.path).toContain('konsole-tabs-abc123.txt');
			expect(spec.sessionFile?.content).toContain('title: Claude');
		});
	});

	describe('gnome-terminal adapter (multi-tab, no template)', () => {
		const adapter = getAdapter('gnome-terminal')!;

		it('opens one --tab per resolved tab', () => {
			const spec = adapter.launchClaude({
				workingDir: '/w',
				tabs: [
					{ title: 'claude', command: 'claude' },
					{ title: 'cmd', command: 'bash' },
				],
				tmpDir: '/tmp',
				sessionToken: 't',
			});
			expect(spec.command).toBe('gnome-terminal');
			expect(spec.args.filter((a) => a === '--tab')).toHaveLength(2);
			expect(spec.args.some((a) => a.includes('claude'))).toBe(true);
			expect(spec.sessionFile).toBeUndefined();
		});
	});

	describe('custom adapter', () => {
		const adapter = getAdapter('custom')!;

		it('uses the configured command and substitutes {path}', () => {
			const spec = adapter.openTerminal('/dir', {
				customCommand: 'myterm',
				customArgs: ['--cwd', '{path}'],
			});
			expect(spec.command).toBe('myterm');
			expect(spec.args).toEqual(['--cwd', '/dir']);
		});
	});
});

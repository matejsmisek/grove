import fs from 'fs';
import path from 'path';

import type { TerminalId, TerminalSettings } from '../storage/types.js';
import type { ClaudeLaunchContext, TerminalAdapter } from './types.js';

/**
 * Substitute the {path} placeholder used by the plain "open terminal" arg
 * templates (ported from the historical TerminalService tables).
 */
function subPath(args: string[], dirPath: string): string[] {
	return args.map((arg) => arg.replace('{path}', dirPath));
}

/** Double-quote a path for embedding inside a `bash -c` payload. */
function dq(value: string): string {
	return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`')}"`;
}

/**
 * Build a `bash -c` payload that cds into the working dir and runs a command,
 * keeping the shell open afterwards (so the tab/window survives the command).
 */
function bashPayload(workingDir: string, command: string): string {
	if (command.trim() === 'bash') {
		return `cd ${dq(workingDir)} && exec bash`;
	}
	return `cd ${dq(workingDir)} && ${command}; exec bash`;
}

/** The Claude command for a single-window launch (first tab). */
function claudeCommand(ctx: ClaudeLaunchContext): string {
	return ctx.tabs[0]?.command ?? 'claude';
}

// ── Multi-tab, file-based adapters (konsole, kitty) ────────────────────────────

const KONSOLE_TEMPLATE = `title: Claude ;; workdir: \${WORKING_DIR} ;; command: \${AGENT_COMMAND}
title: cmd ;; workdir: \${WORKING_DIR} ;; command: bash
`;

const KITTY_TEMPLATE = `layout tall
cd \${WORKING_DIR}
layout tall:bias=65;full_size=1
launch --title "claude" \${AGENT_COMMAND}
launch --title "cmd" bash
`;

const konsoleAdapter: TerminalAdapter = {
	id: 'konsole',
	displayName: 'KDE Konsole',
	platforms: ['linux'],
	detectCommand: 'konsole',
	multiTab: true,
	editableTemplate: true,
	defaultTemplate: KONSOLE_TEMPLATE,
	openTerminal: (p) => ({ command: 'konsole', args: ['--workdir', p] }),
	launchClaude: (ctx) => {
		const file = path.join(ctx.tmpDir, `konsole-tabs-${ctx.sessionToken}.txt`);
		return {
			command: 'konsole',
			args: ['--tabs-from-file', file, '-e', 'bash', '-c', 'exit'],
			sessionFile: { path: file, content: ctx.renderedTemplate ?? '' },
		};
	},
};

const kittyAdapter: TerminalAdapter = {
	id: 'kitty',
	displayName: 'Kitty',
	platforms: ['linux', 'darwin'],
	detectCommand: 'kitty',
	multiTab: true,
	editableTemplate: true,
	defaultTemplate: KITTY_TEMPLATE,
	openTerminal: (p) => ({ command: 'kitty', args: ['--directory', p] }),
	launchClaude: (ctx) => {
		const file = path.join(ctx.tmpDir, `kitty-session-${ctx.sessionToken}.conf`);
		return {
			command: 'kitty',
			args: ['--session', file],
			sessionFile: { path: file, content: ctx.renderedTemplate ?? '' },
		};
	},
};

// ── Multi-tab, single-invocation adapter (gnome-terminal) ──────────────────────

const gnomeTerminalAdapter: TerminalAdapter = {
	id: 'gnome-terminal',
	displayName: 'GNOME Terminal',
	platforms: ['linux'],
	detectCommand: 'gnome-terminal',
	multiTab: true,
	editableTemplate: false,
	openTerminal: (p) => ({ command: 'gnome-terminal', args: ['--working-directory', p] }),
	launchClaude: (ctx) => {
		const args: string[] = [];
		for (const tab of ctx.tabs) {
			args.push(
				'--tab',
				'--title',
				tab.title,
				'--',
				'bash',
				'-c',
				bashPayload(ctx.workingDir, tab.command)
			);
		}
		return { command: 'gnome-terminal', args };
	},
};

// ── Multi-tab macOS adapter via AppleScript (iTerm2) ───────────────────────────

/** Escape a string for use inside an AppleScript double-quoted literal. */
function osa(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

const iterm2Adapter: TerminalAdapter = {
	id: 'iterm2',
	displayName: 'iTerm2',
	platforms: ['darwin'],
	// App-based: detected via the app bundle rather than a PATH command.
	isAvailable: async () => fs.existsSync('/Applications/iTerm.app'),
	multiTab: true,
	editableTemplate: false,
	openTerminal: (p) => ({
		command: 'osascript',
		args: [
			'-e',
			'tell application "iTerm2"',
			'-e',
			'create window with default profile',
			'-e',
			`tell current session of current window to write text "cd ${osa(dq(p))}"`,
			'-e',
			'end tell',
		],
	}),
	launchClaude: (ctx) => {
		const lines = ['tell application "iTerm2"', 'create window with default profile'];
		ctx.tabs.forEach((tab, index) => {
			if (index > 0) {
				lines.push('tell current window to create tab with default profile');
			}
			const payload = `cd ${dq(ctx.workingDir)} && ${tab.command}`;
			lines.push(`tell current session of current window to write text "${osa(payload)}"`);
		});
		lines.push('end tell');
		const args: string[] = [];
		for (const line of lines) {
			args.push('-e', line);
		}
		return { command: 'osascript', args };
	},
};

// ── Single-window adapters (best-effort Claude launch in one window) ───────────

interface SimpleAdapterOpts {
	id: TerminalId;
	displayName: string;
	platforms: NodeJS.Platform[];
	detectCommand?: string;
	/** Args for opening a plain terminal in {path}. */
	openArgs: string[];
	/** Build args that run a `bash -c` payload. Defaults to `-e bash -c <payload>`. */
	execArgs?: (payload: string, ctx: ClaudeLaunchContext) => string[];
	/** Extra args (e.g. cwd flag) prepended to the exec args at launch. */
	cwdArgs?: (workingDir: string) => string[];
}

function simpleAdapter(opts: SimpleAdapterOpts): TerminalAdapter {
	const command = opts.detectCommand ?? opts.id;
	const execArgs = opts.execArgs ?? ((payload) => ['-e', 'bash', '-c', payload]);
	return {
		id: opts.id,
		displayName: opts.displayName,
		platforms: opts.platforms,
		detectCommand: opts.detectCommand ?? opts.id,
		multiTab: false,
		editableTemplate: false,
		openTerminal: (p) => ({ command, args: subPath(opts.openArgs, p) }),
		launchClaude: (ctx) => {
			const payload = bashPayload(ctx.workingDir, claudeCommand(ctx));
			const cwd = opts.cwdArgs ? opts.cwdArgs(ctx.workingDir) : [];
			return { command, args: [...cwd, ...execArgs(payload, ctx)] };
		},
	};
}

const simpleAdapters: TerminalAdapter[] = [
	simpleAdapter({
		id: 'alacritty',
		displayName: 'Alacritty',
		platforms: ['linux', 'darwin'],
		openArgs: ['--working-directory', '{path}'],
		cwdArgs: (d) => ['--working-directory', d],
	}),
	simpleAdapter({
		id: 'ghostty',
		displayName: 'Ghostty',
		platforms: ['linux', 'darwin'],
		openArgs: ['--working-directory={path}'],
		execArgs: (payload) => ['-e', 'bash', '-c', payload],
		cwdArgs: (d) => [`--working-directory=${d}`],
	}),
	simpleAdapter({
		id: 'wezterm',
		displayName: 'WezTerm',
		platforms: ['linux', 'darwin'],
		// `wezterm start --cwd <dir> -- <cmd>` opens a window running the command.
		openArgs: ['start', '--cwd', '{path}'],
		execArgs: (payload) => ['start', '--', 'bash', '-c', payload],
		cwdArgs: (d) => ['--cwd', d],
	}),
	simpleAdapter({
		id: 'xfce4-terminal',
		displayName: 'XFCE Terminal',
		platforms: ['linux'],
		openArgs: ['--working-directory', '{path}'],
		// xfce4-terminal runs the rest of the command line after -x.
		execArgs: (payload) => ['-x', 'bash', '-c', payload],
		cwdArgs: (d) => [`--working-directory=${d}`],
	}),
	simpleAdapter({
		id: 'tilix',
		displayName: 'Tilix',
		platforms: ['linux'],
		openArgs: ['--working-directory', '{path}'],
		// tilix -e takes a single command string.
		execArgs: (payload) => ['-e', `bash -c '${payload.replace(/'/g, `'\\''`)}'`],
		cwdArgs: (d) => ['--working-directory', d],
	}),
	simpleAdapter({
		id: 'terminator',
		displayName: 'Terminator',
		platforms: ['linux'],
		openArgs: ['--working-directory', '{path}'],
		execArgs: (payload) => ['-x', 'bash', '-c', payload],
		cwdArgs: (d) => ['--working-directory', d],
	}),
	simpleAdapter({
		id: 'mate-terminal',
		displayName: 'MATE Terminal',
		platforms: ['linux'],
		openArgs: ['--working-directory', '{path}'],
		execArgs: (payload) => ['-e', `bash -c '${payload.replace(/'/g, `'\\''`)}'`],
		cwdArgs: (d) => ['--working-directory', d],
	}),
	simpleAdapter({
		id: 'lxterminal',
		displayName: 'LXTerminal',
		platforms: ['linux'],
		openArgs: ['--working-directory={path}'],
		execArgs: (payload) => ['-e', `bash -c '${payload.replace(/'/g, `'\\''`)}'`],
		cwdArgs: (d) => [`--working-directory=${d}`],
	}),
	simpleAdapter({
		id: 'urxvt',
		displayName: 'rxvt-unicode',
		platforms: ['linux'],
		openArgs: ['-cd', '{path}'],
		execArgs: (payload) => ['-e', 'bash', '-c', payload],
		cwdArgs: (d) => ['-cd', d],
	}),
	simpleAdapter({
		id: 'xterm',
		displayName: 'XTerm',
		platforms: ['linux'],
		openArgs: ['-e', 'bash', '-c', 'cd "{path}" && exec bash'],
		execArgs: (payload) => ['-e', 'bash', '-c', payload],
	}),
	// macOS Terminal.app — single window via AppleScript (`do script` opens a window).
	{
		id: 'terminal-app',
		displayName: 'Terminal.app',
		platforms: ['darwin'],
		detectCommand: undefined,
		multiTab: false,
		editableTemplate: false,
		openTerminal: (p) => ({
			command: 'osascript',
			args: [
				'-e',
				'tell application "Terminal"',
				'-e',
				'activate',
				'-e',
				`do script "cd ${osa(dq(p))}"`,
				'-e',
				'end tell',
			],
		}),
		launchClaude: (ctx) => {
			const payload = `cd ${dq(ctx.workingDir)} && ${claudeCommand(ctx)}`;
			return {
				command: 'osascript',
				args: [
					'-e',
					'tell application "Terminal"',
					'-e',
					'activate',
					'-e',
					`do script "${osa(payload)}"`,
					'-e',
					'end tell',
				],
			};
		},
	},
	// Windows Terminal (wt.exe)
	{
		id: 'windows-terminal',
		displayName: 'Windows Terminal',
		platforms: ['win32'],
		detectCommand: 'wt',
		multiTab: false,
		editableTemplate: false,
		openTerminal: (p) => ({ command: 'wt', args: ['-d', p], shell: true }),
		launchClaude: (ctx) => ({
			command: 'wt',
			args: ['-d', ctx.workingDir, 'cmd', '/k', claudeCommand(ctx)],
			shell: true,
		}),
	},
	// Windows cmd fallback
	{
		id: 'cmd',
		displayName: 'Command Prompt',
		platforms: ['win32'],
		detectCommand: undefined,
		multiTab: false,
		editableTemplate: false,
		openTerminal: (p) => ({
			command: 'cmd',
			args: ['/c', 'start', 'cmd', '/k', `cd /d "${p}"`],
			shell: true,
		}),
		launchClaude: (ctx) => ({
			command: 'cmd',
			args: ['/c', 'start', 'cmd', '/k', `cd /d "${ctx.workingDir}" && ${claudeCommand(ctx)}`],
			shell: true,
		}),
	},
];

// ── Custom (user-supplied command/args) ────────────────────────────────────────

const customAdapter: TerminalAdapter = {
	id: 'custom',
	displayName: 'Custom command',
	platforms: ['linux', 'darwin', 'win32'],
	// Availability is governed entirely by whether the user configured a command.
	isAvailable: async () => false,
	multiTab: false,
	editableTemplate: false,
	openTerminal: (p, custom?: TerminalSettings) => {
		const command = custom?.customCommand ?? '';
		const args = (custom?.customArgs ?? ['{path}']).map((a) => a.replace('{path}', p));
		return { command, args };
	},
	launchClaude: (ctx) => {
		const command = ctx.custom?.customCommand ?? '';
		const args = (ctx.custom?.customArgs ?? ['{path}']).map((a) =>
			a.replace('{path}', ctx.workingDir)
		);
		return { command, args };
	},
};

/**
 * All terminal adapters, in display/preference order. The first installed entry
 * on a platform is used as the auto-detected default.
 */
export const ALL_TERMINAL_ADAPTERS: TerminalAdapter[] = [
	konsoleAdapter,
	kittyAdapter,
	gnomeTerminalAdapter,
	iterm2Adapter,
	...simpleAdapters,
	customAdapter,
];

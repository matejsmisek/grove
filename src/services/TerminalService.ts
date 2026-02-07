import { execSync, spawn } from 'child_process';
import os from 'os';

import type { TerminalConfig } from '../storage/types.js';

export interface TerminalResult {
	success: boolean;
	message: string;
}

/**
 * Terminal definitions for each platform
 * Each entry contains the command and args template
 * {path} will be replaced with the actual directory path
 */
interface TerminalDefinition {
	command: string;
	args: string[];
}

const LINUX_TERMINALS: TerminalDefinition[] = [
	// GNOME Terminal
	{ command: 'gnome-terminal', args: ['--working-directory', '{path}'] },
	// KDE Konsole
	{ command: 'konsole', args: ['--workdir', '{path}'] },
	// XFCE Terminal
	{ command: 'xfce4-terminal', args: ['--working-directory', '{path}'] },
	// LXTerminal
	{ command: 'lxterminal', args: ['--working-directory={path}'] },
	// MATE Terminal
	{ command: 'mate-terminal', args: ['--working-directory', '{path}'] },
	// Tilix
	{ command: 'tilix', args: ['--working-directory', '{path}'] },
	// Terminator
	{ command: 'terminator', args: ['--working-directory', '{path}'] },
	// Alacritty
	{ command: 'alacritty', args: ['--working-directory', '{path}'] },
	// Kitty
	{ command: 'kitty', args: ['--directory', '{path}'] },
	// URxvt (no working directory flag, uses cd)
	{ command: 'urxvt', args: ['-cd', '{path}'] },
	// XTerm (fallback)
	{ command: 'xterm', args: ['-e', 'cd "{path}" && $SHELL'] },
];

const MACOS_TERMINAL: TerminalDefinition = {
	command: 'open',
	args: ['-a', 'Terminal', '{path}'],
};

const WINDOWS_TERMINAL: TerminalDefinition = {
	command: 'cmd',
	args: ['/c', 'start', 'cmd', '/k', 'cd /d "{path}"'],
};

/**
 * Check if a command exists in the system PATH
 */
function commandExists(command: string): boolean {
	try {
		const checkCmd = os.platform() === 'win32' ? `where ${command}` : `which ${command}`;
		execSync(checkCmd, { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

/**
 * Detect the available terminal on the system
 * If preferredCommand is provided, that terminal will be tried first before
 * falling back to the default detection order.
 */
export function detectTerminal(preferredCommand?: string): TerminalConfig | null {
	const platform = os.platform();

	switch (platform) {
		case 'darwin': {
			// macOS always has Terminal.app
			return {
				command: MACOS_TERMINAL.command,
				args: MACOS_TERMINAL.args,
			};
		}
		case 'linux': {
			// Build ordered list, prioritizing the preferred terminal
			let terminals = LINUX_TERMINALS;
			if (preferredCommand) {
				const preferred = LINUX_TERMINALS.find((t) => t.command === preferredCommand);
				if (preferred) {
					terminals = [preferred, ...LINUX_TERMINALS.filter((t) => t.command !== preferredCommand)];
				}
			}

			// Try each terminal in order of preference
			for (const terminal of terminals) {
				if (commandExists(terminal.command)) {
					return {
						command: terminal.command,
						args: terminal.args,
					};
				}
			}
			return null;
		}
		case 'win32': {
			// Windows always has cmd
			return {
				command: WINDOWS_TERMINAL.command,
				args: WINDOWS_TERMINAL.args,
			};
		}
		default:
			return null;
	}
}

/**
 * Open a terminal window in the specified directory using saved config
 */
export function openTerminalInPath(
	path: string,
	config: TerminalConfig | undefined
): TerminalResult {
	if (!config) {
		return {
			success: false,
			message: 'No terminal configured. Please restart Grove to detect available terminals.',
		};
	}

	try {
		// Replace {path} placeholder in args
		const args = config.args.map((arg) => arg.replace('{path}', path));

		const proc = spawn(config.command, args, {
			detached: true,
			stdio: 'ignore',
			shell: os.platform() === 'win32',
		});

		proc.on('error', (err) => {
			console.error(`[TerminalService] spawn error: ${err.message}`);
		});

		proc.unref();

		return {
			success: true,
			message: `Opened terminal in ${path}`,
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to open terminal: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

import { spawn } from 'child_process';
import os from 'os';

export interface TerminalResult {
	success: boolean;
	message: string;
}

/**
 * Open a terminal window in the specified directory
 * Uses platform-specific commands to launch the default terminal
 */
export function openTerminalInPath(path: string): TerminalResult {
	const platform = os.platform();

	try {
		switch (platform) {
			case 'darwin': {
				// macOS: Use 'open' command with Terminal app
				spawn('open', ['-a', 'Terminal', path], {
					detached: true,
					stdio: 'ignore',
				}).unref();
				break;
			}
			case 'linux': {
				// Linux: Try common terminal emulators
				const terminals = [
					['x-terminal-emulator', '--working-directory', path],
					['gnome-terminal', '--working-directory', path],
					['konsole', '--workdir', path],
					['xfce4-terminal', '--working-directory', path],
					['xterm', '-e', `cd "${path}" && $SHELL`],
				];

				let launched = false;
				for (const [cmd, ...args] of terminals) {
					try {
						const proc = spawn(cmd, args, {
							detached: true,
							stdio: 'ignore',
						});
						proc.unref();
						launched = true;
						break;
					} catch {
						// Try next terminal
						continue;
					}
				}

				if (!launched) {
					return {
						success: false,
						message: 'No supported terminal emulator found',
					};
				}
				break;
			}
			case 'win32': {
				// Windows: Use cmd to open new terminal
				spawn('cmd', ['/c', 'start', 'cmd', '/k', `cd /d "${path}"`], {
					detached: true,
					stdio: 'ignore',
					shell: true,
				}).unref();
				break;
			}
			default:
				return {
					success: false,
					message: `Unsupported platform: ${platform}`,
				};
		}

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

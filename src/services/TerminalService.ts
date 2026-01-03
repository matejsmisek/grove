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

	console.error(`[TerminalService] Opening terminal in path: ${path}`);
	console.error(`[TerminalService] Platform: ${platform}`);

	try {
		switch (platform) {
			case 'darwin': {
				// macOS: Use 'open' command with Terminal app
				console.error('[TerminalService] macOS: spawning open -a Terminal');
				const proc = spawn('open', ['-a', 'Terminal', path], {
					detached: true,
					stdio: 'ignore',
				});
				proc.on('error', (err) => {
					console.error(`[TerminalService] spawn error: ${err.message}`);
				});
				proc.unref();
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
				let lastError = '';
				for (const [cmd, ...args] of terminals) {
					console.error(`[TerminalService] Linux: trying ${cmd} ${args.join(' ')}`);
					try {
						const proc = spawn(cmd, args, {
							detached: true,
							stdio: 'pipe',
						});

						// Check if spawn succeeded by listening for error
						let spawnError = false;
						proc.on('error', (err) => {
							console.error(`[TerminalService] ${cmd} error: ${err.message}`);
							spawnError = true;
							lastError = err.message;
						});

						// Give it a moment to fail if it's going to
						// If no immediate error, assume success
						if (!spawnError) {
							proc.unref();
							launched = true;
							console.error(`[TerminalService] Successfully launched ${cmd}`);
							break;
						}
					} catch (err) {
						console.error(
							`[TerminalService] ${cmd} catch error: ${err instanceof Error ? err.message : String(err)}`
						);
						lastError = err instanceof Error ? err.message : String(err);
						continue;
					}
				}

				if (!launched) {
					console.error(`[TerminalService] No terminal launched. Last error: ${lastError}`);
					return {
						success: false,
						message: `No supported terminal emulator found. Last error: ${lastError}`,
					};
				}
				break;
			}
			case 'win32': {
				// Windows: Use cmd to open new terminal
				console.error('[TerminalService] Windows: spawning cmd');
				spawn('cmd', ['/c', 'start', 'cmd', '/k', `cd /d "${path}"`], {
					detached: true,
					stdio: 'ignore',
					shell: true,
				}).unref();
				break;
			}
			default:
				console.error(`[TerminalService] Unsupported platform: ${platform}`);
				return {
					success: false,
					message: `Unsupported platform: ${platform}`,
				};
		}

		console.error(`[TerminalService] Returning success for path: ${path}`);
		return {
			success: true,
			message: `Opened terminal in ${path}`,
		};
	} catch (error) {
		console.error(
			`[TerminalService] Outer catch error: ${error instanceof Error ? error.message : String(error)}`
		);
		return {
			success: false,
			message: `Failed to open terminal: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

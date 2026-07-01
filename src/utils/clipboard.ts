import { spawn } from 'child_process';

/**
 * Platform clipboard-copy commands, tried in order. Each entry is the argv for a
 * command that reads the text to copy from stdin.
 *
 * On Linux we try Wayland first (`wl-copy`), then the two common X11 tools
 * (`xclip`, `xsel`), and finally `clip.exe` — the Windows clipboard reached via
 * WSL interop, which is the only one of these present on a stock WSL install
 * (bare WSL has no X/Wayland display). `clip.exe` is simply absent (ENOENT, so
 * skipped) on native Linux.
 */
function clipboardCommands(): Array<{ command: string; args: string[] }> {
	if (process.platform === 'darwin') {
		return [{ command: 'pbcopy', args: [] }];
	}
	if (process.platform === 'win32') {
		return [{ command: 'clip', args: [] }];
	}
	return [
		{ command: 'wl-copy', args: [] },
		{ command: 'xclip', args: ['-selection', 'clipboard'] },
		{ command: 'xsel', args: ['--clipboard', '--input'] },
		{ command: 'clip.exe', args: [] },
	];
}

/**
 * Attempt a single clipboard tool. Resolves true once the process has spawned
 * and been handed the payload, false when the command is missing.
 *
 * Deliberately asynchronous and non-blocking: several clipboard tools stay
 * resident to serve the selection to other apps (`wl-copy` on Wayland always
 * does; `xclip`/`xsel` can too), so we must NOT wait for the process to exit —
 * `spawnSync` would hang forever on those. Running it detached + unref'd also
 * keeps it off the parent's TTY, so it can't disturb Ink's raw-mode stdin (a
 * synchronous child does, which leaves keyboard input dead afterward).
 */
function tryCopy(command: string, args: string[], text: string): Promise<boolean> {
	return new Promise((resolve) => {
		let child;
		try {
			child = spawn(command, args, { stdio: ['pipe', 'ignore', 'ignore'], detached: true });
		} catch {
			resolve(false);
			return;
		}
		// Missing binary (ENOENT) and similar launch failures land here.
		child.once('error', () => resolve(false));
		child.once('spawn', () => {
			if (child.stdin) {
				// Ignore EPIPE if the tool exits before we finish writing.
				child.stdin.on('error', () => {});
				child.stdin.end(text);
			}
			// Let a resident tool outlive Grove without keeping the event loop alive.
			child.unref();
			resolve(true);
		});
	});
}

/**
 * Copy `text` to the system clipboard. Best-effort: tries the
 * platform-appropriate tools in order and resolves true on the first that
 * launches, false when none are available (e.g. no clipboard tool installed on a
 * headless Linux box). Never throws and never blocks.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
	for (const { command, args } of clipboardCommands()) {
		if (await tryCopy(command, args, text)) {
			return true;
		}
	}
	return false;
}

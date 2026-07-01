import { spawnSync } from 'child_process';

/**
 * Platform clipboard-copy commands, tried in order. Each entry is the argv for a
 * command that reads the text to copy from stdin. On Linux we try Wayland first
 * (`wl-copy`), then the two common X11 tools (`xclip`, `xsel`).
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
	];
}

/**
 * Copy `text` to the system clipboard. Best-effort and synchronous: tries the
 * platform-appropriate tools in order and returns true on the first success,
 * false when none are available or all fail (e.g. no clipboard tool installed on
 * a headless Linux box). Never throws.
 */
export function copyToClipboard(text: string): boolean {
	for (const { command, args } of clipboardCommands()) {
		try {
			const result = spawnSync(command, args, {
				input: text,
				stdio: ['pipe', 'ignore', 'ignore'],
				shell: process.platform === 'win32',
			});
			if (!result.error && result.status === 0) {
				return true;
			}
		} catch {
			// Try the next tool.
		}
	}
	return false;
}

import { spawn } from 'child_process';

/**
 * OSC 8 terminal hyperlink wrapping.
 * Produces an escape sequence that modern terminals render as a clickable link
 * (typically via Cmd/Ctrl-click) while still displaying `text` inline.
 *
 * Format: ESC ] 8 ; ; <url> BEL <text> ESC ] 8 ; ; BEL
 */
const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const OSC_8 = `${ESC}]8;;`;

/**
 * Wrap display text in an OSC 8 hyperlink pointing at `url`.
 */
export function hyperlink(text: string, url: string): string {
	return `${OSC_8}${url}${BEL}${text}${OSC_8}${BEL}`;
}

/**
 * Click-guard shared between link cells and the tiles that contain them.
 *
 * The mouse layer fires every handler whose bounds contain the click (no
 * propagation), so a click on an in-tile link also triggers the tile's own
 * activation. A link marks itself opened here; the tile defers its activation a
 * tick and skips it if a link was just opened.
 */
let lastLinkOpenAt = 0;

/** Record that an in-app link was just opened (call from a link's click handler). */
export function markLinkOpened(): void {
	lastLinkOpenAt = Date.now();
}

/** Whether an in-app link was opened within the last `withinMs` milliseconds. */
export function wasLinkRecentlyOpened(withinMs = 250): boolean {
	return Date.now() - lastLinkOpenAt < withinMs;
}

/**
 * Open a URL in the user's default browser, detached from the app.
 * Best-effort: failures are swallowed (the OSC 8 link remains as a fallback).
 */
export function openUrl(url: string): void {
	const command =
		process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
	// On Windows, `start` is a shell builtin and needs an empty title arg.
	const args = process.platform === 'win32' ? ['', url] : [url];

	try {
		const proc = spawn(command, args, {
			stdio: 'ignore',
			detached: true,
			shell: process.platform === 'win32',
		});
		proc.on('error', () => {
			// Ignore — opening a browser is best-effort.
		});
		proc.unref();
	} catch {
		// Ignore — opening a browser is best-effort.
	}
}

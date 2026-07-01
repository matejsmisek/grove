/** The ESC byte a real Escape keypress produces. */
export const ESC = '\u001b';

// When terminal mouse tracking is on (ink-mouse enables motion reporting, mode
// 1003), a keypress can arrive in the same stdin chunk as one or more mouse
// reports. Ink then parses the whole buffer as a single sequence, so
// `key.escape` / `key.return` come back false and the keypress is lost. These
// patterns match the mouse reports so we can strip them and inspect what the
// real keypress left behind. Built via RegExp to keep the control byte out of a
// regex literal (and to satisfy no-control-regex).
const MOUSE_SGR_RE = new RegExp(`${ESC}\\[<\\d+;\\d+;\\d+[Mm]`, 'g');
const MOUSE_X10_RE = new RegExp(`${ESC}\\[M[\\s\\S]{3}`, 'g');

/** Remove any embedded SGR (mode 1006) or legacy X10 mouse reports from `input`. */
export function stripMouseReports(input: string): string {
	return input.replace(MOUSE_SGR_RE, '').replace(MOUSE_X10_RE, '');
}

/**
 * Interpret a keypress that may have been batched together with mouse-motion
 * reports. Returns whether the chunk represents Escape and/or Enter, trusting
 * Ink's parsed `key` first and falling back to the raw bytes left after
 * stripping mouse reports. A pure mouse report strips to nothing, so it yields
 * neither.
 */
export function interpretModalKey(
	input: string,
	key: { escape?: boolean; return?: boolean }
): { escape: boolean; enter: boolean } {
	const keyChars = stripMouseReports(input);
	return {
		escape: Boolean(key.escape) || keyChars.includes(ESC),
		enter: Boolean(key.return) || keyChars.includes('\r') || keyChars.includes('\n'),
	};
}

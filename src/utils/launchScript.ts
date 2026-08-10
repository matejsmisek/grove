import crypto from 'crypto';

import { shellQuoteArg } from './sessionName.js';

/**
 * Build a bash launch script that starts a standard interactive Claude session
 * (`claude --name <name> "<prompt>"`) with a prefilled prompt.
 *
 * The prompt is fed to Claude through a single-quoted heredoc so that everything
 * inside it — double/single quotes, `$`, backticks, backslashes, tabs and newlines —
 * is delivered literally, with no shell expansion. Running the prompt this way (from
 * a file, via `bash <script>`) keeps the terminal launch command a few shlex-safe
 * tokens, so it survives being embedded verbatim into terminal config files
 * (kitty/konsole session files) and AppleScript payloads, none of which are parsed
 * by a shell and none of which tolerate a multi-line, shell-quoted argument inline.
 *
 * A random heredoc delimiter is used and, in the astronomically unlikely event the
 * prompt contains a line equal to it, extended until it no longer collides.
 */
export function buildClaudePromptLaunchScript(sessionName: string, prompt: string): string {
	let delimiter = `GROVE_PROMPT_${crypto.randomBytes(8).toString('hex')}`;
	const lines = prompt.split('\n');
	while (lines.includes(delimiter)) {
		delimiter = `GROVE_PROMPT_${crypto.randomBytes(12).toString('hex')}`;
	}

	return `#!/usr/bin/env bash
exec claude --name ${shellQuoteArg(sessionName)} "$(cat <<'${delimiter}'
${prompt}
${delimiter}
)"
`;
}

import path from 'path';

/**
 * Build a display name for a Claude session from the grove/worktree names. Used
 * both for background sessions (`claude --bg --name`) and standard interactive
 * launches (`claude --name`). Falls back to the repository basename, then a
 * generic label, and is capped at 60 characters.
 */
export function buildSessionName(
	repositoryPath: string,
	groveName?: string,
	worktreeName?: string
): string {
	const parts: string[] = [];
	if (groveName) {
		parts.push(groveName);
	}
	const leaf = worktreeName || path.basename(repositoryPath);
	// Avoid duplicating the name (e.g. "name/name") when the grove and
	// worktree names are identical.
	if (leaf !== groveName) {
		parts.push(leaf);
	}
	return (parts.join('/') || 'grove-session').slice(0, 60);
}

/**
 * Single-quote a value for safe embedding in a shell command string (the Claude
 * command is substituted into `bash -c` payloads and terminal session files).
 */
export function shellQuoteArg(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

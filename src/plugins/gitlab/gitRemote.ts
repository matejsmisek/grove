/**
 * Git remote URL parsing
 * Extracts the host and the `namespace/project` path from a git remote URL,
 * supporting both SSH (scp-like and ssh://) and HTTPS forms.
 */

export interface ParsedGitRemote {
	/** Hostname without port (e.g. "gitlab.com") */
	host: string;
	/** Project path with namespace, no leading slash or trailing .git (e.g. "group/sub/project") */
	projectPath: string;
}

/**
 * Parse a git remote URL into its host and project path.
 *
 * Handles:
 * - scp-like SSH:   git@gitlab.com:group/sub/project.git
 * - ssh:// URLs:    ssh://git@gitlab.com:2222/group/project.git
 * - HTTPS:          https://gitlab.com/group/sub/project.git
 * - HTTPS w/ creds: https://oauth2:token@gitlab.com/group/project.git
 *
 * @returns the parsed remote, or null if the URL can't be understood
 */
export function parseGitRemote(remoteUrl: string | null | undefined): ParsedGitRemote | null {
	if (!remoteUrl) {
		return null;
	}

	const url = remoteUrl.trim();
	let host: string;
	let projectPath: string;

	// scp-like syntax (user@host:path) has no scheme. Detect by absence of "://".
	const scpMatch = url.match(/^[^@/]+@([^:/]+):(.+)$/);
	if (scpMatch && !url.includes('://')) {
		host = scpMatch[1];
		projectPath = scpMatch[2];
	} else {
		try {
			const parsed = new URL(url);
			host = parsed.hostname;
			projectPath = parsed.pathname;
		} catch {
			return null;
		}
	}

	// Normalize the path: drop leading slashes, a trailing .git, and trailing slashes.
	projectPath = projectPath
		.replace(/^\/+/, '')
		.replace(/\.git$/i, '')
		.replace(/\/+$/, '');

	if (!host || !projectPath) {
		return null;
	}

	return { host: host.toLowerCase(), projectPath };
}

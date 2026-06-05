/**
 * Asana task URL parsing.
 *
 * Asana task URLs come in a few shapes, all hosted on app.asana.com:
 *   - Classic:  https://app.asana.com/0/{projectGid}/{taskGid}
 *   - With view suffix: https://app.asana.com/0/{projectGid}/{taskGid}/f
 *   - "My Tasks"/list: https://app.asana.com/0/{listGid}/{taskGid}
 *   - New layout: https://app.asana.com/1/{workspaceGid}/project/{projectGid}/task/{taskGid}
 *   - New layout (no project): https://app.asana.com/1/{workspaceGid}/task/{taskGid}
 *
 * Asana gids are numeric strings. We extract the task gid and ignore the rest.
 */

/**
 * Parsed Asana task reference extracted from a URL.
 */
export interface ParsedAsanaTask {
	/** The Asana task gid (numeric string) */
	gid: string;
}

/** Whether a path segment looks like an Asana gid (a non-empty run of digits). */
function isGid(segment: string | undefined): segment is string {
	return !!segment && /^\d+$/.test(segment);
}

/**
 * Parse an Asana task URL and extract the task gid.
 *
 * @param value - A candidate URL string (may include surrounding whitespace).
 * @returns The parsed task gid, or null if `value` is not a recognizable Asana task URL.
 */
export function parseAsanaTaskUrl(value: string): ParsedAsanaTask | null {
	const trimmed = value.trim();
	if (!trimmed) {
		return null;
	}

	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		return null;
	}

	// Only app.asana.com (and subdomains like app.asana.com) are task hosts.
	const host = parsed.hostname.toLowerCase();
	if (host !== 'app.asana.com' && !host.endsWith('.asana.com')) {
		return null;
	}

	const segments = parsed.pathname.split('/').filter(Boolean);

	// New layout: the gid is the segment immediately after a "task" segment.
	const taskIdx = segments.indexOf('task');
	if (taskIdx !== -1 && isGid(segments[taskIdx + 1])) {
		return { gid: segments[taskIdx + 1] };
	}

	// Classic layout: /0/{projectGid}/{taskGid}[/...]. The task gid is the third segment.
	if (segments[0] === '0' && isGid(segments[2])) {
		return { gid: segments[2] };
	}

	return null;
}

/**
 * Whether the given string looks like an Asana task URL (cheap predicate over
 * {@link parseAsanaTaskUrl} for UI gating).
 */
export function isAsanaTaskUrl(value: string): boolean {
	return parseAsanaTaskUrl(value) !== null;
}

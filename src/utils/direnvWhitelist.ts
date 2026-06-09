import fs from 'fs';
import os from 'os';
import path from 'path';

import { isDirenvAvailable } from './direnv.js';

/**
 * direnv whitelist management.
 *
 * direnv reads a config file (typically `~/.config/direnv/direnv.toml`) whose
 * `[whitelist]` `prefix` array lists directory prefixes that are trusted without
 * an explicit `direnv allow`. Any `.envrc`/`.env` found at or below a whitelisted
 * prefix loads automatically.
 *
 * Grove offers to add the groves folder to this whitelist so every worktree it
 * creates beneath that folder inherits a trusted environment with no extra step.
 * These helpers read and rewrite only the `[whitelist].prefix` array, leaving the
 * rest of the user's config (comments, other sections, `exact` entries) untouched.
 *
 * See `direnv.ts` for the command-wrapping side of the integration.
 */

/**
 * Path to the direnv config file. Honors `XDG_CONFIG_HOME` (direnv's own
 * resolution order), falling back to `~/.config/direnv/direnv.toml`.
 */
export function getDirenvConfigPath(): string {
	const configHome = process.env.XDG_CONFIG_HOME?.trim() || path.join(os.homedir(), '.config');
	return path.join(configHome, 'direnv', 'direnv.toml');
}

/** Drop a trailing path separator so paths compare regardless of how they were typed. */
function stripTrailingSlash(p: string): string {
	return p.replace(/[/\\]+$/, '');
}

/**
 * Locate the `[whitelist]` section in TOML `content`. Returns the offset just
 * after the header line (where the section body begins) and the offset where the
 * section ends (the next top-level `[header]` or end of file). Null when there is
 * no `[whitelist]` section.
 */
function getWhitelistSection(content: string): { bodyStart: number; bodyEnd: number } | null {
	const header = content.match(/^[ \t]*\[whitelist\][ \t]*$/m);
	if (header?.index === undefined) {
		return null;
	}

	// Start the body just past the header line's newline (if any).
	const afterHeader = header.index + header[0].length;
	const bodyStart = content[afterHeader] === '\n' ? afterHeader + 1 : afterHeader;

	// The section ends at the next top-level section header, or EOF.
	const rest = content.slice(bodyStart);
	const nextHeader = rest.match(/\n[ \t]*\[[^\]]+\][ \t]*$/m);
	const bodyEnd = nextHeader?.index === undefined ? content.length : bodyStart + nextHeader.index;

	return { bodyStart, bodyEnd };
}

/** Extract the quoted strings from a TOML array body like `"a", "b"`. */
function parseQuotedStrings(arrayBody: string): string[] {
	return [...arrayBody.matchAll(/"([^"]*)"|'([^']*)'/g)].map((m) => m[1] ?? m[2]);
}

/** Read the `[whitelist].prefix` entries from the given TOML content. */
function extractPrefixes(content: string): string[] {
	const section = getWhitelistSection(content);
	if (!section) {
		return [];
	}
	const body = content.slice(section.bodyStart, section.bodyEnd);
	const arr = body.match(/prefix[ \t]*=[ \t]*\[([\s\S]*?)\]/);
	if (!arr) {
		return [];
	}
	return parseQuotedStrings(arr[1]);
}

/** Read the current `[whitelist].prefix` entries from the direnv config file. */
export function readDirenvWhitelistPrefixes(): string[] {
	const configPath = getDirenvConfigPath();
	if (!fs.existsSync(configPath)) {
		return [];
	}
	try {
		return extractPrefixes(fs.readFileSync(configPath, 'utf-8'));
	} catch {
		return [];
	}
}

/**
 * Whether `dir` is already trusted by an existing whitelist prefix — either an
 * exact match or a parent prefix that covers it. Used to decide whether it is
 * worth prompting the user at all.
 */
export function isPathInDirenvWhitelist(dir: string): boolean {
	const target = stripTrailingSlash(dir);
	return readDirenvWhitelistPrefixes().some((entry) => {
		const prefix = stripTrailingSlash(entry);
		return target === prefix || target.startsWith(`${prefix}${path.sep}`);
	});
}

/** Render a `prefix = [...]` TOML assignment with two-space indentation. */
function formatPrefixArray(prefixes: string[]): string {
	if (prefixes.length === 0) {
		return 'prefix = []';
	}
	const lines = prefixes.map((p) => `  "${p}",`).join('\n');
	return `prefix = [\n${lines}\n]`;
}

/** Produce updated TOML content with the `[whitelist].prefix` array set to `prefixes`. */
function writePrefixes(content: string, prefixes: string[]): string {
	const arrayText = formatPrefixArray(prefixes);
	const section = getWhitelistSection(content);

	if (!section) {
		// No [whitelist] section yet — append one.
		const separator = content.length === 0 ? '' : content.endsWith('\n') ? '\n' : '\n\n';
		return `${content}${separator}[whitelist]\n${arrayText}\n`;
	}

	const body = content.slice(section.bodyStart, section.bodyEnd);
	if (/prefix[ \t]*=[ \t]*\[[\s\S]*?\]/.test(body)) {
		// Replace the existing prefix array in place.
		const newBody = body.replace(/prefix[ \t]*=[ \t]*\[[\s\S]*?\]/, arrayText);
		return content.slice(0, section.bodyStart) + newBody + content.slice(section.bodyEnd);
	}

	// [whitelist] exists but has no prefix key — insert one at the top of the body.
	return content.slice(0, section.bodyStart) + `${arrayText}\n` + content.slice(section.bodyStart);
}

/**
 * Add `add` to the direnv `[whitelist].prefix` array, optionally removing a
 * previous prefix (`remove`) — used when the groves folder changes so the old
 * location no longer lingers in the whitelist. Creates the config file and its
 * directory when missing. Idempotent: adding a path that is already present does
 * not duplicate it.
 */
export function addDirenvWhitelistPrefix(add: string, remove?: string): void {
	const configPath = getDirenvConfigPath();
	const content = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf-8') : '';

	const normalizedAdd = stripTrailingSlash(add);
	const normalizedRemove = remove ? stripTrailingSlash(remove) : undefined;

	const next = extractPrefixes(content).filter((entry) => {
		const normalized = stripTrailingSlash(entry);
		return normalized !== normalizedAdd && normalized !== normalizedRemove;
	});
	next.push(normalizedAdd);

	fs.mkdirSync(path.dirname(configPath), { recursive: true });
	fs.writeFileSync(configPath, writePrefixes(content, next), 'utf-8');
}

/**
 * Whether Grove should offer to whitelist `folder` in direnv. True only when
 * direnv is installed, the folder is non-empty and not already covered by an
 * existing prefix, and the user has not already been asked about this exact
 * folder (`alreadyPromptedFolder`). Used to gate the startup trust prompt in
 * repo/workspace mode, where the groves folder is derived automatically and the
 * setup wizard never runs.
 */
export function shouldOfferDirenvWhitelist(
	folder: string | undefined,
	alreadyPromptedFolder?: string
): boolean {
	const trimmed = folder?.trim();
	if (!trimmed) {
		return false;
	}
	if (alreadyPromptedFolder && alreadyPromptedFolder.trim() === trimmed) {
		return false;
	}
	if (!isDirenvAvailable()) {
		return false;
	}
	return !isPathInDirenvWhitelist(trimmed);
}

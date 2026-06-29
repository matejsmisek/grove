import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

/**
 * Version helpers.
 *
 * `getAppVersion()` reports the version of the installed Grove (`hypergrove`)
 * package by reading the `package.json` shipped alongside the compiled code. It
 * resolves relative to this module's own location (`import.meta.url`) rather
 * than the current working directory, so it works regardless of how the package
 * was installed (npm/pnpm/yarn/bun global, a local `node_modules`, or a dev
 * checkout run via tsx).
 */

let cachedVersion: string | null = null;

/** Fallback shown when the package version can't be determined. */
export const UNKNOWN_VERSION = 'unknown';

/**
 * The installed Grove version (the `version` field of the package's own
 * package.json). Memoized — package.json never changes within a single run.
 * Returns {@link UNKNOWN_VERSION} if it can't be located.
 */
export function getAppVersion(): string {
	if (cachedVersion !== null) {
		return cachedVersion;
	}
	cachedVersion = readPackageVersion() ?? UNKNOWN_VERSION;
	return cachedVersion;
}

/**
 * Walk upward from this module's directory looking for the `hypergrove`
 * package.json. The compiled file lives at `<pkg>/dist/utils/version.js` and the
 * source at `<pkg>/src/utils/version.ts`, so package.json is one or two levels
 * up; we scan a few levels to stay robust to layout changes.
 */
function readPackageVersion(): string | null {
	let dir = dirname(fileURLToPath(import.meta.url));
	for (let i = 0; i < 5; i++) {
		try {
			const raw = readFileSync(join(dir, 'package.json'), 'utf-8');
			const parsed = JSON.parse(raw) as { name?: string; version?: string };
			if (parsed.name === 'hypergrove' && typeof parsed.version === 'string') {
				return parsed.version;
			}
		} catch {
			// No package.json here (or unreadable/invalid); keep walking up.
		}
		const parent = dirname(dir);
		if (parent === dir) {
			break;
		}
		dir = parent;
	}
	return null;
}

/**
 * Compare two semver-ish version strings on their `major.minor.patch` core,
 * ignoring any pre-release/build suffix. Returns -1 if `a < b`, 1 if `a > b`,
 * and 0 if they are equal.
 */
export function compareSemver(a: string, b: string): number {
	const pa = parseVersion(a);
	const pb = parseVersion(b);
	for (let i = 0; i < 3; i++) {
		if (pa[i] !== pb[i]) {
			return pa[i] < pb[i] ? -1 : 1;
		}
	}
	return 0;
}

/** Whether `latest` is strictly newer than `current`. */
export function isNewerVersion(latest: string, current: string): boolean {
	if (current === UNKNOWN_VERSION || latest === UNKNOWN_VERSION) {
		return false;
	}
	return compareSemver(latest, current) > 0;
}

function parseVersion(version: string): [number, number, number] {
	const core = version.trim().replace(/^v/i, '').split(/[-+]/)[0];
	const parts = core.split('.');
	return [toInt(parts[0]), toInt(parts[1]), toInt(parts[2])];
}

function toInt(value: string | undefined): number {
	const n = parseInt(value ?? '0', 10);
	return Number.isNaN(n) ? 0 : n;
}

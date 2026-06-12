import fs from 'fs';

/**
 * Process-wide mtime/size-validated cache for parsed JSON files.
 *
 * The storage layer is read-heavy: screens call into the groves index, grove
 * metadata, and `.grove.json` configs on every render cycle, each time doing a
 * blocking `fs.readFileSync` + `JSON.parse`. A file's contents only change when
 * Grove (or the user) writes it, so we can skip the read+parse when neither the
 * modification time nor the size has changed since we last parsed it.
 *
 * The public API stays synchronous — this trades the (expensive) full read +
 * parse for a (cheap) `fs.statSync`, keeping callers unchanged.
 *
 * Correctness notes:
 * - Cached values are deep-cloned on store and on return, so callers can freely
 *   mutate what they get back without corrupting the cache (and vice versa).
 * - Filesystem mtime resolution can be coarse, so two writes within the same
 *   tick could share an mtime. Writers therefore must call
 *   {@link invalidateJsonFileCache} after writing so a same-tick rewrite is never
 *   served stale from cache. External (other-process) edits still rely on mtime.
 */
interface CacheEntry {
	mtimeMs: number;
	size: number;
	data: unknown;
}

const cache = new Map<string, CacheEntry>();

/**
 * Read and parse a JSON file, reusing the previously parsed value when the file
 * is unchanged (same mtime + size). Returns `undefined` when the file does not
 * exist. Throws on read/parse errors so callers keep their own error handling.
 *
 * The returned object is always a fresh deep clone and safe to mutate.
 */
export function readJsonFileCached<T>(filePath: string): T | undefined {
	let stat: fs.Stats;
	try {
		stat = fs.statSync(filePath);
	} catch {
		// Missing (or unstattable) file — drop any stale entry and report absence.
		cache.delete(filePath);
		return undefined;
	}

	const cached = cache.get(filePath);
	if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
		return structuredClone(cached.data) as T;
	}

	const raw = fs.readFileSync(filePath, 'utf-8');
	const data = JSON.parse(raw) as T;
	cache.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, data: structuredClone(data) });
	return data;
}

/**
 * Drop the cached entry for a path. Call this immediately after writing the file
 * so the next read re-parses fresh content (guards against same-tick mtimes).
 */
export function invalidateJsonFileCache(filePath: string): void {
	cache.delete(filePath);
}

/** Clear the entire cache. Intended for tests to isolate cases. */
export function clearJsonFileCache(): void {
	cache.clear();
}

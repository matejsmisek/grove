import fs from 'fs';
import { get as httpsGet } from 'https';
import { dirname, join } from 'path';

import { getGlobalGroveFolder } from '../utils/globalGroveDir.js';
import { getAppVersion } from '../utils/version.js';

/** The npm package name Grove is published under. */
const PACKAGE_NAME = 'hypergrove';

/**
 * The registry endpoint for the `latest` dist-tag manifest. Fetched directly
 * over HTTPS (not via `npm view`) so the result reflects the registry's true
 * latest version — `npm` caches its packument and can otherwise report a stale
 * `@latest`.
 */
const REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;

/** Cache file (lives in the global ~/.grove folder). */
const CACHE_FILE = 'update-check.json';

/** How long a successful check is reused before re-fetching. */
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

/** Give up on the network call after this long so startup never hangs. */
const REQUEST_TIMEOUT_MS = 5000;

interface UpdateCheckCache {
	/** Epoch ms of the last lookup attempt. */
	checkedAt: number;
	/** The latest version seen, or null when no successful lookup has happened. */
	latest: string | null;
}

export interface IUpdateService {
	/** The currently installed Grove version. */
	getCurrentVersion(): string;
	/**
	 * The latest published version from the npm registry, or null when it can't
	 * be determined (offline, error, never fetched). Cached for 2h; pass
	 * `{ force: true }` to bypass the cache.
	 */
	getLatestVersion(options?: { force?: boolean }): Promise<string | null>;
}

export interface UpdateServiceDeps {
	/** Directory holding the cache file. Defaults to the global grove folder. */
	cacheDir?: string;
	/** Fetches the latest published version. Injectable for tests. */
	fetchLatest?: () => Promise<string | null>;
}

/**
 * Checks the npm registry for a newer Grove release and caches the result.
 *
 * Notify-only: this service never installs anything — it only reports the
 * current and latest versions so the UI can surface an "Update available" hint
 * (matching the convention of npm/yarn/gh and `update-notifier`). All failures
 * are swallowed and surface as a null latest version; a registry hiccup must
 * never break startup or the UI.
 */
export class UpdateService implements IUpdateService {
	private readonly cachePath: string;
	private readonly fetchLatest: () => Promise<string | null>;
	/** Coalesces concurrent callers onto a single in-flight network request. */
	private inflight: Promise<string | null> | null = null;

	constructor(deps: UpdateServiceDeps = {}) {
		const dir = deps.cacheDir ?? getGlobalGroveFolder();
		this.cachePath = join(dir, CACHE_FILE);
		this.fetchLatest = deps.fetchLatest ?? fetchLatestFromRegistry;
	}

	getCurrentVersion(): string {
		return getAppVersion();
	}

	async getLatestVersion(options: { force?: boolean } = {}): Promise<string | null> {
		if (!options.force) {
			const cached = this.readCache();
			if (cached && Date.now() - cached.checkedAt < CACHE_TTL_MS) {
				return cached.latest;
			}
		}
		if (!this.inflight) {
			this.inflight = this.refresh();
		}
		try {
			return await this.inflight;
		} finally {
			this.inflight = null;
		}
	}

	private async refresh(): Promise<string | null> {
		const prior = this.readCache();
		let latest: string | null;
		try {
			latest = await this.fetchLatest();
		} catch {
			latest = null;
		}
		// A failed fetch keeps the last known version but still bumps the
		// timestamp, so we back off instead of hammering the network every render.
		const resolved = latest ?? prior?.latest ?? null;
		this.writeCache({ checkedAt: Date.now(), latest: resolved });
		return resolved;
	}

	private readCache(): UpdateCheckCache | null {
		try {
			const raw = fs.readFileSync(this.cachePath, 'utf-8');
			const parsed = JSON.parse(raw) as Partial<UpdateCheckCache>;
			if (typeof parsed.checkedAt === 'number') {
				return {
					checkedAt: parsed.checkedAt,
					latest: typeof parsed.latest === 'string' ? parsed.latest : null,
				};
			}
		} catch {
			// Missing or invalid cache — treat as no cache.
		}
		return null;
	}

	private writeCache(cache: UpdateCheckCache): void {
		try {
			const dir = dirname(this.cachePath);
			// The global grove folder is created at startup, so this is normally a
			// no-op; guard it anyway so the cache survives an unusual setup.
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}
			fs.writeFileSync(this.cachePath, JSON.stringify(cache), 'utf-8');
		} catch {
			// Best-effort; cache write failures must never break the app.
		}
	}
}

/**
 * Fetch the latest published version directly from the npm registry over HTTPS.
 * Resolves to null on any non-200, timeout, network, or parse error.
 */
function fetchLatestFromRegistry(): Promise<string | null> {
	return new Promise((resolve) => {
		const req = httpsGet(REGISTRY_URL, { headers: { Accept: 'application/json' } }, (res) => {
			if (res.statusCode !== 200) {
				res.resume();
				resolve(null);
				return;
			}
			let body = '';
			res.setEncoding('utf-8');
			res.on('data', (chunk: string) => {
				body += chunk;
			});
			res.on('end', () => {
				try {
					const parsed = JSON.parse(body) as { version?: string };
					resolve(typeof parsed.version === 'string' ? parsed.version : null);
				} catch {
					resolve(null);
				}
			});
		});
		req.on('error', () => resolve(null));
		req.setTimeout(REQUEST_TIMEOUT_MS, () => {
			req.destroy();
			resolve(null);
		});
	});
}

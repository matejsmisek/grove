import { Volume } from 'memfs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockFs } from '../../__tests__/helpers.js';
import { UpdateService } from '../UpdateService.js';

let vol: Volume;

vi.mock('fs', () => {
	return {
		default: new Proxy(
			{},
			{
				get(_target, prop) {
					return vol?.[prop as keyof Volume];
				},
			}
		),
		...Object.fromEntries(
			Object.getOwnPropertyNames(Volume.prototype)
				.filter((key) => key !== 'constructor')
				.map((key) => [key, (...args: unknown[]) => vol?.[key as keyof Volume]?.(...args)])
		),
	};
});

const CACHE_DIR = '/home/user/.grove';
const CACHE_PATH = `${CACHE_DIR}/update-check.json`;

describe('UpdateService', () => {
	beforeEach(() => {
		const mockFs = createMockFs();
		vol = mockFs.vol;
		vol.mkdirSync(CACHE_DIR, { recursive: true });
	});

	afterEach(() => {
		vi.clearAllMocks();
		vi.useRealTimers();
	});

	it('fetches the latest version and caches it', async () => {
		const fetchLatest = vi.fn().mockResolvedValue('1.5.0');
		const service = new UpdateService({ cacheDir: CACHE_DIR, fetchLatest });

		const latest = await service.getLatestVersion();

		expect(latest).toBe('1.5.0');
		expect(fetchLatest).toHaveBeenCalledTimes(1);
		const cache = JSON.parse(vol.readFileSync(CACHE_PATH, 'utf-8') as string);
		expect(cache.latest).toBe('1.5.0');
		expect(typeof cache.checkedAt).toBe('number');
	});

	it('reuses the cache within the TTL without re-fetching', async () => {
		const fetchLatest = vi.fn().mockResolvedValue('1.5.0');
		const service = new UpdateService({ cacheDir: CACHE_DIR, fetchLatest });

		await service.getLatestVersion();
		const second = await service.getLatestVersion();

		expect(second).toBe('1.5.0');
		expect(fetchLatest).toHaveBeenCalledTimes(1);
	});

	it('re-fetches once the cache is older than the 2h TTL', async () => {
		const now = 1_000_000_000_000;
		const fetchLatest = vi.fn().mockResolvedValue('1.6.0');
		const service = new UpdateService({ cacheDir: CACHE_DIR, fetchLatest });

		// Write a stale cache entry (3 hours old).
		vol.writeFileSync(
			CACHE_PATH,
			JSON.stringify({ checkedAt: now - 3 * 60 * 60 * 1000, latest: '1.5.0' })
		);
		vi.spyOn(Date, 'now').mockReturnValue(now);

		const latest = await service.getLatestVersion();

		expect(latest).toBe('1.6.0');
		expect(fetchLatest).toHaveBeenCalledTimes(1);
	});

	it('force-refreshes even when a fresh cache exists', async () => {
		const fetchLatest = vi.fn().mockResolvedValueOnce('1.5.0').mockResolvedValueOnce('1.6.0');
		const service = new UpdateService({ cacheDir: CACHE_DIR, fetchLatest });

		await service.getLatestVersion();
		const forced = await service.getLatestVersion({ force: true });

		expect(forced).toBe('1.6.0');
		expect(fetchLatest).toHaveBeenCalledTimes(2);
	});

	it('falls back to the last cached version when a fetch fails', async () => {
		const fetchLatest = vi
			.fn()
			.mockResolvedValueOnce('1.5.0')
			.mockRejectedValueOnce(new Error('net'));
		const service = new UpdateService({ cacheDir: CACHE_DIR, fetchLatest });

		await service.getLatestVersion();
		const afterFailure = await service.getLatestVersion({ force: true });

		expect(afterFailure).toBe('1.5.0');
	});

	it('returns null when there is no cache and the fetch fails', async () => {
		const fetchLatest = vi.fn().mockRejectedValue(new Error('offline'));
		const service = new UpdateService({ cacheDir: CACHE_DIR, fetchLatest });

		const latest = await service.getLatestVersion();

		expect(latest).toBeNull();
	});
});

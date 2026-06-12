import { Volume } from 'memfs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	clearJsonFileCache,
	invalidateJsonFileCache,
	readJsonFileCached,
} from '../jsonFileCache.js';

let vol: Volume;

vi.mock('fs', () => ({
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
}));

describe('jsonFileCache', () => {
	beforeEach(() => {
		vol = new Volume();
		vol.mkdirSync('/d', { recursive: true });
		clearJsonFileCache();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('returns undefined for a missing file', () => {
		expect(readJsonFileCached('/d/missing.json')).toBeUndefined();
	});

	it('parses and returns the file contents', () => {
		vol.writeFileSync('/d/a.json', JSON.stringify({ x: 1 }));
		expect(readJsonFileCached('/d/a.json')).toEqual({ x: 1 });
	});

	it('reuses the cache while the file is unchanged (no re-read)', () => {
		vol.writeFileSync('/d/a.json', JSON.stringify({ x: 1 }));
		readJsonFileCached('/d/a.json');

		const spy = vi.spyOn(vol, 'readFileSync');
		const result = readJsonFileCached('/d/a.json');

		expect(result).toEqual({ x: 1 });
		expect(spy).not.toHaveBeenCalled();
	});

	it('re-reads after invalidation', () => {
		vol.writeFileSync('/d/a.json', JSON.stringify({ x: 1 }));
		readJsonFileCached('/d/a.json');
		invalidateJsonFileCache('/d/a.json');

		const spy = vi.spyOn(vol, 'readFileSync');
		readJsonFileCached('/d/a.json');

		expect(spy).toHaveBeenCalled();
	});

	it('re-reads when the file content changes', () => {
		vol.writeFileSync('/d/a.json', JSON.stringify({ x: 1 }));
		expect(readJsonFileCached('/d/a.json')).toEqual({ x: 1 });

		vol.writeFileSync('/d/a.json', JSON.stringify({ x: 222 }));
		expect(readJsonFileCached('/d/a.json')).toEqual({ x: 222 });
	});

	it('returns a fresh clone each call so callers cannot corrupt the cache', () => {
		vol.writeFileSync('/d/a.json', JSON.stringify({ arr: [1] }));

		const first = readJsonFileCached<{ arr: number[] }>('/d/a.json');
		first!.arr.push(99);

		// File unchanged → served from cache; must be unaffected by the mutation above.
		expect(readJsonFileCached('/d/a.json')).toEqual({ arr: [1] });
	});

	it('throws on invalid JSON', () => {
		vol.writeFileSync('/d/bad.json', 'not json {');
		expect(() => readJsonFileCached('/d/bad.json')).toThrow();
	});
});

import { Volume } from 'memfs';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockFs, setupMockHomeDir } from '../../__tests__/helpers.js';
import { JsonStore } from '../JsonStore.js';

// Mock filesystem and os modules
let vol: Volume;
let mockHomeDir: string;

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

vi.mock('os', () => ({
	default: {
		homedir: () => mockHomeDir,
	},
	homedir: () => mockHomeDir,
}));

interface TestData {
	items: string[];
	count: number;
}

describe('JsonStore', () => {
	let mockGroveFolder: string;
	let mockFilePath: string;

	const getDefaults = (): TestData => ({ items: [], count: 0 });

	beforeEach(() => {
		const mockFs = createMockFs();
		vol = mockFs.vol;

		mockHomeDir = '/home/testuser';
		setupMockHomeDir(vol, mockHomeDir);
		mockGroveFolder = path.join(mockHomeDir, '.grove');
		mockFilePath = path.join(mockGroveFolder, 'test.json');
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('read', () => {
		it('should return defaults when file does not exist', () => {
			const store = new JsonStore<TestData>(
				() => mockFilePath,
				() => mockGroveFolder,
				getDefaults,
				{ label: 'test' }
			);

			const data = store.read();

			expect(data).toEqual({ items: [], count: 0 });
		});

		it('should create file with defaults on first read when createOnFirstRead is true (default)', () => {
			const store = new JsonStore<TestData>(
				() => mockFilePath,
				() => mockGroveFolder,
				getDefaults,
				{ label: 'test' }
			);

			store.read();

			expect(vol.existsSync(mockFilePath)).toBe(true);
			const content = vol.readFileSync(mockFilePath, 'utf-8');
			const parsed = JSON.parse(content as string);
			expect(parsed).toEqual({ items: [], count: 0 });
		});

		it('should not create file on first read when createOnFirstRead is false', () => {
			const store = new JsonStore<TestData>(
				() => mockFilePath,
				() => mockGroveFolder,
				getDefaults,
				{ label: 'test', createOnFirstRead: false }
			);

			store.read();

			expect(vol.existsSync(mockFilePath)).toBe(false);
		});

		it('should read data from existing file', () => {
			const testData: TestData = { items: ['a', 'b'], count: 2 };
			vol.writeFileSync(mockFilePath, JSON.stringify(testData));

			const store = new JsonStore<TestData>(
				() => mockFilePath,
				() => mockGroveFolder,
				getDefaults,
				{ label: 'test' }
			);

			const data = store.read();

			expect(data).toEqual(testData);
		});

		it('should apply afterRead transform', () => {
			const testData = { items: ['a'], count: 1 };
			vol.writeFileSync(mockFilePath, JSON.stringify(testData));

			const store = new JsonStore<TestData>(
				() => mockFilePath,
				() => mockGroveFolder,
				getDefaults,
				{
					label: 'test',
					afterRead: (data, defaults) => ({
						...defaults,
						...data,
					}),
				}
			);

			const data = store.read();

			expect(data).toEqual({ items: ['a'], count: 1 });
		});

		it('should return defaults on JSON parse error', () => {
			vol.writeFileSync(mockFilePath, 'invalid json {');
			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			const store = new JsonStore<TestData>(
				() => mockFilePath,
				() => mockGroveFolder,
				getDefaults,
				{ label: 'test' }
			);

			const data = store.read();

			expect(data).toEqual({ items: [], count: 0 });
			expect(consoleErrorSpy).toHaveBeenCalledWith('Error reading test:', expect.any(Error));

			consoleErrorSpy.mockRestore();
		});
	});

	describe('write', () => {
		it('should write data to file with tab indentation by default', () => {
			const store = new JsonStore<TestData>(
				() => mockFilePath,
				() => mockGroveFolder,
				getDefaults,
				{ label: 'test' }
			);

			store.write({ items: ['x'], count: 1 });

			expect(vol.existsSync(mockFilePath)).toBe(true);
			const content = vol.readFileSync(mockFilePath, 'utf-8') as string;
			expect(content).toContain('\t');
			const parsed = JSON.parse(content);
			expect(parsed).toEqual({ items: ['x'], count: 1 });
		});

		it('should write data with custom indent', () => {
			const store = new JsonStore<TestData>(
				() => mockFilePath,
				() => mockGroveFolder,
				getDefaults,
				{ label: 'test', indent: 2 }
			);

			store.write({ items: ['x'], count: 1 });

			const content = vol.readFileSync(mockFilePath, 'utf-8') as string;
			expect(content).toContain('  '); // 2-space indent
			expect(content).not.toContain('\t');
		});

		it('should create parent directory if it does not exist', () => {
			vol.rmdirSync(mockGroveFolder, { recursive: true });

			const store = new JsonStore<TestData>(
				() => mockFilePath,
				() => mockGroveFolder,
				getDefaults,
				{ label: 'test' }
			);

			store.write({ items: [], count: 0 });

			expect(vol.existsSync(mockGroveFolder)).toBe(true);
			expect(vol.existsSync(mockFilePath)).toBe(true);
		});

		it('should apply beforeWrite transform', () => {
			const store = new JsonStore<TestData>(
				() => mockFilePath,
				() => mockGroveFolder,
				getDefaults,
				{
					label: 'test',
					beforeWrite: (data) => ({ ...data, count: data.items.length }),
				}
			);

			store.write({ items: ['a', 'b', 'c'], count: 0 });

			const content = vol.readFileSync(mockFilePath, 'utf-8') as string;
			const parsed = JSON.parse(content);
			expect(parsed.count).toBe(3);
		});

		it('should silently swallow errors when silentWriteErrors is true', () => {
			// Force a write error by providing an unresolvable path
			const store = new JsonStore<TestData>(
				() => '/proc/invalid/path/file.json',
				() => '/proc/invalid/path',
				getDefaults,
				{ label: 'test', silentWriteErrors: true }
			);

			// Should not throw
			expect(() => store.write({ items: [], count: 0 })).not.toThrow();
		});
	});

	describe('update', () => {
		it('should read, mutate, and write data', () => {
			const store = new JsonStore<TestData>(
				() => mockFilePath,
				() => mockGroveFolder,
				getDefaults,
				{ label: 'test' }
			);

			// Initial write
			store.write({ items: ['a'], count: 1 });

			// Update
			const result = store.update((data) => ({
				items: [...data.items, 'b'],
				count: data.count + 1,
			}));

			expect(result).toEqual({ items: ['a', 'b'], count: 2 });

			// Verify persistence
			const content = vol.readFileSync(mockFilePath, 'utf-8') as string;
			const parsed = JSON.parse(content);
			expect(parsed).toEqual({ items: ['a', 'b'], count: 2 });
		});

		it('should work on empty store (reads defaults first)', () => {
			const store = new JsonStore<TestData>(
				() => mockFilePath,
				() => mockGroveFolder,
				getDefaults,
				{ label: 'test' }
			);

			const result = store.update((data) => ({
				...data,
				items: ['first'],
				count: 1,
			}));

			expect(result).toEqual({ items: ['first'], count: 1 });
		});
	});
});

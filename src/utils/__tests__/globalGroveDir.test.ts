import { Volume } from 'memfs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockFs } from '../../__tests__/helpers.js';
import {
	GROVE_GLOBAL_DIR_ENV,
	GlobalGroveDirError,
	ensureGlobalGroveFolder,
	getGlobalGroveFolder,
} from '../globalGroveDir.js';

// Mock filesystem
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

// Mock os.homedir()
vi.mock('os', () => ({
	default: {
		homedir: () => '/home/testuser',
	},
}));

describe('globalGroveDir', () => {
	beforeEach(() => {
		const mockFs = createMockFs();
		vol = mockFs.vol;
		delete process.env[GROVE_GLOBAL_DIR_ENV];
	});

	afterEach(() => {
		vi.clearAllMocks();
		delete process.env[GROVE_GLOBAL_DIR_ENV];
	});

	describe('getGlobalGroveFolder', () => {
		it('defaults to ~/.grove when the env var is not set', () => {
			expect(getGlobalGroveFolder()).toBe('/home/testuser/.grove');
		});

		it('uses GROVE_GLOBAL_DIR when set', () => {
			process.env[GROVE_GLOBAL_DIR_ENV] = '/custom/grove-config';
			expect(getGlobalGroveFolder()).toBe('/custom/grove-config');
		});

		it('resolves a relative GROVE_GLOBAL_DIR to an absolute path', () => {
			process.env[GROVE_GLOBAL_DIR_ENV] = 'relative/dir';
			expect(getGlobalGroveFolder()).toBe(path.resolve('relative/dir'));
		});

		it('ignores a blank/whitespace-only GROVE_GLOBAL_DIR', () => {
			process.env[GROVE_GLOBAL_DIR_ENV] = '   ';
			expect(getGlobalGroveFolder()).toBe('/home/testuser/.grove');
		});
	});

	describe('ensureGlobalGroveFolder', () => {
		it('creates the default folder when missing', () => {
			expect(vol.existsSync('/home/testuser/.grove')).toBe(false);
			const folder = ensureGlobalGroveFolder();
			expect(folder).toBe('/home/testuser/.grove');
			expect(vol.existsSync('/home/testuser/.grove')).toBe(true);
		});

		it('creates the custom folder (recursively) from GROVE_GLOBAL_DIR', () => {
			process.env[GROVE_GLOBAL_DIR_ENV] = '/custom/nested/grove-config';
			const folder = ensureGlobalGroveFolder();
			expect(folder).toBe('/custom/nested/grove-config');
			expect(vol.existsSync('/custom/nested/grove-config')).toBe(true);
		});

		it('is a no-op when the folder already exists', () => {
			vol.mkdirSync('/home/testuser/.grove', { recursive: true });
			expect(() => ensureGlobalGroveFolder()).not.toThrow();
			expect(vol.existsSync('/home/testuser/.grove')).toBe(true);
		});

		it('throws GlobalGroveDirError when the path is a file', () => {
			process.env[GROVE_GLOBAL_DIR_ENV] = '/custom/not-a-dir';
			vol.mkdirSync('/custom', { recursive: true });
			vol.writeFileSync('/custom/not-a-dir', 'i am a file');

			expect(() => ensureGlobalGroveFolder()).toThrow(GlobalGroveDirError);
		});

		it('includes env-var context in the error when GROVE_GLOBAL_DIR is set', () => {
			process.env[GROVE_GLOBAL_DIR_ENV] = '/custom/not-a-dir';
			vol.mkdirSync('/custom', { recursive: true });
			vol.writeFileSync('/custom/not-a-dir', 'i am a file');

			try {
				ensureGlobalGroveFolder();
				expect.fail('expected ensureGlobalGroveFolder to throw');
			} catch (error) {
				expect(error).toBeInstanceOf(GlobalGroveDirError);
				const err = error as GlobalGroveDirError;
				expect(err.fromEnv).toBe(true);
				expect(err.folder).toBe('/custom/not-a-dir');
				expect(err.message).toContain(GROVE_GLOBAL_DIR_ENV);
			}
		});
	});
});

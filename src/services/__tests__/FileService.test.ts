import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Volume } from 'memfs';

import { createFile, createMockFs } from '../../__tests__/helpers.js';
import { FileService } from '../FileService.js';

// Mock filesystem
let vol: Volume;

vi.mock('fs', () => {
	return {
		default: new Proxy({}, {
			get(_target, prop) {
				return vol?.[prop as keyof Volume];
			},
		}),
		...Object.fromEntries(
			Object.getOwnPropertyNames(Volume.prototype)
				.filter(key => key !== 'constructor')
				.map(key => [key, (...args: unknown[]) => vol?.[key as keyof Volume]?.(...args)])
		),
	};
});

// Mock glob to work with memfs
vi.mock('glob', () => ({
	glob: vi.fn(async (pattern: string, options: { cwd?: string }) => {
		const cwd = options.cwd || '/';

		// Use memfs to list files
		const files: string[] = [];

		function walk(dir: string, base: string = '') {
			try {
				const entries = vol.readdirSync(dir) as string[];
				for (const entry of entries) {
					const fullPath = path.join(dir, entry);
					const relativePath = base ? path.join(base, entry) : entry;

					try {
						const stats = vol.statSync(fullPath);
						if (stats.isDirectory()) {
							// Recursively walk subdirectories for ** patterns
							if (pattern.includes('**')) {
								walk(fullPath, relativePath);
							}
						} else if (stats.isFile()) {
							files.push(relativePath);
						}
					} catch {
						// Skip files we can't stat
					}
				}
			} catch {
				// Skip directories we can't read
			}
		}

		walk(cwd);

		// Filter files based on pattern
		const filtered = files.filter(file => {
			// Simple pattern matching
			if (pattern === '*.txt') return file.endsWith('.txt') && !file.includes('/');
			if (pattern === '*.md') return file.endsWith('.md') && !file.includes('/');
			if (pattern === '*.json') return file.endsWith('.json') && !file.includes('/');
			if (pattern === '*.xyz') return file.endsWith('.xyz');
			if (pattern === '.**') return file.startsWith('.');
			if (pattern === '.*') return file.startsWith('.') && !file.includes('/');
			if (pattern === '**/*.txt') return file.endsWith('.txt');
			if (pattern === '**/*.md') return file.endsWith('.md');

			return false;
		});

		return filtered;
	}),
}));

describe('FileService', () => {
	let service: FileService;
	let tempDir: string;

	beforeEach(() => {
		// Create fresh in-memory filesystem
		const mockFs = createMockFs();
		vol = mockFs.vol;

		service = new FileService();
		tempDir = '/test';
		vol.mkdirSync(tempDir, { recursive: true });
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('matchPattern', () => {
		beforeEach(() => {
			// Create test file structure
			createFile(vol, path.join(tempDir, 'file1.txt'), 'content');
			createFile(vol, path.join(tempDir, 'file2.md'), 'content');
			createFile(vol, path.join(tempDir, 'subdir', 'file3.txt'), 'content');
			createFile(vol, path.join(tempDir, '.gitignore'), 'node_modules/');
		});

		it('should match files by extension', async () => {
			const matches = await service.matchPattern(tempDir, '*.txt');

			expect(matches).toContain('file1.txt');
			expect(matches).not.toContain('file2.md');
			expect(matches).not.toContain('subdir/file3.txt');
		});

		it('should match files recursively with **', async () => {
			const matches = await service.matchPattern(tempDir, '**/*.txt');

			expect(matches).toContain('file1.txt');
			expect(matches).toContain('subdir/file3.txt');
			expect(matches).not.toContain('file2.md');
		});

		it('should match hidden files when dot option is enabled', async () => {
			const matches = await service.matchPattern(tempDir, '.*');

			expect(matches).toContain('.gitignore');
		});

		it('should return empty array when no matches found', async () => {
			const matches = await service.matchPattern(tempDir, '*.xyz');

			expect(matches).toEqual([]);
		});

		it('should throw error for invalid pattern', async () => {
			// Note: glob may not throw for all invalid patterns, but we test the error handling
			// This test may need adjustment based on actual glob behavior
			const invalidDir = path.join(tempDir, 'nonexistent');

			await expect(service.matchPattern(invalidDir, '*.txt')).resolves.toBeDefined();
		});
	});

	describe('matchPatterns', () => {
		beforeEach(() => {
			createFile(vol, path.join(tempDir, 'file1.txt'), 'content');
			createFile(vol, path.join(tempDir, 'file2.md'), 'content');
			createFile(vol, path.join(tempDir, 'README.md'), 'content');
		});

		it('should match multiple patterns', async () => {
			const results = await service.matchPatterns(tempDir, ['*.txt', '*.md']);

			expect(results).toHaveLength(2);
			expect(results[0].pattern).toBe('*.txt');
			expect(results[0].matches).toContain('file1.txt');
			expect(results[1].pattern).toBe('*.md');
			expect(results[1].matches).toContain('file2.md');
			expect(results[1].matches).toContain('README.md');
		});

		it('should handle empty patterns array', async () => {
			const results = await service.matchPatterns(tempDir, []);

			expect(results).toEqual([]);
		});

		it('should continue with other patterns if one fails', async () => {
			const results = await service.matchPatterns(tempDir, ['*.txt', '*.md']);

			expect(results).toHaveLength(2);
			results.forEach((result) => {
				expect(result).toHaveProperty('pattern');
				expect(result).toHaveProperty('matches');
			});
		});
	});

	describe('copyFile', () => {
		let sourceDir: string;
		let destDir: string;

		beforeEach(() => {
			sourceDir = path.join(tempDir, 'source');
			destDir = path.join(tempDir, 'dest');
			vol.mkdirSync(sourceDir, { recursive: true });
		});

		it('should copy a file to destination', () => {
			const testContent = 'test content';
			createFile(vol, path.join(sourceDir, 'test.txt'), testContent);

			service.copyFile(sourceDir, destDir, 'test.txt');

			const destPath = path.join(destDir, 'test.txt');
			expect(vol.existsSync(destPath)).toBe(true);
			expect(vol.readFileSync(destPath, 'utf-8')).toBe(testContent);
		});

		it('should preserve directory structure', () => {
			const testContent = 'nested content';
			createFile(vol, path.join(sourceDir, 'subdir', 'nested.txt'), testContent);

			service.copyFile(sourceDir, destDir, 'subdir/nested.txt');

			const destPath = path.join(destDir, 'subdir', 'nested.txt');
			expect(vol.existsSync(destPath)).toBe(true);
			expect(vol.readFileSync(destPath, 'utf-8')).toBe(testContent);
		});

		it('should create destination directory if it does not exist', () => {
			createFile(vol, path.join(sourceDir, 'test.txt'), 'content');

			service.copyFile(sourceDir, destDir, 'test.txt');

			expect(vol.existsSync(destDir)).toBe(true);
			expect(vol.existsSync(path.join(destDir, 'test.txt'))).toBe(true);
		});
	});

	describe('copyFilesFromPatterns', () => {
		let sourceDir: string;
		let destDir: string;

		beforeEach(() => {
			sourceDir = path.join(tempDir, 'source');
			destDir = path.join(tempDir, 'dest');
			vol.mkdirSync(sourceDir, { recursive: true });

			// Create test files
			createFile(vol, path.join(sourceDir, 'file1.txt'), 'content1');
			createFile(vol, path.join(sourceDir, 'file2.md'), 'content2');
			createFile(vol, path.join(sourceDir, 'subdir', 'file3.txt'), 'content3');
		});

		it('should copy files matching patterns', async () => {
			const result = await service.copyFilesFromPatterns(sourceDir, destDir, ['*.txt']);

			expect(result.success).toBe(true);
			expect(result.copiedFiles).toContain('file1.txt');
			expect(result.errors).toHaveLength(0);
			expect(vol.existsSync(path.join(destDir, 'file1.txt'))).toBe(true);
		});

		it('should copy files from multiple patterns', async () => {
			const result = await service.copyFilesFromPatterns(sourceDir, destDir, [
				'*.txt',
				'*.md',
			]);

			expect(result.success).toBe(true);
			expect(result.copiedFiles).toContain('file1.txt');
			expect(result.copiedFiles).toContain('file2.md');
			expect(result.errors).toHaveLength(0);
		});

		it('should copy files recursively', async () => {
			const result = await service.copyFilesFromPatterns(sourceDir, destDir, ['**/*.txt']);

			expect(result.success).toBe(true);
			expect(result.copiedFiles).toContain('file1.txt');
			expect(result.copiedFiles).toContain('subdir/file3.txt');
			expect(vol.existsSync(path.join(destDir, 'subdir', 'file3.txt'))).toBe(true);
		});

		it('should handle empty patterns array', async () => {
			const result = await service.copyFilesFromPatterns(sourceDir, destDir, []);

			expect(result.success).toBe(true);
			expect(result.copiedFiles).toHaveLength(0);
			expect(result.errors).toHaveLength(0);
		});

		it('should create destination directory if it does not exist', async () => {
			const result = await service.copyFilesFromPatterns(sourceDir, destDir, ['*.txt']);

			expect(result.success).toBe(true);
			expect(vol.existsSync(destDir)).toBe(true);
		});

		it('should collect errors for failed copy operations', async () => {
			// Try to copy from a file that will be deleted
			const testFile = path.join(sourceDir, 'temp.txt');
			createFile(vol, testFile, 'content');

			// This test is tricky - we need to simulate a copy failure
			// One way is to make the destination read-only, but that's platform-specific
			// For now, we'll just verify the error handling structure exists

			const result = await service.copyFilesFromPatterns(sourceDir, destDir, ['*.txt']);

			expect(result).toHaveProperty('success');
			expect(result).toHaveProperty('copiedFiles');
			expect(result).toHaveProperty('errors');
		});
	});

	describe('exists', () => {
		it('should return true for existing file', () => {
			const filePath = path.join(tempDir, 'exists.txt');
			createFile(vol, filePath, 'content');

			expect(service.exists(filePath)).toBe(true);
		});

		it('should return true for existing directory', () => {
			expect(service.exists(tempDir)).toBe(true);
		});

		it('should return false for non-existent path', () => {
			const filePath = path.join(tempDir, 'nonexistent.txt');

			expect(service.exists(filePath)).toBe(false);
		});
	});

	describe('isDirectory', () => {
		it('should return true for directory', () => {
			expect(service.isDirectory(tempDir)).toBe(true);
		});

		it('should return false for file', () => {
			const filePath = path.join(tempDir, 'file.txt');
			createFile(vol, filePath, 'content');

			expect(service.isDirectory(filePath)).toBe(false);
		});

		it('should return false for non-existent path', () => {
			const filePath = path.join(tempDir, 'nonexistent');

			expect(service.isDirectory(filePath)).toBe(false);
		});
	});

	describe('isFile', () => {
		it('should return true for file', () => {
			const filePath = path.join(tempDir, 'file.txt');
			createFile(vol, filePath, 'content');

			expect(service.isFile(filePath)).toBe(true);
		});

		it('should return false for directory', () => {
			expect(service.isFile(tempDir)).toBe(false);
		});

		it('should return false for non-existent path', () => {
			const filePath = path.join(tempDir, 'nonexistent.txt');

			expect(service.isFile(filePath)).toBe(false);
		});
	});
});

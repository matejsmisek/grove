import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cleanupTempDir, createTempDir, fileExists, readFile } from '../../__tests__/helpers.js';
import { ContextService } from '../ContextService.js';
import type { ContextData } from '../interfaces.js';

describe('ContextService', () => {
	let service: ContextService;
	let tempDir: string;

	beforeEach(() => {
		service = new ContextService();
		tempDir = createTempDir();
	});

	afterEach(() => {
		cleanupTempDir(tempDir);
	});

	describe('generateContent', () => {
		it('should generate markdown content with all fields', () => {
			const data: ContextData = {
				name: 'Test Grove',
				createdAt: '2024-01-01T00:00:00Z',
				repositories: [
					{ name: 'repo1', path: '/path/to/repo1', registeredAt: '2024-01-01T00:00:00Z' },
					{ name: 'repo2', path: '/path/to/repo2', registeredAt: '2024-01-01T00:00:00Z' },
				],
				purpose: 'Testing purposes',
				notes: 'Some test notes',
			};

			const content = service.generateContent(data);

			expect(content).toContain('# Test Grove');
			expect(content).toContain('Created: 2024-01-01T00:00:00Z');
			expect(content).toContain('Testing purposes');
			expect(content).toContain('Some test notes');
			expect(content).toContain('- repo1: /path/to/repo1');
			expect(content).toContain('- repo2: /path/to/repo2');
		});

		it('should use default placeholder for missing purpose', () => {
			const data: ContextData = {
				name: 'Test Grove',
				createdAt: '2024-01-01T00:00:00Z',
				repositories: [],
			};

			const content = service.generateContent(data);

			expect(content).toContain("[Add description of what you're working on in this grove]");
		});

		it('should use default placeholder for missing notes', () => {
			const data: ContextData = {
				name: 'Test Grove',
				createdAt: '2024-01-01T00:00:00Z',
				repositories: [],
			};

			const content = service.generateContent(data);

			expect(content).toContain('[Add any additional notes or context here]');
		});

		it('should handle empty repository list', () => {
			const data: ContextData = {
				name: 'Test Grove',
				createdAt: '2024-01-01T00:00:00Z',
				repositories: [],
			};

			const content = service.generateContent(data);

			expect(content).toContain('## Repositories');
			// Should still have the section but with no items
		});
	});

	describe('createContextFile', () => {
		it('should create CONTEXT.md file with correct content', () => {
			const data: ContextData = {
				name: 'Test Grove',
				createdAt: '2024-01-01T00:00:00Z',
				repositories: [
					{ name: 'repo1', path: '/path/to/repo1', registeredAt: '2024-01-01T00:00:00Z' },
				],
				purpose: 'Testing',
				notes: 'Test notes',
			};

			service.createContextFile(tempDir, data);

			const contextPath = service.getContextFilePath(tempDir);
			expect(fileExists(contextPath)).toBe(true);

			const content = readFile(contextPath);
			expect(content).toContain('# Test Grove');
			expect(content).toContain('Testing');
		});
	});

	describe('contextFileExists', () => {
		it('should return true when CONTEXT.md exists', () => {
			const data: ContextData = {
				name: 'Test Grove',
				createdAt: '2024-01-01T00:00:00Z',
				repositories: [],
			};

			service.createContextFile(tempDir, data);

			expect(service.contextFileExists(tempDir)).toBe(true);
		});

		it('should return false when CONTEXT.md does not exist', () => {
			expect(service.contextFileExists(tempDir)).toBe(false);
		});
	});

	describe('readContextFile', () => {
		it('should read existing CONTEXT.md file', () => {
			const data: ContextData = {
				name: 'Test Grove',
				createdAt: '2024-01-01T00:00:00Z',
				repositories: [],
				purpose: 'Test purpose',
			};

			service.createContextFile(tempDir, data);

			const content = service.readContextFile(tempDir);

			expect(content).not.toBeNull();
			expect(content).toContain('# Test Grove');
			expect(content).toContain('Test purpose');
		});

		it('should return null when CONTEXT.md does not exist', () => {
			const content = service.readContextFile(tempDir);

			expect(content).toBeNull();
		});
	});

	describe('getContextFilePath', () => {
		it('should return correct path to CONTEXT.md', () => {
			const contextPath = service.getContextFilePath(tempDir);

			expect(contextPath).toContain(tempDir);
			expect(contextPath).toMatch(/CONTEXT\.md$/);
		});
	});
});

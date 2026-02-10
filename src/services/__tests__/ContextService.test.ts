import { Volume } from 'memfs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockFs } from '../../__tests__/helpers.js';
import { ContextService } from '../ContextService.js';
import type { ContextData } from '../types.js';

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

describe('ContextService', () => {
	let service: ContextService;
	let tempDir: string;

	beforeEach(() => {
		// Create fresh in-memory filesystem
		const mockFs = createMockFs();
		vol = mockFs.vol;

		service = new ContextService();
		tempDir = '/test';
		vol.mkdirSync(tempDir, { recursive: true });
	});

	afterEach(() => {
		vi.clearAllMocks();
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
				repositories: [{ name: 'repo1', path: '/path/to/repo1', registeredAt: '2024-01-01T00:00:00Z' }],
				purpose: 'Testing',
				notes: 'Test notes',
			};

			service.createContextFile(tempDir, data);

			const contextPath = service.getContextFilePath(tempDir);
			expect(vol.existsSync(contextPath)).toBe(true);

			const content = vol.readFileSync(contextPath, 'utf-8') as string;
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

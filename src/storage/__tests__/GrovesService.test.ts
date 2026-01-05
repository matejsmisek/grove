import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Volume } from 'memfs';

import { createMockFs, setupMockHomeDir } from '../../__tests__/helpers.js';
import { GrovesService } from '../GrovesService.js';
import { SettingsService } from '../SettingsService.js';
import type { GroveMetadata, GroveReference } from '../types.js';

// Mock filesystem and os modules
let vol: Volume;
let mockHomeDir: string;

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

vi.mock('os', () => ({
	default: {
		homedir: () => mockHomeDir,
	},
	homedir: () => mockHomeDir,
}));

describe('GrovesService', () => {
	let service: GrovesService;
	let settingsService: SettingsService;
	let mockGroveFolder: string;

	beforeEach(() => {
		// Create fresh in-memory filesystem
		const mockFs = createMockFs();
		vol = mockFs.vol;

		// Setup mock home directory
		mockHomeDir = '/home/testuser';
		setupMockHomeDir(vol, mockHomeDir);
		mockGroveFolder = path.join(mockHomeDir, '.grove');

		settingsService = new SettingsService();
		settingsService.initializeStorage();

		service = new GrovesService(settingsService);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('addGroveToIndex', () => {
		it('should add a grove reference to the index', () => {
			const groveRef: GroveReference = {
				id: 'test-grove-1',
				name: 'Test Grove',
				path: '/path/to/grove',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			service.addGroveToIndex(groveRef);

			const allGroves = service.getAllGroves();
			expect(allGroves).toHaveLength(1);
			expect(allGroves[0].id).toBe('test-grove-1');
		});
	});

	describe('getAllGroves', () => {
		it('should return empty array when no groves', () => {
			const groves = service.getAllGroves();

			expect(groves).toEqual([]);
		});

		it('should return all groves from index', () => {
			const groveRef1: GroveReference = {
				id: 'grove-1',
				name: 'Grove 1',
				path: '/path/to/grove1',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			const groveRef2: GroveReference = {
				id: 'grove-2',
				name: 'Grove 2',
				path: '/path/to/grove2',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			service.addGroveToIndex(groveRef1);
			service.addGroveToIndex(groveRef2);

			const groves = service.getAllGroves();
			expect(groves).toHaveLength(2);
		});
	});

	describe('getGroveById', () => {
		it('should return grove by ID', () => {
			const groveRef: GroveReference = {
				id: 'test-grove',
				name: 'Test Grove',
				path: '/path/to/grove',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			service.addGroveToIndex(groveRef);

			const found = service.getGroveById('test-grove');

			expect(found).not.toBeNull();
			expect(found?.id).toBe('test-grove');
		});

		it('should return null if grove not found', () => {
			const found = service.getGroveById('nonexistent');

			expect(found).toBeNull();
		});
	});

	describe('removeGroveFromIndex', () => {
		it('should remove grove from index', () => {
			const groveRef: GroveReference = {
				id: 'test-grove',
				name: 'Test Grove',
				path: '/path/to/grove',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			service.addGroveToIndex(groveRef);

			const removed = service.removeGroveFromIndex('test-grove');

			expect(removed).not.toBeNull();
			expect(removed?.id).toBe('test-grove');

			const groves = service.getAllGroves();
			expect(groves).toHaveLength(0);
		});

		it('should return null if grove not found', () => {
			const removed = service.removeGroveFromIndex('nonexistent');

			expect(removed).toBeNull();
		});
	});

	describe('updateGroveInIndex', () => {
		it('should update grove name in index', () => {
			const groveRef: GroveReference = {
				id: 'test-grove',
				name: 'Old Name',
				path: '/path/to/grove',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			service.addGroveToIndex(groveRef);

			const updated = service.updateGroveInIndex('test-grove', { name: 'New Name' });

			expect(updated).toBe(true);

			const found = service.getGroveById('test-grove');
			expect(found?.name).toBe('New Name');
		});

		it('should update grove updatedAt timestamp', () => {
			const groveRef: GroveReference = {
				id: 'test-grove',
				name: 'Test Grove',
				path: '/path/to/grove',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			service.addGroveToIndex(groveRef);

			const newTimestamp = new Date().toISOString();
			const updated = service.updateGroveInIndex('test-grove', { updatedAt: newTimestamp });

			expect(updated).toBe(true);

			const found = service.getGroveById('test-grove');
			expect(found?.updatedAt).toBe(newTimestamp);
		});

		it('should return false if grove not found', () => {
			const updated = service.updateGroveInIndex('nonexistent', { name: 'New Name' });

			expect(updated).toBe(false);
		});
	});

	describe('readGroveMetadata', () => {
		it('should return null if metadata file does not exist', () => {
			const grovePath = '/grove-folder';
			vol.mkdirSync(grovePath, { recursive: true });

			const metadata = service.readGroveMetadata(grovePath);

			expect(metadata).toBeNull();
		});

		it('should read metadata from grove.json', () => {
			const grovePath = '/grove-folder';
			vol.mkdirSync(grovePath, { recursive: true });

			const testMetadata: GroveMetadata = {
				id: 'test-grove',
				name: 'Test Grove',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				worktrees: [],
			};

			vol.writeFileSync(
				path.join(grovePath, 'grove.json'),
				JSON.stringify(testMetadata, null, '\t'),
			);

			const metadata = service.readGroveMetadata(grovePath);

			expect(metadata).not.toBeNull();
			expect(metadata?.id).toBe('test-grove');
		});

		it('should return null on parse error', () => {
			const grovePath = '/grove-folder';
			vol.mkdirSync(grovePath, { recursive: true });

			vol.writeFileSync(path.join(grovePath, 'grove.json'), 'invalid json {');

			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			const metadata = service.readGroveMetadata(grovePath);

			expect(metadata).toBeNull();
			expect(consoleErrorSpy).toHaveBeenCalled();

			consoleErrorSpy.mockRestore();
		});
	});

	describe('writeGroveMetadata', () => {
		it('should write metadata to grove.json', () => {
			const grovePath = '/grove-folder';
			vol.mkdirSync(grovePath, { recursive: true });

			const metadata: GroveMetadata = {
				id: 'test-grove',
				name: 'Test Grove',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				worktrees: [],
			};

			service.writeGroveMetadata(grovePath, metadata);

			const metadataPath = path.join(grovePath, 'grove.json');
			expect(vol.existsSync(metadataPath)).toBe(true);

			const content = vol.readFileSync(metadataPath, 'utf-8');
			const parsed = JSON.parse(content as string);
			expect(parsed.id).toBe('test-grove');
		});

		it('should update updatedAt timestamp automatically', () => {
			const grovePath = '/grove-folder';
			vol.mkdirSync(grovePath, { recursive: true });

			const metadata: GroveMetadata = {
				id: 'test-grove',
				name: 'Test Grove',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				worktrees: [],
			};

			service.writeGroveMetadata(grovePath, metadata);

			const saved = service.readGroveMetadata(grovePath);
			expect(saved?.updatedAt).toBeDefined();
		});

		it('should update grove in index', () => {
			const grovePath = '/grove-folder';
			vol.mkdirSync(grovePath, { recursive: true });

			const groveRef: GroveReference = {
				id: 'test-grove',
				name: 'Old Name',
				path: grovePath,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			service.addGroveToIndex(groveRef);

			const metadata: GroveMetadata = {
				id: 'test-grove',
				name: 'New Name',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				worktrees: [],
			};

			service.writeGroveMetadata(grovePath, metadata);

			const found = service.getGroveById('test-grove');
			expect(found?.name).toBe('New Name');
		});
	});

	describe('addWorktreeToGrove', () => {
		it('should add worktree to grove metadata', () => {
			const grovePath = '/grove-folder';
			vol.mkdirSync(grovePath, { recursive: true });

			const metadata: GroveMetadata = {
				id: 'test-grove',
				name: 'Test Grove',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				worktrees: [],
			};

			service.writeGroveMetadata(grovePath, metadata);

			const worktree = service.addWorktreeToGrove(
				grovePath,
				'repo1',
				'/path/to/repo1',
				'feature-branch',
			);

			expect(worktree.repositoryName).toBe('repo1');
			expect(worktree.branch).toBe('feature-branch');

			const savedMetadata = service.readGroveMetadata(grovePath);
			expect(savedMetadata?.worktrees).toHaveLength(1);
		});

		it('should throw error if metadata not found', () => {
			const grovePath = '/nonexistent-grove';

			expect(() =>
				service.addWorktreeToGrove(grovePath, 'repo1', '/path/to/repo1', 'main'),
			).toThrow('Grove metadata not found');
		});

		it('should generate correct worktree path', () => {
			const grovePath = '/grove-folder';
			vol.mkdirSync(grovePath, { recursive: true });

			const metadata: GroveMetadata = {
				id: 'test-grove',
				name: 'Test Grove',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				worktrees: [],
			};

			service.writeGroveMetadata(grovePath, metadata);

			const worktree = service.addWorktreeToGrove(
				grovePath,
				'my-repo',
				'/path/to/my-repo',
				'main',
			);

			expect(worktree.worktreePath).toBe(path.join(grovePath, 'my-repo.worktree'));
		});
	});

	describe('deleteGrove', () => {
		it('should delete grove from index without deleting folder', () => {
			const grovePath = '/grove-folder';
			vol.mkdirSync(grovePath, { recursive: true });

			const groveRef: GroveReference = {
				id: 'test-grove',
				name: 'Test Grove',
				path: grovePath,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			service.addGroveToIndex(groveRef);

			const deleted = service.deleteGrove('test-grove', false);

			expect(deleted).toBe(true);
			expect(service.getGroveById('test-grove')).toBeNull();
			expect(vol.existsSync(grovePath)).toBe(true); // Folder should still exist
		});

		it('should delete grove from index and delete folder', () => {
			const grovePath = '/grove-folder';
			vol.mkdirSync(grovePath, { recursive: true });

			const groveRef: GroveReference = {
				id: 'test-grove',
				name: 'Test Grove',
				path: grovePath,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			service.addGroveToIndex(groveRef);

			const deleted = service.deleteGrove('test-grove', true);

			expect(deleted).toBe(true);
			expect(service.getGroveById('test-grove')).toBeNull();
			expect(vol.existsSync(grovePath)).toBe(false); // Folder should be deleted
		});

		it('should return false if grove not found', () => {
			const deleted = service.deleteGrove('nonexistent', true);

			expect(deleted).toBe(false);
		});
	});
});

import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Volume } from 'memfs';

import { createMockFs, setupMockHomeDir } from '../../__tests__/helpers.js';
import { RepositoryService } from '../RepositoryService.js';
import { SettingsService } from '../SettingsService.js';

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

describe('RepositoryService', () => {
	let service: RepositoryService;
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

		service = new RepositoryService(settingsService);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('getDefaultRepositories', () => {
		it('should return empty repositories array', () => {
			const defaults = service.getDefaultRepositories();

			expect(defaults).toEqual({ repositories: [] });
		});
	});

	describe('readRepositories', () => {
		it('should return empty repositories if file does not exist', () => {
			const data = service.readRepositories();

			expect(data.repositories).toEqual([]);
		});

		it('should read repositories from file', () => {
			const testRepos = {
				repositories: [
					{
						path: '/test/repo1',
						name: 'repo1',
						registeredAt: '2024-01-01T00:00:00Z',
					},
				],
			};

			service.writeRepositories(testRepos);
			const data = service.readRepositories();

			expect(data.repositories).toHaveLength(1);
			expect(data.repositories[0].path).toBe('/test/repo1');
		});

		it('should return defaults on parse error', () => {
			// Write invalid JSON
			const repositoriesPath = path.join(mockGroveFolder, 'repositories.json');
			vol.writeFileSync(repositoriesPath, 'invalid json {');

			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			const data = service.readRepositories();

			expect(data).toEqual(service.getDefaultRepositories());
			expect(consoleErrorSpy).toHaveBeenCalled();

			consoleErrorSpy.mockRestore();
		});
	});

	describe('writeRepositories', () => {
		it('should write repositories to file', () => {
			const testRepos = {
				repositories: [
					{
						path: '/test/repo1',
						name: 'repo1',
						registeredAt: '2024-01-01T00:00:00Z',
					},
				],
			};

			service.writeRepositories(testRepos);

			const repositoriesPath = path.join(mockGroveFolder, 'repositories.json');
			expect(vol.existsSync(repositoriesPath)).toBe(true);

			const content = vol.readFileSync(repositoriesPath, 'utf-8');
			const parsed = JSON.parse(content as string);
			expect(parsed.repositories).toHaveLength(1);
		});

		it('should create .grove folder if it does not exist', () => {
			// Remove the grove folder
			vol.rmdirSync(mockGroveFolder, { recursive: true });

			const testRepos = {
				repositories: [],
			};

			service.writeRepositories(testRepos);

			expect(vol.existsSync(mockGroveFolder)).toBe(true);
		});
	});

	describe('isRepositoryRegistered', () => {
		it('should return false for unregistered repository', () => {
			const isRegistered = service.isRepositoryRegistered('/test/unregistered');

			expect(isRegistered).toBe(false);
		});

		it('should return true for registered repository', () => {
			service.addRepository('/test/repo1');

			const isRegistered = service.isRepositoryRegistered('/test/repo1');

			expect(isRegistered).toBe(true);
		});
	});

	describe('addRepository', () => {
		it('should add a new repository', () => {
			const repo = service.addRepository('/test/myrepo');

			expect(repo.path).toBe('/test/myrepo');
			expect(repo.name).toBe('myrepo');
			expect(repo.registeredAt).toBeDefined();

			const all = service.getAllRepositories();
			expect(all).toHaveLength(1);
		});

		it('should throw error if repository already registered', () => {
			service.addRepository('/test/repo1');

			expect(() => service.addRepository('/test/repo1')).toThrow(
				'Repository already registered',
			);
		});

		it('should extract repository name from path', () => {
			const repo = service.addRepository('/path/to/my-project');

			expect(repo.name).toBe('my-project');
		});

		it('should set registeredAt timestamp', () => {
			const repo = service.addRepository('/test/repo1');

			expect(repo.registeredAt).toBeDefined();
			const date = new Date(repo.registeredAt);
			expect(date).toBeInstanceOf(Date);
			expect(date.getTime()).not.toBeNaN();
		});
	});

	describe('removeRepository', () => {
		it('should remove a registered repository', () => {
			service.addRepository('/test/repo1');

			const removed = service.removeRepository('/test/repo1');

			expect(removed).toBe(true);
			expect(service.getAllRepositories()).toHaveLength(0);
		});

		it('should return false if repository not found', () => {
			const removed = service.removeRepository('/test/nonexistent');

			expect(removed).toBe(false);
		});

		it('should not affect other repositories', () => {
			service.addRepository('/test/repo1');
			service.addRepository('/test/repo2');

			service.removeRepository('/test/repo1');

			const all = service.getAllRepositories();
			expect(all).toHaveLength(1);
			expect(all[0].path).toBe('/test/repo2');
		});
	});

	describe('getAllRepositories', () => {
		it('should return empty array when no repositories', () => {
			const all = service.getAllRepositories();

			expect(all).toEqual([]);
		});

		it('should return all registered repositories', () => {
			service.addRepository('/test/repo1');
			service.addRepository('/test/repo2');

			const all = service.getAllRepositories();

			expect(all).toHaveLength(2);
			expect(all[0].path).toBe('/test/repo1');
			expect(all[1].path).toBe('/test/repo2');
		});
	});

	describe('updateRepository', () => {
		it('should update repository properties', () => {
			service.addRepository('/test/repo1');

			const updated = service.updateRepository('/test/repo1', { isMonorepo: true });

			expect(updated).not.toBeNull();
			expect(updated?.isMonorepo).toBe(true);

			const all = service.getAllRepositories();
			expect(all[0].isMonorepo).toBe(true);
		});

		it('should return null if repository not found', () => {
			const updated = service.updateRepository('/test/nonexistent', { isMonorepo: true });

			expect(updated).toBeNull();
		});

		it('should preserve other properties when updating', () => {
			const repo = service.addRepository('/test/repo1');
			const originalName = repo.name;
			const originalRegisteredAt = repo.registeredAt;

			const updated = service.updateRepository('/test/repo1', { isMonorepo: true });

			expect(updated?.name).toBe(originalName);
			expect(updated?.registeredAt).toBe(originalRegisteredAt);
			expect(updated?.path).toBe('/test/repo1');
		});
	});
});

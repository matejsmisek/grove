import { Volume } from 'memfs';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockFs, setupMockHomeDir } from '../../__tests__/helpers.js';
import { RecentSelectionsService } from '../RecentSelectionsService.js';
import { SettingsService } from '../SettingsService.js';
import type { RecentSelection, Repository, RepositorySelection } from '../types.js';

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

function makeRepo(repoPath: string, name: string): Repository {
	return {
		path: repoPath,
		name,
		registeredAt: new Date().toISOString(),
	};
}

function makeSelection(repo: Repository, projectPath?: string): RepositorySelection {
	return { repository: repo, projectPath };
}

describe('RecentSelectionsService', () => {
	let service: RecentSelectionsService;
	let settingsService: SettingsService;
	let mockGroveFolder: string;

	beforeEach(() => {
		const mockFs = createMockFs();
		vol = mockFs.vol;

		mockHomeDir = '/home/testuser';
		setupMockHomeDir(vol, mockHomeDir);
		mockGroveFolder = path.join(mockHomeDir, '.grove');

		settingsService = new SettingsService();
		settingsService.initializeStorage();

		service = new RecentSelectionsService(settingsService);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('getRecentSelections', () => {
		it('should return empty array when no recent selections exist', () => {
			const result = service.getRecentSelections(new Set(['/repo1']));
			expect(result).toEqual([]);
		});

		it('should return empty array when recent.json does not exist', () => {
			const result = service.getRecentSelections(new Set());
			expect(result).toEqual([]);
		});

		it('should filter to only registered repositories', () => {
			const repo1 = makeRepo('/repo1', 'repo1');
			const repo2 = makeRepo('/repo2', 'repo2');

			service.addRecentSelections([makeSelection(repo1), makeSelection(repo2)]);

			// Only /repo1 is registered
			const result = service.getRecentSelections(new Set(['/repo1']));
			expect(result).toHaveLength(1);
			expect(result[0].repositoryPath).toBe('/repo1');
		});

		it('should return selections for all registered repos', () => {
			const repo1 = makeRepo('/repo1', 'repo1');
			const repo2 = makeRepo('/repo2', 'repo2');

			service.addRecentSelections([makeSelection(repo1), makeSelection(repo2)]);

			const result = service.getRecentSelections(new Set(['/repo1', '/repo2']));
			expect(result).toHaveLength(2);
		});

		it('should handle corrupt recent.json gracefully', () => {
			const recentPath = path.join(mockGroveFolder, 'recent.json');
			vol.writeFileSync(recentPath, 'invalid json');

			const result = service.getRecentSelections(new Set(['/repo1']));
			expect(result).toEqual([]);
		});
	});

	describe('addRecentSelections', () => {
		it('should add selections to recent history', () => {
			const repo = makeRepo('/repo1', 'repo1');
			service.addRecentSelections([makeSelection(repo)]);

			const result = service.getRecentSelections(new Set(['/repo1']));
			expect(result).toHaveLength(1);
			expect(result[0].repositoryPath).toBe('/repo1');
			expect(result[0].repositoryName).toBe('repo1');
		});

		it('should store project path for monorepo selections', () => {
			const repo = makeRepo('/monorepo', 'monorepo');
			service.addRecentSelections([makeSelection(repo, 'packages/core')]);

			const result = service.getRecentSelections(new Set(['/monorepo']));
			expect(result).toHaveLength(1);
			expect(result[0].projectPath).toBe('packages/core');
		});

		it('should deduplicate selections by repository+project', () => {
			const repo = makeRepo('/repo1', 'repo1');

			service.addRecentSelections([makeSelection(repo)]);
			service.addRecentSelections([makeSelection(repo)]);

			const result = service.getRecentSelections(new Set(['/repo1']));
			expect(result).toHaveLength(1);
		});

		it('should treat different projects from same repo as separate entries', () => {
			const repo = makeRepo('/monorepo', 'monorepo');

			service.addRecentSelections([
				makeSelection(repo, 'packages/core'),
				makeSelection(repo, 'packages/ui'),
			]);

			const result = service.getRecentSelections(new Set(['/monorepo']));
			expect(result).toHaveLength(2);
		});

		it('should limit to 3 most recent selections', () => {
			const repos = Array.from({ length: 5 }, (_, i) => makeRepo(`/repo${i}`, `repo${i}`));

			// Add one at a time with advancing fake timers to ensure ordering
			vi.useFakeTimers();
			vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));

			for (let i = 0; i < repos.length; i++) {
				vi.setSystemTime(new Date(`2025-01-01T00:0${i}:00Z`));
				service.addRecentSelections([makeSelection(repos[i])]);
			}

			vi.useRealTimers();

			const allPaths = new Set(repos.map((r) => r.path));
			const result = service.getRecentSelections(allPaths);
			expect(result).toHaveLength(3);

			// Most recent should be first
			expect(result[0].repositoryPath).toBe('/repo4');
			expect(result[1].repositoryPath).toBe('/repo3');
			expect(result[2].repositoryPath).toBe('/repo2');
		});

		it('should update timestamp when re-adding existing selection', () => {
			vi.useFakeTimers();

			const repo1 = makeRepo('/repo1', 'repo1');
			const repo2 = makeRepo('/repo2', 'repo2');

			vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
			service.addRecentSelections([makeSelection(repo1)]);

			vi.setSystemTime(new Date('2025-01-01T00:01:00Z'));
			service.addRecentSelections([makeSelection(repo2)]);

			// Re-add repo1 at a later time - should move it to top
			vi.setSystemTime(new Date('2025-01-01T00:02:00Z'));
			service.addRecentSelections([makeSelection(repo1)]);

			vi.useRealTimers();

			const result = service.getRecentSelections(new Set(['/repo1', '/repo2']));
			expect(result[0].repositoryPath).toBe('/repo1');
			expect(result[1].repositoryPath).toBe('/repo2');
		});

		it('should persist to recent.json file', () => {
			const repo = makeRepo('/repo1', 'repo1');
			service.addRecentSelections([makeSelection(repo)]);

			const recentPath = path.join(mockGroveFolder, 'recent.json');
			expect(vol.existsSync(recentPath)).toBe(true);

			const data = JSON.parse(vol.readFileSync(recentPath, 'utf-8') as string);
			expect(data.selections).toHaveLength(1);
			expect(data.selections[0].repositoryPath).toBe('/repo1');
		});
	});

	describe('getRecentSelectionDisplayName', () => {
		it('should return repository name for non-monorepo selection', () => {
			const selection: RecentSelection = {
				repositoryPath: '/repo1',
				repositoryName: 'my-repo',
				lastUsedAt: new Date().toISOString(),
			};

			expect(service.getRecentSelectionDisplayName(selection)).toBe('my-repo');
		});

		it('should return "repoName.projectPath" for monorepo selection', () => {
			const selection: RecentSelection = {
				repositoryPath: '/monorepo',
				repositoryName: 'my-monorepo',
				projectPath: 'packages/core',
				lastUsedAt: new Date().toISOString(),
			};

			expect(service.getRecentSelectionDisplayName(selection)).toBe('my-monorepo.packages/core');
		});
	});
});

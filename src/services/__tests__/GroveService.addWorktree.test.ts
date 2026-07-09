import { Volume } from 'memfs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockFs } from '../../__tests__/helpers.js';
import type { IGroveConfigService } from '../../storage/GroveConfigService.js';
import type { IGrovesService } from '../../storage/GrovesService.js';
import type { ISettingsService } from '../../storage/SettingsService.js';
import type {
	GroveMetadata,
	GroveReference,
	RepositorySelection,
	Worktree,
} from '../../storage/types.js';
import type { IContextService } from '../ContextService.js';
import type { IFileService } from '../FileService.js';
import type { IGitService } from '../GitService.js';
import { GroveService } from '../GroveService.js';
import { WorktreeSetupService } from '../WorktreeSetupService.js';

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

function createMockMetadata(worktrees: Worktree[] = []): GroveMetadata {
	return {
		id: 'grove-1',
		name: 'Test Grove',
		identifier: 'abcde',
		worktrees,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};
}

function createMockGroveRef(): GroveReference {
	return {
		id: 'grove-1',
		name: 'Test Grove',
		path: '/groves/test-grove',
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};
}

function createSelection(): RepositorySelection {
	return {
		repository: {
			path: '/repos/test-repo',
			name: 'test-repo',
			registeredAt: new Date().toISOString(),
		},
	};
}

describe('GroveService.addWorktreeToGrove', () => {
	let service: GroveService;
	let mockSettingsService: ISettingsService;
	let mockGrovesService: IGrovesService;
	let mockGroveConfigService: IGroveConfigService;
	let mockGitService: IGitService;
	let mockContextService: IContextService;
	let mockFileService: IFileService;

	beforeEach(() => {
		const mockFs = createMockFs();
		vol = mockFs.vol;

		mockSettingsService = {
			getStorageConfig: vi.fn(),
			getDefaultSettings: vi.fn(),
			initializeStorage: vi.fn(),
			readSettings: vi.fn().mockReturnValue({ workingFolder: '/groves' }),
			writeSettings: vi.fn(),
			updateSettings: vi.fn(),
		};

		mockGrovesService = {
			addGroveToIndex: vi.fn(),
			removeGroveFromIndex: vi.fn(),
			updateGroveInIndex: vi.fn(),
			readGroveMetadata: vi.fn(),
			writeGroveMetadata: vi.fn(),
			addWorktreeToGrove: vi.fn(),
			getAllGroves: vi.fn(),
			getGroveById: vi.fn(),
			deleteGrove: vi.fn(),
		};

		mockGroveConfigService = {
			readGroveRepoConfig: vi.fn().mockReturnValue({}),
			readMergedConfig: vi.fn().mockReturnValue({
				rootFileCopyPatterns: [],
				projectFileCopyPatterns: [],
				rootInitActions: [],
				projectInitActions: [],
			}),
			validateBranchNameTemplate: vi.fn(),
			// Mirror the real template application closely enough for assertions.
			applyBranchNameTemplate: vi.fn((template: string, name: string) =>
				template.replace('${GROVE_NAME}', name)
			),
			getBranchNameForRepo: vi.fn(),
			getBranchNameForSelection: vi.fn(),
			isIDEReference: vi.fn() as unknown as IGroveConfigService['isIDEReference'],
			parseIDEReference: vi.fn(),
			getIDEConfigForSelection: vi.fn(),
			writeGroveConfig: vi.fn(),
			writeGroveLocalConfig: vi.fn(),
			readGroveConfigOnly: vi.fn(),
			readGroveLocalConfigOnly: vi.fn(),
			groveConfigExists: vi.fn(),
			groveLocalConfigExists: vi.fn(),
			getProjectsWithGroveConfig: vi.fn(),
			validateTemplateVariables: vi.fn(),
			validateBranchTemplate: vi.fn(),
			validateClaudeSessionTemplate: vi.fn(),
		};

		mockGitService = {
			addWorktree: vi.fn().mockResolvedValue({ success: true, stdout: '', stderr: '', exitCode: 0 }),
			listWorktrees: vi.fn(),
			parseWorktreeList: vi.fn(),
			removeWorktree: vi.fn(),
			pruneWorktrees: vi.fn(),
			lockWorktree: vi.fn(),
			unlockWorktree: vi.fn(),
			moveWorktree: vi.fn(),
			hasUncommittedChanges: vi.fn().mockResolvedValue(false),
			hasUnpushedCommits: vi.fn(),
			getCurrentBranch: vi.fn().mockResolvedValue('main'),
			getFileChangeStats: vi.fn(),
			detectMainBranch: vi.fn().mockResolvedValue('main'),
			fetch: vi.fn().mockResolvedValue({ success: true, stdout: '', stderr: '', exitCode: 0 }),
			pull: vi.fn().mockResolvedValue({ success: true, stdout: '', stderr: '', exitCode: 0 }),
			reset: vi.fn(),
			revParse: vi.fn(),
			getBranchUpstreamStatus: vi.fn(),
		};

		mockContextService = {
			generateContent: vi.fn(),
			createContextFile: vi.fn(),
			contextFileExists: vi.fn(),
			readContextFile: vi.fn(),
			getContextFilePath: vi.fn(),
		};

		mockFileService = {
			matchPattern: vi.fn(),
			matchPatterns: vi.fn(),
			copyFile: vi.fn(),
			copyFilesFromPatterns: vi.fn().mockResolvedValue({ success: true, copiedFiles: [], errors: [] }),
			exists: vi.fn(),
			isDirectory: vi.fn(),
			isFile: vi.fn(),
		};

		service = new GroveService(
			mockSettingsService,
			mockGrovesService,
			mockGroveConfigService,
			mockContextService,
			new WorktreeSetupService(mockGitService, mockFileService)
		);

		vi.mocked(mockGrovesService.getGroveById).mockReturnValue(createMockGroveRef());
		vi.mocked(mockGrovesService.readGroveMetadata).mockReturnValue(createMockMetadata());
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('branches off HEAD and updates the repo when not forking', async () => {
		await service.addWorktreeToGrove('grove-1', createSelection(), 'feature');

		// Base ref should be HEAD for a normal add
		expect(mockGitService.addWorktree).toHaveBeenCalledWith(
			'/repos/test-repo',
			expect.any(String),
			expect.any(String),
			'HEAD'
		);
		// The repo is brought up to date (main branch detection runs)
		expect(mockGitService.detectMainBranch).toHaveBeenCalled();
	});

	it('branches off the source worktree branch and skips the main-branch update when forking', async () => {
		const parent: Worktree = {
			name: 'parent',
			repositoryName: 'test-repo',
			repositoryPath: '/repos/test-repo',
			worktreePath: '/groves/test-grove/parent-abcde',
			branch: 'grove/source-branch',
		};
		vi.mocked(mockGrovesService.readGroveMetadata).mockReturnValue(createMockMetadata([parent]));

		await service.addWorktreeToGrove(
			'grove-1',
			createSelection(),
			'feature',
			undefined,
			parent.worktreePath
		);

		// Base ref should be the parent worktree's branch
		expect(mockGitService.addWorktree).toHaveBeenCalledWith(
			'/repos/test-repo',
			expect.any(String),
			expect.any(String),
			'grove/source-branch'
		);

		// Forking must not touch the main branch / reset machinery
		expect(mockGitService.detectMainBranch).not.toHaveBeenCalled();
		expect(mockGitService.reset).not.toHaveBeenCalled();

		// The new worktree is recorded in metadata with its parentage
		const savedMetadata = vi.mocked(mockGrovesService.writeGroveMetadata).mock
			.calls[0][1] as GroveMetadata;
		expect(savedMetadata.worktrees).toHaveLength(2);
		const forked = savedMetadata.worktrees[1];
		expect(forked.name).toBe('feature');
		expect(forked.forkedFromPath).toBe(parent.worktreePath);
	});

	it('throws when the fork source worktree does not exist in the grove', async () => {
		await expect(
			service.addWorktreeToGrove('grove-1', createSelection(), 'feature', undefined, '/missing')
		).rejects.toThrow(/fork from/i);
	});

	it('records the external reference on the created worktree', async () => {
		const reference = {
			type: 'asana' as const,
			id: '1234567890',
			url: 'https://app.asana.com/0/999/1234567890',
		};

		await service.addWorktreeToGrove(
			'grove-1',
			createSelection(),
			'feature',
			undefined,
			undefined,
			reference
		);

		const savedMetadata = vi.mocked(mockGrovesService.writeGroveMetadata).mock
			.calls[0][1] as GroveMetadata;
		expect(savedMetadata.worktrees[0].reference).toEqual(reference);
	});

	it('leaves the reference undefined for a normal add', async () => {
		await service.addWorktreeToGrove('grove-1', createSelection(), 'feature');

		const savedMetadata = vi.mocked(mockGrovesService.writeGroveMetadata).mock
			.calls[0][1] as GroveMetadata;
		expect(savedMetadata.worktrees[0].reference).toBeUndefined();
	});

	describe('adoptWorktreeIntoGrove', () => {
		beforeEach(() => {
			vi.mocked(mockGrovesService.getAllGroves).mockReturnValue([createMockGroveRef()]);
		});

		it('records the worktree with its original path/branch and marks it adopted', () => {
			const result = service.adoptWorktreeIntoGrove('grove-1', {
				repository: createSelection().repository,
				worktreePath: '/elsewhere/my-feature',
				branch: 'feature/my-branch',
			});

			expect(result.worktrees).toHaveLength(1);
			const adopted = result.worktrees[0];
			expect(adopted.worktreePath).toBe('/elsewhere/my-feature');
			expect(adopted.branch).toBe('feature/my-branch');
			expect(adopted.adopted).toBe(true);
			// Name defaults to the worktree folder name
			expect(adopted.name).toBe('my-feature');
			expect(adopted.id).toEqual(expect.any(String));

			// No git commands run - adoption only writes metadata
			expect(mockGitService.addWorktree).not.toHaveBeenCalled();

			const savedMetadata = vi.mocked(mockGrovesService.writeGroveMetadata).mock
				.calls[0][1] as GroveMetadata;
			expect(savedMetadata.worktrees).toHaveLength(1);
			expect(mockGrovesService.updateGroveInIndex).toHaveBeenCalledWith(
				'grove-1',
				expect.objectContaining({ updatedAt: expect.any(String) })
			);
		});

		it('uses the provided display name when given', () => {
			const result = service.adoptWorktreeIntoGrove('grove-1', {
				repository: createSelection().repository,
				worktreePath: '/elsewhere/my-feature',
				branch: 'feature/my-branch',
				name: 'My Feature',
			});

			expect(result.worktrees[0].name).toBe('My Feature');
		});

		it('throws when the worktree is already tracked by a grove', () => {
			const existing: Worktree = {
				name: 'taken',
				repositoryName: 'test-repo',
				repositoryPath: '/repos/test-repo',
				worktreePath: '/elsewhere/my-feature',
				branch: 'feature/my-branch',
			};
			vi.mocked(mockGrovesService.readGroveMetadata).mockReturnValue(createMockMetadata([existing]));

			expect(() =>
				service.adoptWorktreeIntoGrove('grove-1', {
					repository: createSelection().repository,
					worktreePath: '/elsewhere/my-feature',
					branch: 'feature/my-branch',
				})
			).toThrow(/already tracked/i);
		});

		it('allows re-adoption when the tracking entry is closed', () => {
			const closed: Worktree = {
				name: 'old',
				repositoryName: 'test-repo',
				repositoryPath: '/repos/test-repo',
				worktreePath: '/elsewhere/my-feature',
				branch: 'feature/my-branch',
				closed: true,
			};
			vi.mocked(mockGrovesService.readGroveMetadata).mockReturnValue(createMockMetadata([closed]));

			const result = service.adoptWorktreeIntoGrove('grove-1', {
				repository: createSelection().repository,
				worktreePath: '/elsewhere/my-feature',
				branch: 'feature/my-branch',
			});

			expect(result.worktrees).toHaveLength(2);
		});

		it('throws when the grove does not exist', () => {
			vi.mocked(mockGrovesService.getGroveById).mockReturnValue(null);

			expect(() =>
				service.adoptWorktreeIntoGrove('missing', {
					repository: createSelection().repository,
					worktreePath: '/elsewhere/my-feature',
					branch: 'feature/my-branch',
				})
			).toThrow(/grove not found/i);
		});
	});

	describe('setWorktreeReference', () => {
		const existing: Worktree = {
			name: 'feature',
			repositoryName: 'test-repo',
			repositoryPath: '/repos/test-repo',
			worktreePath: '/groves/test-grove/feature-abcde',
			branch: 'grove/feature',
		};

		it('attaches the reference to the matching worktree and persists it', () => {
			vi
				.mocked(mockGrovesService.readGroveMetadata)
				.mockReturnValue(createMockMetadata([{ ...existing }]));

			const reference = {
				type: 'asana' as const,
				id: '1234567890',
				url: 'https://app.asana.com/0/999/1234567890',
			};

			const result = service.setWorktreeReference('grove-1', existing.worktreePath, reference);

			expect(result.worktrees[0].reference).toEqual(reference);
			const savedMetadata = vi.mocked(mockGrovesService.writeGroveMetadata).mock
				.calls[0][1] as GroveMetadata;
			expect(savedMetadata.worktrees[0].reference).toEqual(reference);
			expect(mockGrovesService.updateGroveInIndex).toHaveBeenCalledWith(
				'grove-1',
				expect.objectContaining({ updatedAt: expect.any(String) })
			);
		});

		it('throws when the worktree is not in the grove', () => {
			vi
				.mocked(mockGrovesService.readGroveMetadata)
				.mockReturnValue(createMockMetadata([{ ...existing }]));

			expect(() =>
				service.setWorktreeReference('grove-1', '/missing', {
					type: 'asana',
					id: '1',
					url: 'https://app.asana.com/0/1/1',
				})
			).toThrow(/worktree not found/i);
		});
	});
});

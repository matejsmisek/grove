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
			mockGitService,
			mockContextService,
			mockFileService
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
});

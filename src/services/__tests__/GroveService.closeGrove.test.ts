import { Volume } from 'memfs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockFs } from '../../__tests__/helpers.js';
import type { IGroveConfigService } from '../../storage/GroveConfigService.js';
import type { IGrovesService } from '../../storage/GrovesService.js';
import type { ISettingsService } from '../../storage/SettingsService.js';
import type { GroveMetadata, GroveReference, Worktree } from '../../storage/types.js';
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

function createMockWorktree(overrides: Partial<Worktree> = {}): Worktree {
	return {
		repositoryName: 'test-repo',
		repositoryPath: '/repos/test-repo',
		worktreePath: '/groves/test-grove/test-repo.worktree',
		branch: 'grove/test',
		...overrides,
	};
}

function createMockMetadata(worktrees: Worktree[]): GroveMetadata {
	return {
		id: 'grove-1',
		name: 'Test Grove',
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

describe('GroveService.closeGrove', () => {
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
			applyBranchNameTemplate: vi.fn(),
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
			addWorktree: vi.fn(),
			listWorktrees: vi.fn(),
			parseWorktreeList: vi.fn(),
			removeWorktree: vi.fn(),
			pruneWorktrees: vi.fn(),
			lockWorktree: vi.fn(),
			unlockWorktree: vi.fn(),
			moveWorktree: vi.fn(),
			hasUncommittedChanges: vi.fn(),
			hasUnpushedCommits: vi.fn(),
			getCurrentBranch: vi.fn(),
			getFileChangeStats: vi.fn(),
			detectMainBranch: vi.fn(),
			fetch: vi.fn(),
			pull: vi.fn(),
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
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should return error when grove not found', async () => {
		vi.mocked(mockGrovesService.removeGroveFromIndex).mockReturnValue(null);

		const result = await service.closeGrove('nonexistent');

		expect(result.success).toBe(false);
		expect(result.message).toBe('Grove not found');
	});

	it('should skip already closed worktrees during cleanup', async () => {
		const closedWorktree = createMockWorktree({
			repositoryName: 'closed-repo',
			repositoryPath: '/repos/closed-repo',
			worktreePath: '/groves/test-grove/closed-repo.worktree',
			closed: true,
			closedAt: new Date().toISOString(),
		});
		const openWorktree = createMockWorktree({
			repositoryName: 'open-repo',
			repositoryPath: '/repos/open-repo',
			worktreePath: '/groves/test-grove/open-repo.worktree',
		});
		const metadata = createMockMetadata([closedWorktree, openWorktree]);

		vi.mocked(mockGrovesService.removeGroveFromIndex).mockReturnValue(createMockGroveRef());
		vi.mocked(mockGrovesService.readGroveMetadata).mockReturnValue(metadata);
		vi.mocked(mockGitService.removeWorktree).mockResolvedValue({
			success: true,
			stdout: '',
			stderr: '',
			exitCode: 0,
		});

		const result = await service.closeGrove('grove-1');

		expect(result.success).toBe(true);
		expect(result.message).toBe('Grove closed successfully');

		// Only the open worktree should have been removed via git
		expect(mockGitService.removeWorktree).toHaveBeenCalledTimes(1);
		expect(mockGitService.removeWorktree).toHaveBeenCalledWith(
			openWorktree.repositoryPath,
			openWorktree.worktreePath,
			true
		);
	});

	it('should remove all worktrees when none are closed', async () => {
		const worktree1 = createMockWorktree({
			repositoryName: 'repo-1',
			repositoryPath: '/repos/repo-1',
			worktreePath: '/groves/test-grove/repo-1.worktree',
		});
		const worktree2 = createMockWorktree({
			repositoryName: 'repo-2',
			repositoryPath: '/repos/repo-2',
			worktreePath: '/groves/test-grove/repo-2.worktree',
		});
		const metadata = createMockMetadata([worktree1, worktree2]);

		vi.mocked(mockGrovesService.removeGroveFromIndex).mockReturnValue(createMockGroveRef());
		vi.mocked(mockGrovesService.readGroveMetadata).mockReturnValue(metadata);
		vi.mocked(mockGitService.removeWorktree).mockResolvedValue({
			success: true,
			stdout: '',
			stderr: '',
			exitCode: 0,
		});

		const result = await service.closeGrove('grove-1');

		expect(result.success).toBe(true);
		expect(mockGitService.removeWorktree).toHaveBeenCalledTimes(2);
	});

	it('should report errors for worktrees that fail to remove', async () => {
		const worktree = createMockWorktree();
		const metadata = createMockMetadata([worktree]);

		vi.mocked(mockGrovesService.removeGroveFromIndex).mockReturnValue(createMockGroveRef());
		vi.mocked(mockGrovesService.readGroveMetadata).mockReturnValue(metadata);
		vi.mocked(mockGitService.removeWorktree).mockResolvedValue({
			success: false,
			stdout: '',
			stderr: 'fatal: is not a working tree',
			exitCode: 1,
		});

		const result = await service.closeGrove('grove-1');

		expect(result.success).toBe(false);
		expect(result.message).toBe('Grove closed with some errors');
		expect(result.errors[0]).toContain('Failed to remove worktree');
	});
});

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

describe('GroveService.closeWorktree', () => {
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
			mockGitService,
			mockContextService,
			mockFileService
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should return error when grove not found', async () => {
		vi.mocked(mockGrovesService.getGroveById).mockReturnValue(null);

		const result = await service.closeWorktree('nonexistent', '/some/path');

		expect(result.success).toBe(false);
		expect(result.message).toBe('Grove not found');
	});

	it('should return error when grove metadata not found', async () => {
		vi.mocked(mockGrovesService.getGroveById).mockReturnValue(createMockGroveRef());
		vi.mocked(mockGrovesService.readGroveMetadata).mockReturnValue(null);

		const result = await service.closeWorktree('grove-1', '/some/path');

		expect(result.success).toBe(false);
		expect(result.message).toBe('Grove metadata not found');
	});

	it('should return error when worktree not found in grove', async () => {
		const worktree = createMockWorktree();
		const metadata = createMockMetadata([worktree]);

		vi.mocked(mockGrovesService.getGroveById).mockReturnValue(createMockGroveRef());
		vi.mocked(mockGrovesService.readGroveMetadata).mockReturnValue(metadata);

		const result = await service.closeWorktree('grove-1', '/nonexistent/path');

		expect(result.success).toBe(false);
		expect(result.message).toBe('Worktree not found in grove');
	});

	it('should return error when worktree is already closed', async () => {
		const worktree = createMockWorktree({ closed: true, closedAt: new Date().toISOString() });
		const metadata = createMockMetadata([worktree]);

		vi.mocked(mockGrovesService.getGroveById).mockReturnValue(createMockGroveRef());
		vi.mocked(mockGrovesService.readGroveMetadata).mockReturnValue(metadata);

		const result = await service.closeWorktree('grove-1', worktree.worktreePath);

		expect(result.success).toBe(false);
		expect(result.message).toBe('Worktree is already closed');
		expect(mockGitService.removeWorktree).not.toHaveBeenCalled();
	});

	it('should successfully close a worktree and mark it as closed', async () => {
		const worktree1 = createMockWorktree();
		const worktree2 = createMockWorktree({
			repositoryName: 'other-repo',
			repositoryPath: '/repos/other-repo',
			worktreePath: '/groves/test-grove/other-repo.worktree',
			branch: 'grove/test-2',
		});
		const metadata = createMockMetadata([worktree1, worktree2]);

		vi.mocked(mockGrovesService.getGroveById).mockReturnValue(createMockGroveRef());
		vi.mocked(mockGrovesService.readGroveMetadata).mockReturnValue(metadata);
		vi.mocked(mockGitService.removeWorktree).mockResolvedValue({
			success: true,
			stdout: '',
			stderr: '',
			exitCode: 0,
		});

		const result = await service.closeWorktree('grove-1', worktree1.worktreePath);

		expect(result.success).toBe(true);
		expect(result.message).toBe('Worktree closed successfully');

		// Should have removed the git worktree with force
		expect(mockGitService.removeWorktree).toHaveBeenCalledWith(
			worktree1.repositoryPath,
			worktree1.worktreePath,
			true
		);

		// Metadata should still contain both worktrees, but first one marked as closed
		const savedMetadata = vi.mocked(mockGrovesService.writeGroveMetadata).mock
			.calls[0][1] as GroveMetadata;
		expect(savedMetadata.worktrees).toHaveLength(2);
		expect(savedMetadata.worktrees[0].repositoryName).toBe('test-repo');
		expect(savedMetadata.worktrees[0].closed).toBe(true);
		expect(savedMetadata.worktrees[0].closedAt).toBeDefined();
		expect(savedMetadata.worktrees[1].repositoryName).toBe('other-repo');
		expect(savedMetadata.worktrees[1].closed).toBeUndefined();
	});

	it('should mark worktree as closed even when git removal fails', async () => {
		const worktree = createMockWorktree();
		const metadata = createMockMetadata([worktree]);

		vi.mocked(mockGrovesService.getGroveById).mockReturnValue(createMockGroveRef());
		vi.mocked(mockGrovesService.readGroveMetadata).mockReturnValue(metadata);
		vi.mocked(mockGitService.removeWorktree).mockResolvedValue({
			success: false,
			stdout: '',
			stderr: 'fatal: worktree not found',
			exitCode: 1,
		});

		const result = await service.closeWorktree('grove-1', worktree.worktreePath);

		expect(result.success).toBe(false);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toContain('Failed to remove worktree');

		// Worktree should still be marked as closed in metadata
		expect(mockGrovesService.writeGroveMetadata).toHaveBeenCalledWith(
			'/groves/test-grove',
			expect.objectContaining({
				worktrees: [
					expect.objectContaining({
						closed: true,
						closedAt: expect.any(String),
					}),
				],
			})
		);
	});

	it('should handle git removal throwing an exception', async () => {
		const worktree = createMockWorktree();
		const metadata = createMockMetadata([worktree]);

		vi.mocked(mockGrovesService.getGroveById).mockReturnValue(createMockGroveRef());
		vi.mocked(mockGrovesService.readGroveMetadata).mockReturnValue(metadata);
		vi.mocked(mockGitService.removeWorktree).mockRejectedValue(new Error('Git command failed'));

		const result = await service.closeWorktree('grove-1', worktree.worktreePath);

		expect(result.success).toBe(false);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toContain('Error removing worktree');
		expect(result.errors[0]).toContain('Git command failed');

		// Metadata should still be updated with closed flag
		expect(mockGrovesService.writeGroveMetadata).toHaveBeenCalled();
	});

	it('should clean up worktree folder if it exists on disk', async () => {
		const worktreePath = '/groves/test-grove/test-repo.worktree';
		vol.mkdirSync(worktreePath, { recursive: true });
		vol.writeFileSync(`${worktreePath}/somefile.txt`, 'content');

		const worktree = createMockWorktree({ worktreePath });
		const metadata = createMockMetadata([worktree]);

		vi.mocked(mockGrovesService.getGroveById).mockReturnValue(createMockGroveRef());
		vi.mocked(mockGrovesService.readGroveMetadata).mockReturnValue(metadata);
		vi.mocked(mockGitService.removeWorktree).mockResolvedValue({
			success: true,
			stdout: '',
			stderr: '',
			exitCode: 0,
		});

		const result = await service.closeWorktree('grove-1', worktreePath);

		expect(result.success).toBe(true);
		expect(vol.existsSync(worktreePath)).toBe(false);
	});

	it('should close the correct worktree when multiple exist', async () => {
		const worktree1 = createMockWorktree({
			repositoryName: 'repo-a',
			worktreePath: '/groves/test-grove/repo-a.worktree',
		});
		const worktree2 = createMockWorktree({
			repositoryName: 'repo-b',
			worktreePath: '/groves/test-grove/repo-b.worktree',
		});
		const worktree3 = createMockWorktree({
			repositoryName: 'repo-c',
			worktreePath: '/groves/test-grove/repo-c.worktree',
		});
		const metadata = createMockMetadata([worktree1, worktree2, worktree3]);

		vi.mocked(mockGrovesService.getGroveById).mockReturnValue(createMockGroveRef());
		vi.mocked(mockGrovesService.readGroveMetadata).mockReturnValue(metadata);
		vi.mocked(mockGitService.removeWorktree).mockResolvedValue({
			success: true,
			stdout: '',
			stderr: '',
			exitCode: 0,
		});

		// Close the middle worktree
		const result = await service.closeWorktree('grove-1', worktree2.worktreePath);

		expect(result.success).toBe(true);

		// Should have removed only worktree2 from git
		expect(mockGitService.removeWorktree).toHaveBeenCalledTimes(1);
		expect(mockGitService.removeWorktree).toHaveBeenCalledWith(
			worktree2.repositoryPath,
			worktree2.worktreePath,
			true
		);

		// All three worktrees should still be in metadata, only worktree2 marked as closed
		const savedMetadata = vi.mocked(mockGrovesService.writeGroveMetadata).mock
			.calls[0][1] as GroveMetadata;
		expect(savedMetadata.worktrees).toHaveLength(3);
		expect(savedMetadata.worktrees[0].repositoryName).toBe('repo-a');
		expect(savedMetadata.worktrees[0].closed).toBeUndefined();
		expect(savedMetadata.worktrees[1].repositoryName).toBe('repo-b');
		expect(savedMetadata.worktrees[1].closed).toBe(true);
		expect(savedMetadata.worktrees[2].repositoryName).toBe('repo-c');
		expect(savedMetadata.worktrees[2].closed).toBeUndefined();
	});
});

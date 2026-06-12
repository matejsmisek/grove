import { Volume } from 'memfs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockFs } from '../../__tests__/helpers.js';
import type { IGroveConfigService } from '../../storage/GroveConfigService.js';
import type { IGrovesService } from '../../storage/GrovesService.js';
import type { ISettingsService } from '../../storage/SettingsService.js';
import type {
	GroveMetadata,
	GroveReference,
	InitActionsStatus,
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

const GROVE_PATH = '/groves/test-grove';
const WORKTREE_PATH = '/groves/test-grove/test-repo.worktree';

function createMockInitActionsStatus(
	overrides: Partial<InitActionsStatus> = {}
): InitActionsStatus {
	return {
		executed: true,
		success: true,
		executedAt: new Date().toISOString(),
		logFile: 'grove-init-test-repo.log',
		totalActions: 1,
		successfulActions: 1,
		...overrides,
	};
}

function createMockWorktree(overrides: Partial<Worktree> = {}): Worktree {
	return {
		repositoryName: 'test-repo',
		repositoryPath: '/repos/test-repo',
		worktreePath: WORKTREE_PATH,
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
		path: GROVE_PATH,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};
}

describe('GroveService.readWorktreeInitLog', () => {
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

	it('throws when the grove is not found', () => {
		vi.mocked(mockGrovesService.getGroveById).mockReturnValue(null);

		expect(() => service.readWorktreeInitLog('nonexistent', WORKTREE_PATH)).toThrow(
			'Grove not found'
		);
	});

	it('throws when grove metadata is not found', () => {
		vi.mocked(mockGrovesService.getGroveById).mockReturnValue(createMockGroveRef());
		vi.mocked(mockGrovesService.readGroveMetadata).mockReturnValue(null);

		expect(() => service.readWorktreeInitLog('grove-1', WORKTREE_PATH)).toThrow(
			'Grove metadata not found'
		);
	});

	it('throws when the worktree is not in the grove', () => {
		const metadata = createMockMetadata([createMockWorktree()]);
		vi.mocked(mockGrovesService.getGroveById).mockReturnValue(createMockGroveRef());
		vi.mocked(mockGrovesService.readGroveMetadata).mockReturnValue(metadata);

		expect(() => service.readWorktreeInitLog('grove-1', '/nonexistent/path')).toThrow(
			'Worktree not found in grove'
		);
	});

	it('throws when no init actions were executed for the worktree', () => {
		const metadata = createMockMetadata([createMockWorktree({ initActionsStatus: undefined })]);
		vi.mocked(mockGrovesService.getGroveById).mockReturnValue(createMockGroveRef());
		vi.mocked(mockGrovesService.readGroveMetadata).mockReturnValue(metadata);

		expect(() => service.readWorktreeInitLog('grove-1', WORKTREE_PATH)).toThrow(
			'No init actions were executed for this worktree'
		);
	});

	it('throws a wrapped error when the log file cannot be read', () => {
		const metadata = createMockMetadata([
			createMockWorktree({ initActionsStatus: createMockInitActionsStatus() }),
		]);
		vi.mocked(mockGrovesService.getGroveById).mockReturnValue(createMockGroveRef());
		vi.mocked(mockGrovesService.readGroveMetadata).mockReturnValue(metadata);

		// No log file written to the in-memory filesystem, so the read fails.
		expect(() => service.readWorktreeInitLog('grove-1', WORKTREE_PATH)).toThrow(
			/^Failed to read init log:/
		);
	});

	it('returns the log file contents from the grove directory', () => {
		const status = createMockInitActionsStatus({ logFile: 'grove-init-test-repo.log' });
		const metadata = createMockMetadata([createMockWorktree({ initActionsStatus: status })]);
		vi.mocked(mockGrovesService.getGroveById).mockReturnValue(createMockGroveRef());
		vi.mocked(mockGrovesService.readGroveMetadata).mockReturnValue(metadata);

		const logContents = 'Grove InitActions Execution Log\n[Action 1/1] npm install\nExit code: 0\n';
		vol.mkdirSync(GROVE_PATH, { recursive: true });
		vol.writeFileSync(`${GROVE_PATH}/${status.logFile}`, logContents);

		const result = service.readWorktreeInitLog('grove-1', WORKTREE_PATH);

		expect(result).toBe(logContents);
	});
});

import { Volume } from 'memfs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockFs, setupMockHomeDir } from '../../__tests__/helpers.js';
import { getContainer, resetContainer } from '../../di/index.js';
import { GrovesServiceToken } from '../../services/tokens.js';
import { GrovesService } from '../../storage/GrovesService.js';
import { SettingsService } from '../../storage/SettingsService.js';
import type { GroveMetadata, GroveReference, Worktree } from '../../storage/types.js';
import { groveStatus } from '../status.js';

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

const GROVE_PATH = '/home/testuser/.grove/groves/feature--ab12';

function makeWorktree(overrides: Partial<Worktree> = {}): Worktree {
	return {
		name: 'feature',
		repositoryName: 'grove',
		repositoryPath: '/home/testuser/repos/grove',
		worktreePath: `${GROVE_PATH}/grove--ab12`,
		branch: 'ms-feature--ab12',
		...overrides,
	};
}

function seedGrove(grovesService: GrovesService, worktrees: Worktree[]): GroveReference {
	const groveRef: GroveReference = {
		id: 'grove-id-1',
		name: 'feature',
		path: GROVE_PATH,
		createdAt: '2026-06-01T00:00:00.000Z',
		updatedAt: '2026-06-01T00:00:00.000Z',
	};
	grovesService.addGroveToIndex(groveRef);

	vol.mkdirSync(GROVE_PATH, { recursive: true });

	const metadata: GroveMetadata = {
		id: groveRef.id,
		name: groveRef.name,
		identifier: '-ab12',
		worktrees,
		createdAt: groveRef.createdAt,
		updatedAt: groveRef.updatedAt,
	};
	grovesService.writeGroveMetadata(GROVE_PATH, metadata);

	return groveRef;
}

describe('groveStatus', () => {
	let grovesService: GrovesService;
	let cwdSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		const mockFs = createMockFs();
		vol = mockFs.vol;
		mockHomeDir = '/home/testuser';
		setupMockHomeDir(vol, mockHomeDir);

		const settingsService = new SettingsService();
		settingsService.initializeStorage();
		grovesService = new GrovesService(settingsService);

		resetContainer();
		getContainer().registerInstance(GrovesServiceToken, grovesService);

		cwdSpy = vi.spyOn(process, 'cwd');
	});

	afterEach(() => {
		vi.restoreAllMocks();
		resetContainer();
	});

	it('reports grove ID, worktree ID and repository when inside a worktree', () => {
		const worktree = makeWorktree();
		seedGrove(grovesService, [worktree]);
		cwdSpy.mockReturnValue(worktree.worktreePath);

		const result = groveStatus();

		expect(result.success).toBe(true);
		expect(result.groveId).toBe('grove-id-1');
		expect(result.worktreeId).toBe('grove--ab12');
		expect(result.repository).toBe('grove');
	});

	it('detects the worktree from a nested subdirectory', () => {
		const worktree = makeWorktree();
		seedGrove(grovesService, [worktree]);
		cwdSpy.mockReturnValue(`${worktree.worktreePath}/src/components`);

		const result = groveStatus();

		expect(result.success).toBe(true);
		expect(result.worktreeId).toBe('grove--ab12');
	});

	it('uses repo.project notation for monorepo project worktrees', () => {
		const worktree = makeWorktree({ projectPath: 'packages/cli' });
		seedGrove(grovesService, [worktree]);
		cwdSpy.mockReturnValue(worktree.worktreePath);

		const result = groveStatus();

		expect(result.success).toBe(true);
		expect(result.repository).toBe('grove.packages/cli');
	});

	it('uses the folder name as the worktree ID even when it differs from the name', () => {
		const worktree = makeWorktree({ name: 'feature', worktreePath: `${GROVE_PATH}/grove--ab12` });
		seedGrove(grovesService, [worktree]);
		cwdSpy.mockReturnValue(worktree.worktreePath);

		const result = groveStatus();

		expect(result.success).toBe(true);
		expect(result.worktreeId).toBe('grove--ab12');
		expect(result.worktreeName).toBe('feature');
	});

	it('selects the matching worktree among several in a grove', () => {
		const first = makeWorktree({ name: 'api', worktreePath: `${GROVE_PATH}/api--ab12` });
		const second = makeWorktree({ name: 'web', worktreePath: `${GROVE_PATH}/web--ab12` });
		seedGrove(grovesService, [first, second]);
		cwdSpy.mockReturnValue(second.worktreePath);

		const result = groveStatus();

		expect(result.success).toBe(true);
		expect(result.worktreeId).toBe('web--ab12');
	});

	it('fails when not inside any grove', () => {
		seedGrove(grovesService, [makeWorktree()]);
		cwdSpy.mockReturnValue('/home/testuser/somewhere/else');

		const result = groveStatus();

		expect(result.success).toBe(false);
		expect(result.message).toContain('Not inside a grove worktree');
	});

	it('reports grove context but fails when inside the grove folder but not a worktree', () => {
		seedGrove(grovesService, [makeWorktree()]);
		cwdSpy.mockReturnValue(GROVE_PATH);

		const result = groveStatus();

		expect(result.success).toBe(false);
		expect(result.groveId).toBe('grove-id-1');
		expect(result.worktreeId).toBeUndefined();
	});
});

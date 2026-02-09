import { Volume } from 'memfs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockFs } from '../../__tests__/helpers.js';
import { ClaudeSessionService } from '../ClaudeSessionService.js';
import type { IGroveConfigService, ISettingsService } from '../interfaces.js';

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

// Mock child_process
vi.mock('child_process', () => ({
	execSync: vi.fn(),
	spawn: vi.fn(() => ({
		on: vi.fn(),
		unref: vi.fn(),
	})),
}));

describe('ClaudeSessionService', () => {
	let service: ClaudeSessionService;
	let mockSettingsService: ISettingsService;
	let mockGroveConfigService: IGroveConfigService;

	beforeEach(() => {
		// Create fresh in-memory filesystem
		const mockFs = createMockFs();
		vol = mockFs.vol;

		// Create minimal mock services
		mockSettingsService = {
			getStorageConfig: vi.fn().mockReturnValue({ groveFolder: '/home/test/.grove' }),
			readSettings: vi.fn().mockReturnValue({}),
			getDefaultSettings: vi.fn(),
			initializeStorage: vi.fn(),
			writeSettings: vi.fn(),
			updateSettings: vi.fn(),
		};

		mockGroveConfigService = {
			readGroveRepoConfig: vi.fn().mockReturnValue({}),
			readMergedConfig: vi.fn(),
			validateBranchNameTemplate: vi.fn(),
			applyBranchNameTemplate: vi.fn(),
			getBranchNameForRepo: vi.fn(),
			getBranchNameForSelection: vi.fn(),
			isIDEReference: vi.fn(),
			parseIDEReference: vi.fn(),
			getIDEConfigForSelection: vi.fn(),
		};

		service = new ClaudeSessionService(mockSettingsService, mockGroveConfigService);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('applyTemplate', () => {
		it('should replace ${WORKING_DIR} placeholder', () => {
			const template = 'cd ${WORKING_DIR}';
			const result = service.applyTemplate(template, '/path/to/work');

			expect(result).toBe('cd /path/to/work');
		});

		it('should replace ${AGENT_COMMAND} placeholder with default value', () => {
			const template = 'launch ${AGENT_COMMAND}';
			const result = service.applyTemplate(template, '/work');

			expect(result).toBe('launch claude');
		});

		it('should replace ${AGENT_COMMAND} placeholder with custom value', () => {
			const template = 'launch ${AGENT_COMMAND}';
			const result = service.applyTemplate(template, '/work', 'claude --resume abc123');

			expect(result).toBe('launch claude --resume abc123');
		});

		it('should replace ${GROVE_NAME} placeholder with grove name', () => {
			const template = 'title: ${GROVE_NAME}';
			const result = service.applyTemplate(template, '/work', 'claude', 'my-feature-branch');

			expect(result).toBe('title: my-feature-branch');
		});

		it('should replace ${GROVE_NAME_SHORT} with shortened name for short names', () => {
			const template = 'title: ${GROVE_NAME_SHORT}';
			const result = service.applyTemplate(template, '/work', 'claude', 'short');

			expect(result).toBe('title: short');
		});

		it('should replace ${GROVE_NAME_SHORT} with first 15 chars for long names', () => {
			const template = 'title: ${GROVE_NAME_SHORT}';
			const result = service.applyTemplate(
				template,
				'/work',
				'claude',
				'this-is-a-very-long-grove-name'
			);

			expect(result).toBe('title: this-is-a-very-');
		});

		it('should handle exactly 15 character grove name', () => {
			const template = 'title: ${GROVE_NAME_SHORT}';
			const result = service.applyTemplate(template, '/work', 'claude', '123456789012345');

			expect(result).toBe('title: 123456789012345');
		});

		it('should handle 16 character grove name (truncates to 15)', () => {
			const template = 'title: ${GROVE_NAME_SHORT}';
			const result = service.applyTemplate(template, '/work', 'claude', '1234567890123456');

			expect(result).toBe('title: 123456789012345');
		});

		it('should not replace grove name placeholders when groveName is undefined', () => {
			const template = 'title: ${GROVE_NAME} - ${GROVE_NAME_SHORT}';
			const result = service.applyTemplate(template, '/work', 'claude');

			expect(result).toBe('title: ${GROVE_NAME} - ${GROVE_NAME_SHORT}');
		});

		it('should replace ${WORKTREE_NAME} placeholder with worktree name', () => {
			const template = 'title: ${WORKTREE_NAME}';
			const result = service.applyTemplate(template, '/work', 'claude', 'my-grove', 'my-worktree');

			expect(result).toBe('title: my-worktree');
		});

		it('should replace ${WORKTREE_NAME_SHORT} with shortened name for short names', () => {
			const template = 'title: ${WORKTREE_NAME_SHORT}';
			const result = service.applyTemplate(template, '/work', 'claude', 'grove', 'short');

			expect(result).toBe('title: short');
		});

		it('should replace ${WORKTREE_NAME_SHORT} with first 15 chars for long names', () => {
			const template = 'title: ${WORKTREE_NAME_SHORT}';
			const result = service.applyTemplate(
				template,
				'/work',
				'claude',
				'my-grove',
				'this-is-a-very-long-worktree-name'
			);

			expect(result).toBe('title: this-is-a-very-');
		});

		it('should not replace worktree name placeholders when worktreeName is undefined', () => {
			const template = 'title: ${WORKTREE_NAME} - ${WORKTREE_NAME_SHORT}';
			const result = service.applyTemplate(template, '/work', 'claude', 'my-grove');

			expect(result).toBe('title: ${WORKTREE_NAME} - ${WORKTREE_NAME_SHORT}');
		});

		it('should replace all placeholders in a complex template', () => {
			const template = `layout tall
cd \${WORKING_DIR}
launch --title "\${GROVE_NAME_SHORT}" \${AGENT_COMMAND}
launch --title "\${WORKTREE_NAME_SHORT}" bash`;

			const result = service.applyTemplate(
				template,
				'/home/user/projects/grove',
				'claude --resume xyz',
				'feature-add-grove-name-variables',
				'my-worktree-long-name'
			);

			const expected = `layout tall
cd /home/user/projects/grove
launch --title "feature-add-gro" claude --resume xyz
launch --title "my-worktree-lon" bash`;

			expect(result).toBe(expected);
		});

		it('should replace multiple occurrences of each placeholder', () => {
			const template =
				'${WORKING_DIR} - ${WORKING_DIR} | ${GROVE_NAME} - ${GROVE_NAME} | ${GROVE_NAME_SHORT} - ${GROVE_NAME_SHORT} | ${WORKTREE_NAME} - ${WORKTREE_NAME}';
			const result = service.applyTemplate(template, '/path', 'claude', 'test-grove', 'test-wt');

			expect(result).toBe(
				'/path - /path | test-grove - test-grove | test-grove - test-grove | test-wt - test-wt'
			);
		});

		it('should not replace placeholders for empty grove name', () => {
			const template = 'title: ${GROVE_NAME}';
			const result = service.applyTemplate(template, '/work', 'claude', '');

			// Empty string is falsy, so placeholders are not replaced (same as undefined)
			expect(result).toBe('title: ${GROVE_NAME}');
		});
	});

	describe('getDefaultTemplate', () => {
		it('should return konsole template with all placeholders', () => {
			const template = service.getDefaultTemplate('konsole');

			expect(template).toContain('${WORKING_DIR}');
			expect(template).toContain('${AGENT_COMMAND}');
		});

		it('should return kitty template with all placeholders', () => {
			const template = service.getDefaultTemplate('kitty');

			expect(template).toContain('${WORKING_DIR}');
			expect(template).toContain('${AGENT_COMMAND}');
		});
	});
});

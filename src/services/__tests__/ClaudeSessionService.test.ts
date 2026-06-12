import { Volume } from 'memfs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockFs } from '../../__tests__/helpers.js';
import type { IGroveConfigService } from '../../storage/GroveConfigService.js';
import type { ISessionsService } from '../../storage/SessionsService.js';
import type { ISettingsService } from '../../storage/SettingsService.js';
import { ClaudeSessionService } from '../ClaudeSessionService.js';

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
	spawnSync: vi.fn(),
	spawn: vi.fn(() => ({
		on: vi.fn(),
		unref: vi.fn(),
	})),
}));

// Mock the shared command-availability helper so terminal detection is
// deterministic without spawning real `which` probes.
const { commandState } = vi.hoisted(() => ({ commandState: { installed: new Set<string>() } }));
vi.mock('../../utils/commandExists.js', () => ({
	commandExists: vi.fn((command: string) => Promise.resolve(commandState.installed.has(command))),
}));

describe('ClaudeSessionService', () => {
	let service: ClaudeSessionService;
	let mockSettingsService: ISettingsService;
	let mockGroveConfigService: IGroveConfigService;
	let mockSessionsService: ISessionsService;

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
			getClaudeSessionTemplate: vi.fn().mockReturnValue(undefined),
			getPromptTemplate: vi.fn().mockReturnValue(undefined),
			validateBranchNameTemplate: vi.fn(),
			applyBranchNameTemplate: vi.fn(),
			getBranchNameForRepo: vi.fn(),
			getBranchNameForSelection: vi.fn(),
			isIDEReference: vi.fn(),
			parseIDEReference: vi.fn(),
			getIDEConfigForSelection: vi.fn(),
		};

		mockSessionsService = {
			setSessionsPath: vi.fn(),
			readSessions: vi
				.fn()
				.mockReturnValue({ sessions: [], version: '1.0.0', lastUpdated: '2026-01-01T00:00:00Z' }),
			writeSessions: vi.fn(),
			addSession: vi.fn(),
			updateSession: vi.fn(),
			removeSession: vi.fn(),
			getSessionsByGrove: vi.fn().mockReturnValue([]),
			getSessionsByWorkspace: vi.fn().mockReturnValue([]),
			getSession: vi.fn().mockReturnValue(null),
			getAllActiveSessions: vi.fn().mockReturnValue([]),
			buildIndex: vi.fn(),
			cleanupStaleSessions: vi.fn().mockReturnValue(0),
		};

		service = new ClaudeSessionService(
			mockSettingsService,
			mockGroveConfigService,
			mockSessionsService
		);
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

	describe('getPromptTemplateForRepo', () => {
		// Config precedence (project > repo) now lives in GroveConfigService and
		// is exercised there; these tests cover the delegation and the local
		// settings fallback that remains in ClaudeSessionService.
		it('returns undefined when neither config nor settings provide a template', () => {
			vi.mocked(mockGroveConfigService.getPromptTemplate).mockReturnValue(undefined);

			expect(service.getPromptTemplateForRepo('/repo')).toBeUndefined();
		});

		it('returns the template resolved by GroveConfigService, ahead of settings', () => {
			vi.mocked(mockGroveConfigService.getPromptTemplate).mockReturnValue('from config');
			vi.mocked(mockSettingsService.readSettings).mockReturnValue({
				workingFolder: '/wf',
				promptTemplate: 'from settings',
			});

			expect(service.getPromptTemplateForRepo('/repo')).toBe('from config');
		});

		it('passes the project path through to GroveConfigService', () => {
			vi.mocked(mockGroveConfigService.getPromptTemplate).mockReturnValue('from project');

			expect(service.getPromptTemplateForRepo('/repo', 'web')).toBe('from project');
			expect(mockGroveConfigService.getPromptTemplate).toHaveBeenCalledWith('/repo', 'web');
		});

		it('falls back to the settings template when config has none', () => {
			vi.mocked(mockGroveConfigService.getPromptTemplate).mockReturnValue(undefined);
			vi.mocked(mockSettingsService.readSettings).mockReturnValue({
				workingFolder: '/wf',
				promptTemplate: 'from settings {prompt}',
			});

			expect(service.getPromptTemplateForRepo('/repo')).toBe('from settings {prompt}');
		});

		it('ignores a whitespace-only settings template', () => {
			vi.mocked(mockGroveConfigService.getPromptTemplate).mockReturnValue(undefined);
			vi.mocked(mockSettingsService.readSettings).mockReturnValue({
				workingFolder: '/wf',
				promptTemplate: '   \n  ',
			});

			expect(service.getPromptTemplateForRepo('/repo')).toBeUndefined();
		});
	});

	describe('parseBackgroundSessionId', () => {
		const parse = (output: string): string | null =>
			(
				service as unknown as { parseBackgroundSessionId(o: string): string | null }
			).parseBackgroundSessionId(output);

		it('parses the short id from the backgrounded line', () => {
			const output = 'backgrounded · 7c5dcf5d · flaky-test-fix\n  claude attach 7c5dcf5d';
			expect(parse(output)).toBe('7c5dcf5d');
		});

		it('parses the id even with ANSI color codes', () => {
			const esc = String.fromCharCode(27);
			const output = `${esc}[32mbackgrounded${esc}[0m · ${esc}[1mab12cd34${esc}[0m · name`;
			expect(parse(output)).toBe('ab12cd34');
		});

		it('falls back to the claude attach hint line', () => {
			expect(parse('Started.\n  claude attach deadbeef    open in this terminal')).toBe('deadbeef');
		});

		it('returns null when no id is present', () => {
			expect(parse('something went wrong')).toBeNull();
		});
	});

	describe('buildSessionName', () => {
		const build = (repo: string, grove?: string, worktree?: string): string =>
			(
				service as unknown as {
					buildSessionName(r: string, g?: string, w?: string): string;
				}
			).buildSessionName(repo, grove, worktree);

		it('joins grove and worktree names', () => {
			expect(build('/repos/app', 'my-grove', 'frontend')).toBe('my-grove/frontend');
		});

		it('falls back to the repo basename when no worktree name', () => {
			expect(build('/repos/app', 'my-grove')).toBe('my-grove/app');
		});

		it('uses the name once when grove and worktree names are identical', () => {
			expect(build('/repos/app', 'my-grove', 'my-grove')).toBe('my-grove');
		});

		it('truncates to 60 characters', () => {
			const long = 'g'.repeat(80);
			expect(build('/repos/app', long, 'wt').length).toBe(60);
		});
	});

	describe('isBackgroundSessionAlive', () => {
		const originalConfigDir = process.env.CLAUDE_CONFIG_DIR;

		afterEach(() => {
			if (originalConfigDir === undefined) {
				delete process.env.CLAUDE_CONFIG_DIR;
			} else {
				process.env.CLAUDE_CONFIG_DIR = originalConfigDir;
			}
		});

		it('returns true when the session jobs directory exists', () => {
			process.env.CLAUDE_CONFIG_DIR = '/home/test/.claude';
			vol.mkdirSync('/home/test/.claude/jobs/abc123', { recursive: true });

			expect(service.isBackgroundSessionAlive('abc123')).toBe(true);
		});

		it('returns false when the session jobs directory is missing', () => {
			process.env.CLAUDE_CONFIG_DIR = '/home/test/.claude';
			expect(service.isBackgroundSessionAlive('missing')).toBe(false);
		});

		it('returns false for an empty session id', () => {
			expect(service.isBackgroundSessionAlive('')).toBe(false);
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

	describe('detectAvailableTerminals', () => {
		beforeEach(() => {
			commandState.installed = new Set();
		});

		it('returns both terminals when konsole and kitty are installed', async () => {
			commandState.installed = new Set(['konsole', 'kitty']);
			await expect(service.detectAvailableTerminals()).resolves.toEqual(['konsole', 'kitty']);
		});

		it('returns only the installed terminals', async () => {
			commandState.installed = new Set(['kitty']);
			await expect(service.detectAvailableTerminals()).resolves.toEqual(['kitty']);
		});

		it('returns an empty list when neither is installed', async () => {
			await expect(service.detectAvailableTerminals()).resolves.toEqual([]);
		});

		it('detectTerminal returns the first available terminal', async () => {
			commandState.installed = new Set(['konsole', 'kitty']);
			await expect(service.detectTerminal()).resolves.toBe('konsole');
		});

		it('detectTerminal returns null when none are installed', async () => {
			await expect(service.detectTerminal()).resolves.toBeNull();
		});
	});
});

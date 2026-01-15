import { Volume } from 'memfs';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFile, createMockFs, setupMockHomeDir } from '../../__tests__/helpers.js';
import type { GroveRepoConfig, Settings } from '../../storage/types.js';
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
	execSync: vi.fn().mockImplementation((cmd: string) => {
		// Simulate 'which' command - return success for known commands
		if (cmd === 'which konsole' || cmd === 'which kitty' || cmd === 'which claude') {
			return '/usr/bin/mock';
		}
		throw new Error('Command not found');
	}),
	spawn: vi.fn().mockReturnValue({
		on: vi.fn(),
		unref: vi.fn(),
	}),
}));

describe('ClaudeSessionService', () => {
	let service: ClaudeSessionService;
	let mockSettingsService: ISettingsService;
	let mockGroveConfigService: IGroveConfigService;
	const homeDir = '/home/testuser';
	const repoPath = '/repos/test-repo';

	beforeEach(() => {
		// Create fresh in-memory filesystem
		const mockFs = createMockFs();
		vol = mockFs.vol;
		setupMockHomeDir(vol, homeDir);
		vol.mkdirSync(repoPath, { recursive: true });

		// Create mock settings service
		mockSettingsService = {
			readSettings: vi.fn().mockReturnValue({
				workingFolder: '/home/testuser/groves',
			} as Settings),
			updateSettings: vi.fn(),
			getStorageConfig: vi.fn().mockReturnValue({
				groveFolder: path.join(homeDir, '.grove'),
				settingsPath: path.join(homeDir, '.grove', 'settings.json'),
				repositoriesPath: path.join(homeDir, '.grove', 'repositories.json'),
				grovesIndexPath: path.join(homeDir, '.grove', 'groves.json'),
				recentSelectionsPath: path.join(homeDir, '.grove', 'recent.json'),
				sessionsPath: path.join(homeDir, '.grove', 'sessions.json'),
			}),
		};

		// Create mock grove config service
		mockGroveConfigService = {
			readGroveRepoConfig: vi.fn().mockReturnValue({} as GroveRepoConfig),
			readGroveLocalConfig: vi.fn().mockReturnValue({}),
			getMergedConfig: vi.fn().mockReturnValue({}),
		};

		service = new ClaudeSessionService(mockSettingsService, mockGroveConfigService);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('getEffectiveTemplate', () => {
		it('should return default template when no custom template is set', () => {
			const template = service.getEffectiveTemplate('konsole');

			expect(template).toContain('title: Claude');
			expect(template).toContain('${WORKING_DIR}');
		});

		it('should return custom template when set with string content', () => {
			const customTemplate = 'custom template content';
			vi.mocked(mockSettingsService.readSettings).mockReturnValue({
				workingFolder: '/home/testuser/groves',
				claudeSessionTemplates: {
					konsole: { content: customTemplate },
				},
			} as Settings);

			const template = service.getEffectiveTemplate('konsole');

			expect(template).toBe(customTemplate);
		});

		it('should normalize array content to string by joining with newlines', () => {
			const arrayContent = ['line 1', 'line 2', 'line 3'];
			vi.mocked(mockSettingsService.readSettings).mockReturnValue({
				workingFolder: '/home/testuser/groves',
				claudeSessionTemplates: {
					konsole: { content: arrayContent },
				},
			} as Settings);

			const template = service.getEffectiveTemplate('konsole');

			expect(template).toBe('line 1\nline 2\nline 3');
		});

		it('should handle empty array content', () => {
			vi.mocked(mockSettingsService.readSettings).mockReturnValue({
				workingFolder: '/home/testuser/groves',
				claudeSessionTemplates: {
					konsole: { content: [] },
				},
			} as Settings);

			const template = service.getEffectiveTemplate('konsole');

			expect(template).toBe('');
		});

		it('should handle single-element array content', () => {
			vi.mocked(mockSettingsService.readSettings).mockReturnValue({
				workingFolder: '/home/testuser/groves',
				claudeSessionTemplates: {
					kitty: { content: ['single line'] },
				},
			} as Settings);

			const template = service.getEffectiveTemplate('kitty');

			expect(template).toBe('single line');
		});
	});

	describe('getTemplateForRepo', () => {
		it('should return template from repo config with string content', () => {
			const repoTemplate = 'repo specific template';
			vi.mocked(mockGroveConfigService.readGroveRepoConfig).mockReturnValue({
				claudeSessionTemplates: {
					konsole: { content: repoTemplate },
				},
			} as GroveRepoConfig);

			const template = service.getTemplateForRepo('konsole', repoPath);

			expect(template).toBe(repoTemplate);
		});

		it('should normalize array content from repo config', () => {
			vi.mocked(mockGroveConfigService.readGroveRepoConfig).mockReturnValue({
				claudeSessionTemplates: {
					kitty: { content: ['layout tall', 'cd ${WORKING_DIR}', 'launch --title "claude" claude'] },
				},
			} as GroveRepoConfig);

			const template = service.getTemplateForRepo('kitty', repoPath);

			expect(template).toBe('layout tall\ncd ${WORKING_DIR}\nlaunch --title "claude" claude');
		});

		it('should normalize array content from project-level config', () => {
			const projectPath = 'packages/my-app';
			const fullProjectPath = path.join(repoPath, projectPath);
			vol.mkdirSync(fullProjectPath, { recursive: true });

			// Create project-level .grove.json with array content
			const projectConfig = {
				claudeSessionTemplates: {
					konsole: {
						content: ['title: Project Claude', 'workdir: ${WORKING_DIR}', 'command: claude'],
					},
				},
			};
			createFile(vol, path.join(fullProjectPath, '.grove.json'), JSON.stringify(projectConfig));

			const template = service.getTemplateForRepo('konsole', repoPath, projectPath);

			expect(template).toBe('title: Project Claude\nworkdir: ${WORKING_DIR}\ncommand: claude');
		});

		it('should fall back to settings template when repo has no template', () => {
			const settingsTemplate = 'settings template content';
			vi.mocked(mockSettingsService.readSettings).mockReturnValue({
				workingFolder: '/home/testuser/groves',
				claudeSessionTemplates: {
					konsole: { content: settingsTemplate },
				},
			} as Settings);
			vi.mocked(mockGroveConfigService.readGroveRepoConfig).mockReturnValue({});

			const template = service.getTemplateForRepo('konsole', repoPath);

			expect(template).toBe(settingsTemplate);
		});

		it('should fall back to default template when no custom template exists', () => {
			vi.mocked(mockGroveConfigService.readGroveRepoConfig).mockReturnValue({});

			const template = service.getTemplateForRepo('kitty', repoPath);

			expect(template).toContain('layout tall');
			expect(template).toContain('${WORKING_DIR}');
		});
	});

	describe('getDefaultTemplate', () => {
		it('should return konsole default template', () => {
			const template = service.getDefaultTemplate('konsole');

			expect(template).toContain('title: Claude');
			expect(template).toContain('${WORKING_DIR}');
			expect(template).toContain('${AGENT_COMMAND}');
		});

		it('should return kitty default template', () => {
			const template = service.getDefaultTemplate('kitty');

			expect(template).toContain('layout tall');
			expect(template).toContain('cd ${WORKING_DIR}');
			expect(template).toContain('launch --title "claude"');
		});
	});

	describe('applyTemplate', () => {
		it('should replace ${WORKING_DIR} placeholder', () => {
			const template = 'cd ${WORKING_DIR} && run command';
			const result = service.applyTemplate(template, '/my/working/dir');

			expect(result).toBe('cd /my/working/dir && run command');
		});

		it('should replace ${AGENT_COMMAND} placeholder', () => {
			const template = 'launch ${AGENT_COMMAND}';
			const result = service.applyTemplate(template, '/dir', 'claude --resume abc123');

			expect(result).toBe('launch claude --resume abc123');
		});

		it('should replace multiple occurrences of placeholders', () => {
			const template = '${WORKING_DIR} and ${WORKING_DIR} with ${AGENT_COMMAND}';
			const result = service.applyTemplate(template, '/path', 'claude');

			expect(result).toBe('/path and /path with claude');
		});

		it('should use default agent command when not specified', () => {
			const template = 'run ${AGENT_COMMAND}';
			const result = service.applyTemplate(template, '/dir');

			expect(result).toBe('run claude');
		});
	});
});

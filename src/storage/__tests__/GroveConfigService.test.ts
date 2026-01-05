import * as fs from 'fs';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	cleanupTempDir,
	createMockGroveConfig,
	createTempDir,
} from '../../__tests__/helpers.js';
import { GroveConfigService } from '../GroveConfigService.js';
import type { GroveRepoConfig } from '../types.js';

describe('GroveConfigService', () => {
	let service: GroveConfigService;
	let tempDir: string;
	let repoPath: string;

	beforeEach(() => {
		service = new GroveConfigService();
		tempDir = createTempDir();
		repoPath = path.join(tempDir, 'test-repo');
		fs.mkdirSync(repoPath);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		cleanupTempDir(tempDir);
	});

	describe('readGroveRepoConfig', () => {
		it('should return empty config if no .grove.json exists', () => {
			const config = service.readGroveRepoConfig(repoPath);

			expect(config).toEqual({});
		});

		it('should read .grove.json if it exists', () => {
			const groveConfig: GroveRepoConfig = {
				branchNameTemplate: 'custom/${GROVE_NAME}',
				fileCopyPatterns: ['*.md'],
			};

			createMockGroveConfig(repoPath, groveConfig);

			const config = service.readGroveRepoConfig(repoPath);

			expect(config.branchNameTemplate).toBe('custom/${GROVE_NAME}');
			expect(config.fileCopyPatterns).toEqual(['*.md']);
		});

		it('should merge .grove.local.json over .grove.json', () => {
			const groveConfig: GroveRepoConfig = {
				branchNameTemplate: 'custom/${GROVE_NAME}',
			};

			const localConfig: GroveRepoConfig = {
				branchNameTemplate: 'local/${GROVE_NAME}',
			};

			createMockGroveConfig(repoPath, groveConfig);
			fs.writeFileSync(
				path.join(repoPath, '.grove.local.json'),
				JSON.stringify(localConfig, null, 2),
			);

			const config = service.readGroveRepoConfig(repoPath);

			expect(config.branchNameTemplate).toBe('local/${GROVE_NAME}');
		});

		it('should merge fileCopyPatterns arrays without duplicates', () => {
			const groveConfig: GroveRepoConfig = {
				fileCopyPatterns: ['*.md', '*.txt'],
			};

			const localConfig: GroveRepoConfig = {
				fileCopyPatterns: ['*.txt', '*.json'],
			};

			createMockGroveConfig(repoPath, groveConfig);
			fs.writeFileSync(
				path.join(repoPath, '.grove.local.json'),
				JSON.stringify(localConfig, null, 2),
			);

			const config = service.readGroveRepoConfig(repoPath);

			expect(config.fileCopyPatterns).toEqual(['*.md', '*.txt', '*.json']);
		});

		it('should handle parse errors gracefully', () => {
			fs.writeFileSync(path.join(repoPath, '.grove.json'), 'invalid json {');

			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			const config = service.readGroveRepoConfig(repoPath);

			expect(config).toEqual({});
			expect(consoleErrorSpy).toHaveBeenCalled();

			consoleErrorSpy.mockRestore();
		});
	});

	describe('validateBranchNameTemplate', () => {
		it('should return true for valid template with ${GROVE_NAME}', () => {
			const isValid = service.validateBranchNameTemplate('grove/${GROVE_NAME}');

			expect(isValid).toBe(true);
		});

		it('should return true for template with multiple ${GROVE_NAME}', () => {
			const isValid = service.validateBranchNameTemplate(
				'${GROVE_NAME}/${GROVE_NAME}-branch',
			);

			expect(isValid).toBe(true);
		});

		it('should return false for template without ${GROVE_NAME}', () => {
			const isValid = service.validateBranchNameTemplate('custom-branch');

			expect(isValid).toBe(false);
		});
	});

	describe('applyBranchNameTemplate', () => {
		it('should replace ${GROVE_NAME} with normalized grove name', () => {
			const result = service.applyBranchNameTemplate('grove/${GROVE_NAME}', 'My Grove');

			expect(result).toBe('grove/my-grove');
		});

		it('should lowercase and replace spaces with hyphens', () => {
			const result = service.applyBranchNameTemplate('${GROVE_NAME}', 'Test Grove Name');

			expect(result).toBe('test-grove-name');
		});

		it('should replace multiple occurrences of ${GROVE_NAME}', () => {
			const result = service.applyBranchNameTemplate(
				'${GROVE_NAME}/${GROVE_NAME}-branch',
				'Feature',
			);

			expect(result).toBe('feature/feature-branch');
		});

		it('should handle multiple spaces', () => {
			const result = service.applyBranchNameTemplate('grove/${GROVE_NAME}', 'Test  Multiple  Spaces');

			expect(result).toBe('grove/test-multiple-spaces');
		});
	});

	describe('getBranchNameForRepo', () => {
		it('should return default branch name if no config', () => {
			const branch = service.getBranchNameForRepo(repoPath, 'My Grove');

			expect(branch).toBe('grove/my-grove');
		});

		it('should use custom template from config', () => {
			const groveConfig: GroveRepoConfig = {
				branchNameTemplate: 'custom/${GROVE_NAME}',
			};

			createMockGroveConfig(repoPath, groveConfig);

			const branch = service.getBranchNameForRepo(repoPath, 'My Grove');

			expect(branch).toBe('custom/my-grove');
		});

		it('should fall back to default for invalid template', () => {
			const groveConfig: GroveRepoConfig = {
				branchNameTemplate: 'no-placeholder',
			};

			createMockGroveConfig(repoPath, groveConfig);

			const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			const branch = service.getBranchNameForRepo(repoPath, 'My Grove');

			expect(branch).toBe('grove/my-grove');
			expect(consoleWarnSpy).toHaveBeenCalled();

			consoleWarnSpy.mockRestore();
		});
	});

	describe('readMergedConfig', () => {
		it('should return root config only when no project path', () => {
			const groveConfig: GroveRepoConfig = {
				branchNameTemplate: 'root/${GROVE_NAME}',
				fileCopyPatterns: ['*.md'],
			};

			createMockGroveConfig(repoPath, groveConfig);

			const merged = service.readMergedConfig(repoPath);

			expect(merged.branchNameTemplate).toBe('root/${GROVE_NAME}');
			expect(merged.rootFileCopyPatterns).toEqual(['*.md']);
			expect(merged.projectFileCopyPatterns).toEqual([]);
		});

		it('should merge project config over root config', () => {
			const rootConfig: GroveRepoConfig = {
				branchNameTemplate: 'root/${GROVE_NAME}',
				fileCopyPatterns: ['*.md'],
			};

			const projectPath = 'packages/app';
			const projectConfigPath = path.join(repoPath, projectPath);
			fs.mkdirSync(projectConfigPath, { recursive: true });

			createMockGroveConfig(repoPath, rootConfig);

			const projectConfig: GroveRepoConfig = {
				branchNameTemplate: 'project/${GROVE_NAME}',
				fileCopyPatterns: ['*.json'],
			};

			createMockGroveConfig(projectConfigPath, projectConfig);

			const merged = service.readMergedConfig(repoPath, projectPath);

			expect(merged.branchNameTemplate).toBe('project/${GROVE_NAME}');
			expect(merged.rootFileCopyPatterns).toEqual(['*.md']);
			expect(merged.projectFileCopyPatterns).toEqual(['*.json']);
		});

		it('should keep root branch template if project does not specify one', () => {
			const rootConfig: GroveRepoConfig = {
				branchNameTemplate: 'root/${GROVE_NAME}',
			};

			const projectPath = 'packages/app';
			const projectConfigPath = path.join(repoPath, projectPath);
			fs.mkdirSync(projectConfigPath, { recursive: true });

			createMockGroveConfig(repoPath, rootConfig);

			const projectConfig: GroveRepoConfig = {
				fileCopyPatterns: ['*.json'],
			};

			createMockGroveConfig(projectConfigPath, projectConfig);

			const merged = service.readMergedConfig(repoPath, projectPath);

			expect(merged.branchNameTemplate).toBe('root/${GROVE_NAME}');
		});

		it('should handle project IDE override', () => {
			const rootConfig: GroveRepoConfig = {
				ide: '@vscode',
			};

			const projectPath = 'packages/app';
			const projectConfigPath = path.join(repoPath, projectPath);
			fs.mkdirSync(projectConfigPath, { recursive: true });

			createMockGroveConfig(repoPath, rootConfig);

			const projectConfig: GroveRepoConfig = {
				ide: '@phpstorm',
			};

			createMockGroveConfig(projectConfigPath, projectConfig);

			const merged = service.readMergedConfig(repoPath, projectPath);

			expect(merged.ide).toBe('@phpstorm');
		});
	});

	describe('getBranchNameForSelection', () => {
		it('should return default branch for selection without project', () => {
			const branch = service.getBranchNameForSelection(repoPath, 'My Grove');

			expect(branch).toBe('grove/my-grove');
		});

		it('should use merged config for selection with project', () => {
			const rootConfig: GroveRepoConfig = {
				branchNameTemplate: 'root/${GROVE_NAME}',
			};

			const projectPath = 'packages/app';
			const projectConfigPath = path.join(repoPath, projectPath);
			fs.mkdirSync(projectConfigPath, { recursive: true });

			createMockGroveConfig(repoPath, rootConfig);

			const projectConfig: GroveRepoConfig = {
				branchNameTemplate: 'project/${GROVE_NAME}',
			};

			createMockGroveConfig(projectConfigPath, projectConfig);

			const branch = service.getBranchNameForSelection(repoPath, 'My Grove', projectPath);

			expect(branch).toBe('project/my-grove');
		});
	});

	describe('isIDEReference', () => {
		it('should return true for IDE reference strings', () => {
			expect(service.isIDEReference('@vscode')).toBe(true);
			expect(service.isIDEReference('@phpstorm')).toBe(true);
		});

		it('should return false for IDE config objects', () => {
			const config = { command: 'code', args: ['{{path}}'] };
			expect(service.isIDEReference(config)).toBe(false);
		});

		it('should return false for strings not starting with @', () => {
			expect(service.isIDEReference('vscode' as '@vscode')).toBe(false);
		});
	});

	describe('parseIDEReference', () => {
		it('should parse IDE reference and return type', () => {
			expect(service.parseIDEReference('@vscode')).toBe('vscode');
			expect(service.parseIDEReference('@phpstorm')).toBe('phpstorm');
		});
	});

	describe('getIDEConfigForSelection', () => {
		it('should return undefined if no IDE config', () => {
			const result = service.getIDEConfigForSelection(repoPath);

			expect(result).toBeUndefined();
		});

		it('should return ideType for reference config', () => {
			const groveConfig: GroveRepoConfig = {
				ide: '@vscode',
			};

			createMockGroveConfig(repoPath, groveConfig);

			const result = service.getIDEConfigForSelection(repoPath);

			expect(result).toEqual({ ideType: 'vscode' });
		});

		it('should return ideConfig for custom config', () => {
			const customConfig = { command: 'code', args: ['{{path}}'] };
			const groveConfig: GroveRepoConfig = {
				ide: customConfig,
			};

			createMockGroveConfig(repoPath, groveConfig);

			const result = service.getIDEConfigForSelection(repoPath);

			expect(result).toEqual({ ideConfig: customConfig });
		});

		it('should use project IDE config over root', () => {
			const rootConfig: GroveRepoConfig = {
				ide: '@vscode',
			};

			const projectPath = 'packages/app';
			const projectConfigPath = path.join(repoPath, projectPath);
			fs.mkdirSync(projectConfigPath, { recursive: true });

			createMockGroveConfig(repoPath, rootConfig);

			const projectConfig: GroveRepoConfig = {
				ide: '@phpstorm',
			};

			createMockGroveConfig(projectConfigPath, projectConfig);

			const result = service.getIDEConfigForSelection(repoPath, projectPath);

			expect(result).toEqual({ ideType: 'phpstorm' });
		});
	});
});

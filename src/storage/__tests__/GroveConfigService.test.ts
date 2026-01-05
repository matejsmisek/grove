import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Volume } from 'memfs';

import { createMockFs } from '../../__tests__/helpers.js';
import { GroveConfigService } from '../GroveConfigService.js';
import type { GroveRepoConfig } from '../types.js';

// Mock filesystem
let vol: Volume;

vi.mock('fs', () => {
	return {
		default: new Proxy({}, {
			get(_target, prop) {
				return vol?.[prop as keyof Volume];
			},
		}),
		...Object.fromEntries(
			Object.getOwnPropertyNames(Volume.prototype)
				.filter(key => key !== 'constructor')
				.map(key => [key, (...args: unknown[]) => vol?.[key as keyof Volume]?.(...args)])
		),
	};
});

describe('GroveConfigService', () => {
	let service: GroveConfigService;
	let repoPath: string;

	beforeEach(() => {
		// Create fresh in-memory filesystem
		const mockFs = createMockFs();
		vol = mockFs.vol;

		service = new GroveConfigService();
		repoPath = '/test-repo';
		vol.mkdirSync(repoPath, { recursive: true });
	});

	afterEach(() => {
		vi.restoreAllMocks();
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

			vol.writeFileSync(
				path.join(repoPath, '.grove.json'),
				JSON.stringify(groveConfig, null, 2),
			);

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

			vol.writeFileSync(
				path.join(repoPath, '.grove.json'),
				JSON.stringify(groveConfig, null, 2),
			);
			vol.writeFileSync(
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

			vol.writeFileSync(
				path.join(repoPath, '.grove.json'),
				JSON.stringify(groveConfig, null, 2),
			);
			vol.writeFileSync(
				path.join(repoPath, '.grove.local.json'),
				JSON.stringify(localConfig, null, 2),
			);

			const config = service.readGroveRepoConfig(repoPath);

			expect(config.fileCopyPatterns).toEqual(['*.md', '*.txt', '*.json']);
		});

		it('should handle parse errors gracefully', () => {
			vol.writeFileSync(path.join(repoPath, '.grove.json'), 'invalid json {');

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
		it('should replace ${GROVE_NAME} with grove name', () => {
			// Grove name should already be normalized before passing to this function
			const result = service.applyBranchNameTemplate('grove/${GROVE_NAME}', 'my-grove-abc12');

			expect(result).toBe('grove/my-grove-abc12');
		});

		it('should handle grove names as-is (normalization happens elsewhere)', () => {
			// This function no longer normalizes - it expects normalized input
			const result = service.applyBranchNameTemplate('${GROVE_NAME}', 'test-grove-name-xyz78');

			expect(result).toBe('test-grove-name-xyz78');
		});

		it('should replace multiple occurrences of ${GROVE_NAME}', () => {
			const result = service.applyBranchNameTemplate(
				'${GROVE_NAME}/${GROVE_NAME}-branch',
				'feature-abc12',
			);

			expect(result).toBe('feature-abc12/feature-abc12-branch');
		});

		it('should preserve the grove name exactly as provided', () => {
			// No normalization happens in this function
			const result = service.applyBranchNameTemplate('grove/${GROVE_NAME}', 'my-special-grove-12345');

			expect(result).toBe('grove/my-special-grove-12345');
		});
	});

	describe('getBranchNameForRepo', () => {
		it('should return default branch name if no config', () => {
			// Grove name should already be normalized
			const branch = service.getBranchNameForRepo(repoPath, 'my-grove-abc12');

			expect(branch).toBe('grove/my-grove-abc12');
		});

		it('should use custom template from config', () => {
			const groveConfig: GroveRepoConfig = {
				branchNameTemplate: 'custom/${GROVE_NAME}',
			};

			vol.writeFileSync(
				path.join(repoPath, '.grove.json'),
				JSON.stringify(groveConfig, null, 2),
			);

			const branch = service.getBranchNameForRepo(repoPath, 'my-grove-abc12');

			expect(branch).toBe('custom/my-grove-abc12');
		});

		it('should fall back to default for invalid template', () => {
			const groveConfig: GroveRepoConfig = {
				branchNameTemplate: 'no-placeholder',
			};

			vol.writeFileSync(
				path.join(repoPath, '.grove.json'),
				JSON.stringify(groveConfig, null, 2),
			);

			const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			const branch = service.getBranchNameForRepo(repoPath, 'my-grove-abc12');

			expect(branch).toBe('grove/my-grove-abc12');
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

			vol.writeFileSync(
				path.join(repoPath, '.grove.json'),
				JSON.stringify(groveConfig, null, 2),
			);

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
			vol.mkdirSync(projectConfigPath, { recursive: true });

			vol.writeFileSync(
				path.join(repoPath, '.grove.json'),
				JSON.stringify(rootConfig, null, 2),
			);

			const projectConfig: GroveRepoConfig = {
				branchNameTemplate: 'project/${GROVE_NAME}',
				fileCopyPatterns: ['*.json'],
			};

			vol.writeFileSync(
				path.join(projectConfigPath, '.grove.json'),
				JSON.stringify(projectConfig, null, 2),
			);

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
			vol.mkdirSync(projectConfigPath, { recursive: true });

			vol.writeFileSync(
				path.join(repoPath, '.grove.json'),
				JSON.stringify(rootConfig, null, 2),
			);

			const projectConfig: GroveRepoConfig = {
				fileCopyPatterns: ['*.json'],
			};

			vol.writeFileSync(
				path.join(projectConfigPath, '.grove.json'),
				JSON.stringify(projectConfig, null, 2),
			);

			const merged = service.readMergedConfig(repoPath, projectPath);

			expect(merged.branchNameTemplate).toBe('root/${GROVE_NAME}');
		});

		it('should handle project IDE override', () => {
			const rootConfig: GroveRepoConfig = {
				ide: '@vscode',
			};

			const projectPath = 'packages/app';
			const projectConfigPath = path.join(repoPath, projectPath);
			vol.mkdirSync(projectConfigPath, { recursive: true });

			vol.writeFileSync(
				path.join(repoPath, '.grove.json'),
				JSON.stringify(rootConfig, null, 2),
			);

			const projectConfig: GroveRepoConfig = {
				ide: '@phpstorm',
			};

			vol.writeFileSync(
				path.join(projectConfigPath, '.grove.json'),
				JSON.stringify(projectConfig, null, 2),
			);

			const merged = service.readMergedConfig(repoPath, projectPath);

			expect(merged.ide).toBe('@phpstorm');
		});
	});

	describe('getBranchNameForSelection', () => {
		it('should return default branch for selection without project', () => {
			// Grove name should already be normalized
			const branch = service.getBranchNameForSelection(repoPath, 'my-grove-abc12');

			expect(branch).toBe('grove/my-grove-abc12');
		});

		it('should use merged config for selection with project', () => {
			const rootConfig: GroveRepoConfig = {
				branchNameTemplate: 'root/${GROVE_NAME}',
			};

			const projectPath = 'packages/app';
			const projectConfigPath = path.join(repoPath, projectPath);
			vol.mkdirSync(projectConfigPath, { recursive: true });

			vol.writeFileSync(
				path.join(repoPath, '.grove.json'),
				JSON.stringify(rootConfig, null, 2),
			);

			const projectConfig: GroveRepoConfig = {
				branchNameTemplate: 'project/${GROVE_NAME}',
			};

			vol.writeFileSync(
				path.join(projectConfigPath, '.grove.json'),
				JSON.stringify(projectConfig, null, 2),
			);

			const branch = service.getBranchNameForSelection(repoPath, 'my-grove-abc12', projectPath);

			expect(branch).toBe('project/my-grove-abc12');
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

			vol.writeFileSync(
				path.join(repoPath, '.grove.json'),
				JSON.stringify(groveConfig, null, 2),
			);

			const result = service.getIDEConfigForSelection(repoPath);

			expect(result).toEqual({ ideType: 'vscode' });
		});

		it('should return ideConfig for custom config', () => {
			const customConfig = { command: 'code', args: ['{{path}}'] };
			const groveConfig: GroveRepoConfig = {
				ide: customConfig,
			};

			vol.writeFileSync(
				path.join(repoPath, '.grove.json'),
				JSON.stringify(groveConfig, null, 2),
			);

			const result = service.getIDEConfigForSelection(repoPath);

			expect(result).toEqual({ ideConfig: customConfig });
		});

		it('should use project IDE config over root', () => {
			const rootConfig: GroveRepoConfig = {
				ide: '@vscode',
			};

			const projectPath = 'packages/app';
			const projectConfigPath = path.join(repoPath, projectPath);
			vol.mkdirSync(projectConfigPath, { recursive: true });

			vol.writeFileSync(
				path.join(repoPath, '.grove.json'),
				JSON.stringify(rootConfig, null, 2),
			);

			const projectConfig: GroveRepoConfig = {
				ide: '@phpstorm',
			};

			vol.writeFileSync(
				path.join(projectConfigPath, '.grove.json'),
				JSON.stringify(projectConfig, null, 2),
			);

			const result = service.getIDEConfigForSelection(repoPath, projectPath);

			expect(result).toEqual({ ideType: 'phpstorm' });
		});
	});
});

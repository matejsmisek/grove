import { Volume } from 'memfs';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockFs } from '../../__tests__/helpers.js';
import { GroveConfigService, getPatternString } from '../GroveConfigService.js';
import { clearJsonFileCache } from '../jsonFileCache.js';
import type { GroveRepoConfig } from '../types.js';

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

describe('GroveConfigService', () => {
	let service: GroveConfigService;
	let repoPath: string;

	beforeEach(() => {
		// Create fresh in-memory filesystem
		const mockFs = createMockFs();
		vol = mockFs.vol;

		// Reset the process-wide mtime cache so cases don't leak parsed data.
		clearJsonFileCache();

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

			vol.writeFileSync(path.join(repoPath, '.grove.json'), JSON.stringify(groveConfig, null, 2));

			const config = service.readGroveRepoConfig(repoPath);

			expect(config.branchNameTemplate).toBe('custom/${GROVE_NAME}');
			expect(config.fileCopyPatterns).toEqual(['*.md']);
		});

		it('should read promptTemplate from .grove.json', () => {
			vol.writeFileSync(
				path.join(repoPath, '.grove.json'),
				JSON.stringify({ promptTemplate: 'Work on {prompt} please' }, null, 2)
			);

			const config = service.readGroveRepoConfig(repoPath);

			expect(config.promptTemplate).toBe('Work on {prompt} please');
		});

		it('should let .grove.local.json override promptTemplate', () => {
			vol.writeFileSync(
				path.join(repoPath, '.grove.json'),
				JSON.stringify({ promptTemplate: 'shared {prompt}' }, null, 2)
			);
			vol.writeFileSync(
				path.join(repoPath, '.grove.local.json'),
				JSON.stringify({ promptTemplate: 'local {prompt}' }, null, 2)
			);

			const config = service.readGroveRepoConfig(repoPath);

			expect(config.promptTemplate).toBe('local {prompt}');
		});

		it('should merge .grove.local.json over .grove.json', () => {
			const groveConfig: GroveRepoConfig = {
				branchNameTemplate: 'custom/${GROVE_NAME}',
			};

			const localConfig: GroveRepoConfig = {
				branchNameTemplate: 'local/${GROVE_NAME}',
			};

			vol.writeFileSync(path.join(repoPath, '.grove.json'), JSON.stringify(groveConfig, null, 2));
			vol.writeFileSync(
				path.join(repoPath, '.grove.local.json'),
				JSON.stringify(localConfig, null, 2)
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

			vol.writeFileSync(path.join(repoPath, '.grove.json'), JSON.stringify(groveConfig, null, 2));
			vol.writeFileSync(
				path.join(repoPath, '.grove.local.json'),
				JSON.stringify(localConfig, null, 2)
			);

			const config = service.readGroveRepoConfig(repoPath);

			expect(config.fileCopyPatterns).toEqual(['*.md', '*.txt', '*.json']);
		});

		it('should read fileCopyPatterns with tuple entries', () => {
			const groveConfig: GroveRepoConfig = {
				fileCopyPatterns: ['*.md', ['*.json', 'link']],
			};

			vol.writeFileSync(path.join(repoPath, '.grove.json'), JSON.stringify(groveConfig, null, 2));

			const config = service.readGroveRepoConfig(repoPath);

			expect(config.fileCopyPatterns).toEqual(['*.md', ['*.json', 'link']]);
		});

		it('should deduplicate mixed string and tuple entries by glob pattern', () => {
			const groveConfig: GroveRepoConfig = {
				fileCopyPatterns: ['*.md', '*.txt'],
			};

			const localConfig: GroveRepoConfig = {
				fileCopyPatterns: [['*.txt', 'link'], '*.json'],
			};

			vol.writeFileSync(path.join(repoPath, '.grove.json'), JSON.stringify(groveConfig, null, 2));
			vol.writeFileSync(
				path.join(repoPath, '.grove.local.json'),
				JSON.stringify(localConfig, null, 2)
			);

			const config = service.readGroveRepoConfig(repoPath);

			// *.txt from root should be overridden by ['*.txt', 'link'] from local
			expect(config.fileCopyPatterns).toEqual(['*.md', ['*.txt', 'link'], '*.json']);
		});

		it('should allow local config to override link mode back to copy', () => {
			const groveConfig: GroveRepoConfig = {
				fileCopyPatterns: [['*.txt', 'link']],
			};

			const localConfig: GroveRepoConfig = {
				fileCopyPatterns: ['*.txt'],
			};

			vol.writeFileSync(path.join(repoPath, '.grove.json'), JSON.stringify(groveConfig, null, 2));
			vol.writeFileSync(
				path.join(repoPath, '.grove.local.json'),
				JSON.stringify(localConfig, null, 2)
			);

			const config = service.readGroveRepoConfig(repoPath);

			// Local '*.txt' (copy mode) overrides root ['*.txt', 'link']
			expect(config.fileCopyPatterns).toEqual(['*.txt']);
		});

		it('should handle parse errors gracefully', () => {
			vol.writeFileSync(path.join(repoPath, '.grove.json'), 'invalid json {');

			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			const config = service.readGroveRepoConfig(repoPath);

			expect(config).toEqual({});
			expect(consoleErrorSpy).toHaveBeenCalled();

			consoleErrorSpy.mockRestore();
		});

		it('reflects changes written via writeGroveConfig (cache invalidation)', () => {
			service.writeGroveConfig(repoPath, { branchNameTemplate: 'first/${GROVE_NAME}' });
			// Populate the cache.
			expect(service.readGroveRepoConfig(repoPath).branchNameTemplate).toBe('first/${GROVE_NAME}');

			// Re-write and confirm the next read is not served stale from cache.
			service.writeGroveConfig(repoPath, { branchNameTemplate: 'second/${GROVE_NAME}' });
			expect(service.readGroveRepoConfig(repoPath).branchNameTemplate).toBe('second/${GROVE_NAME}');
		});
	});

	describe('validateBranchNameTemplate', () => {
		it('should return true for valid template with ${GROVE_NAME}', () => {
			const isValid = service.validateBranchNameTemplate('grove/${GROVE_NAME}');

			expect(isValid).toBe(true);
		});

		it('should return true for template with multiple ${GROVE_NAME}', () => {
			const isValid = service.validateBranchNameTemplate('${GROVE_NAME}/${GROVE_NAME}-branch');

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
				'feature-abc12'
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

			vol.writeFileSync(path.join(repoPath, '.grove.json'), JSON.stringify(groveConfig, null, 2));

			const branch = service.getBranchNameForRepo(repoPath, 'my-grove-abc12');

			expect(branch).toBe('custom/my-grove-abc12');
		});

		it('should fall back to default for invalid template', () => {
			const groveConfig: GroveRepoConfig = {
				branchNameTemplate: 'no-placeholder',
			};

			vol.writeFileSync(path.join(repoPath, '.grove.json'), JSON.stringify(groveConfig, null, 2));

			const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			const branch = service.getBranchNameForRepo(repoPath, 'my-grove-abc12');

			expect(branch).toBe('grove/my-grove-abc12');
			expect(consoleWarnSpy).toHaveBeenCalled();

			consoleWarnSpy.mockRestore();
		});
	});

	describe('getPatternString', () => {
		it('should return the string for string entries', () => {
			expect(getPatternString('*.md')).toBe('*.md');
		});

		it('should return the first element for tuple entries', () => {
			expect(getPatternString(['*.json', 'link'])).toBe('*.json');
			expect(getPatternString(['*.txt', 'copy'])).toBe('*.txt');
		});
	});

	describe('readMergedConfig', () => {
		it('should return root config only when no project path', () => {
			const groveConfig: GroveRepoConfig = {
				branchNameTemplate: 'root/${GROVE_NAME}',
				fileCopyPatterns: ['*.md'],
			};

			vol.writeFileSync(path.join(repoPath, '.grove.json'), JSON.stringify(groveConfig, null, 2));

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

			vol.writeFileSync(path.join(repoPath, '.grove.json'), JSON.stringify(rootConfig, null, 2));

			const projectConfig: GroveRepoConfig = {
				branchNameTemplate: 'project/${GROVE_NAME}',
				fileCopyPatterns: ['*.json'],
			};

			vol.writeFileSync(
				path.join(projectConfigPath, '.grove.json'),
				JSON.stringify(projectConfig, null, 2)
			);

			const merged = service.readMergedConfig(repoPath, projectPath);

			expect(merged.branchNameTemplate).toBe('project/${GROVE_NAME}');
			expect(merged.rootFileCopyPatterns).toEqual(['*.md']);
			expect(merged.projectFileCopyPatterns).toEqual(['*.json']);
		});

		it('should handle tuple pattern entries in merged config', () => {
			const rootConfig: GroveRepoConfig = {
				fileCopyPatterns: ['*.md', ['*.env', 'link']],
			};

			const projectPath = 'packages/app';
			const projectConfigPath = path.join(repoPath, projectPath);
			vol.mkdirSync(projectConfigPath, { recursive: true });

			vol.writeFileSync(path.join(repoPath, '.grove.json'), JSON.stringify(rootConfig, null, 2));

			const projectConfig: GroveRepoConfig = {
				fileCopyPatterns: [['*.json', 'link']],
			};

			vol.writeFileSync(
				path.join(projectConfigPath, '.grove.json'),
				JSON.stringify(projectConfig, null, 2)
			);

			const merged = service.readMergedConfig(repoPath, projectPath);

			expect(merged.rootFileCopyPatterns).toEqual(['*.md', ['*.env', 'link']]);
			expect(merged.projectFileCopyPatterns).toEqual([['*.json', 'link']]);
		});

		it('should keep root branch template if project does not specify one', () => {
			const rootConfig: GroveRepoConfig = {
				branchNameTemplate: 'root/${GROVE_NAME}',
			};

			const projectPath = 'packages/app';
			const projectConfigPath = path.join(repoPath, projectPath);
			vol.mkdirSync(projectConfigPath, { recursive: true });

			vol.writeFileSync(path.join(repoPath, '.grove.json'), JSON.stringify(rootConfig, null, 2));

			const projectConfig: GroveRepoConfig = {
				fileCopyPatterns: ['*.json'],
			};

			vol.writeFileSync(
				path.join(projectConfigPath, '.grove.json'),
				JSON.stringify(projectConfig, null, 2)
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

			vol.writeFileSync(path.join(repoPath, '.grove.json'), JSON.stringify(rootConfig, null, 2));

			const projectConfig: GroveRepoConfig = {
				ide: '@phpstorm',
			};

			vol.writeFileSync(
				path.join(projectConfigPath, '.grove.json'),
				JSON.stringify(projectConfig, null, 2)
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

			vol.writeFileSync(path.join(repoPath, '.grove.json'), JSON.stringify(rootConfig, null, 2));

			const projectConfig: GroveRepoConfig = {
				branchNameTemplate: 'project/${GROVE_NAME}',
			};

			vol.writeFileSync(
				path.join(projectConfigPath, '.grove.json'),
				JSON.stringify(projectConfig, null, 2)
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

			vol.writeFileSync(path.join(repoPath, '.grove.json'), JSON.stringify(groveConfig, null, 2));

			const result = service.getIDEConfigForSelection(repoPath);

			expect(result).toEqual({ ideType: 'vscode' });
		});

		it('should return ideConfig for custom config', () => {
			const customConfig = { command: 'code', args: ['{{path}}'] };
			const groveConfig: GroveRepoConfig = {
				ide: customConfig,
			};

			vol.writeFileSync(path.join(repoPath, '.grove.json'), JSON.stringify(groveConfig, null, 2));

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

			vol.writeFileSync(path.join(repoPath, '.grove.json'), JSON.stringify(rootConfig, null, 2));

			const projectConfig: GroveRepoConfig = {
				ide: '@phpstorm',
			};

			vol.writeFileSync(
				path.join(projectConfigPath, '.grove.json'),
				JSON.stringify(projectConfig, null, 2)
			);

			const result = service.getIDEConfigForSelection(repoPath, projectPath);

			expect(result).toEqual({ ideType: 'phpstorm' });
		});
	});

	describe('getClaudeSessionTemplate', () => {
		const writeProjectConfig = (projectPath: string, config: GroveRepoConfig) => {
			const dir = path.join(repoPath, projectPath);
			vol.mkdirSync(dir, { recursive: true });
			vol.writeFileSync(path.join(dir, '.grove.json'), JSON.stringify(config, null, 2));
		};

		it('returns undefined when no template is configured', () => {
			expect(service.getClaudeSessionTemplate('konsole', repoPath)).toBeUndefined();
		});

		it('returns the repo-level template content', () => {
			const config: GroveRepoConfig = {
				claudeSessionTemplates: { konsole: { content: 'repo konsole' } },
			};
			vol.writeFileSync(path.join(repoPath, '.grove.json'), JSON.stringify(config, null, 2));

			expect(service.getClaudeSessionTemplate('konsole', repoPath)).toBe('repo konsole');
		});

		it('returns undefined for a terminal not configured at repo level', () => {
			const config: GroveRepoConfig = {
				claudeSessionTemplates: { konsole: { content: 'repo konsole' } },
			};
			vol.writeFileSync(path.join(repoPath, '.grove.json'), JSON.stringify(config, null, 2));

			expect(service.getClaudeSessionTemplate('kitty', repoPath)).toBeUndefined();
		});

		it('merges repo .grove.local.json over .grove.json', () => {
			vol.writeFileSync(
				path.join(repoPath, '.grove.json'),
				JSON.stringify({ claudeSessionTemplates: { kitty: { content: 'base kitty' } } }, null, 2)
			);
			vol.writeFileSync(
				path.join(repoPath, '.grove.local.json'),
				JSON.stringify({ claudeSessionTemplates: { kitty: { content: 'local kitty' } } }, null, 2)
			);

			expect(service.getClaudeSessionTemplate('kitty', repoPath)).toBe('local kitty');
		});

		it('prefers the project-level .grove.json over repo config', () => {
			vol.writeFileSync(
				path.join(repoPath, '.grove.json'),
				JSON.stringify({ claudeSessionTemplates: { konsole: { content: 'repo konsole' } } }, null, 2)
			);
			writeProjectConfig('web', {
				claudeSessionTemplates: { konsole: { content: 'project konsole' } },
			});

			expect(service.getClaudeSessionTemplate('konsole', repoPath, 'web')).toBe('project konsole');
		});

		it('falls back to repo config when the project does not configure that terminal', () => {
			vol.writeFileSync(
				path.join(repoPath, '.grove.json'),
				JSON.stringify({ claudeSessionTemplates: { konsole: { content: 'repo konsole' } } }, null, 2)
			);
			writeProjectConfig('web', {
				claudeSessionTemplates: { kitty: { content: 'project kitty' } },
			});

			expect(service.getClaudeSessionTemplate('konsole', repoPath, 'web')).toBe('repo konsole');
		});

		it('ignores the project-level .grove.local.json (only .grove.json participates)', () => {
			const dir = path.join(repoPath, 'web');
			vol.mkdirSync(dir, { recursive: true });
			vol.writeFileSync(
				path.join(dir, '.grove.local.json'),
				JSON.stringify({ claudeSessionTemplates: { konsole: { content: 'project local' } } }, null, 2)
			);
			vol.writeFileSync(
				path.join(repoPath, '.grove.json'),
				JSON.stringify({ claudeSessionTemplates: { konsole: { content: 'repo konsole' } } }, null, 2)
			);

			expect(service.getClaudeSessionTemplate('konsole', repoPath, 'web')).toBe('repo konsole');
		});

		it('returns an empty-string template as configured (not undefined)', () => {
			const config: GroveRepoConfig = {
				claudeSessionTemplates: { konsole: { content: '' } },
			};
			vol.writeFileSync(path.join(repoPath, '.grove.json'), JSON.stringify(config, null, 2));

			expect(service.getClaudeSessionTemplate('konsole', repoPath)).toBe('');
		});

		it('ignores malformed project JSON and falls back to repo config', () => {
			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const dir = path.join(repoPath, 'web');
			vol.mkdirSync(dir, { recursive: true });
			vol.writeFileSync(path.join(dir, '.grove.json'), '{ not valid json');
			vol.writeFileSync(
				path.join(repoPath, '.grove.json'),
				JSON.stringify({ claudeSessionTemplates: { konsole: { content: 'repo konsole' } } }, null, 2)
			);

			expect(service.getClaudeSessionTemplate('konsole', repoPath, 'web')).toBe('repo konsole');

			consoleErrorSpy.mockRestore();
		});
	});

	describe('getPromptTemplate', () => {
		const writeProjectConfig = (projectPath: string, config: GroveRepoConfig) => {
			const dir = path.join(repoPath, projectPath);
			vol.mkdirSync(dir, { recursive: true });
			vol.writeFileSync(path.join(dir, '.grove.json'), JSON.stringify(config, null, 2));
		};

		it('returns undefined when no template is configured', () => {
			expect(service.getPromptTemplate(repoPath)).toBeUndefined();
		});

		it('returns the repo-level prompt template', () => {
			vol.writeFileSync(
				path.join(repoPath, '.grove.json'),
				JSON.stringify({ promptTemplate: 'from repo {prompt}' }, null, 2)
			);

			expect(service.getPromptTemplate(repoPath)).toBe('from repo {prompt}');
		});

		it('prefers the project-level .grove.json over repo config', () => {
			vol.writeFileSync(
				path.join(repoPath, '.grove.json'),
				JSON.stringify({ promptTemplate: 'from repo' }, null, 2)
			);
			writeProjectConfig('web', { promptTemplate: 'from project' });

			expect(service.getPromptTemplate(repoPath, 'web')).toBe('from project');
		});

		it('falls back to repo config when project has no prompt template', () => {
			vol.writeFileSync(
				path.join(repoPath, '.grove.json'),
				JSON.stringify({ promptTemplate: 'from repo' }, null, 2)
			);
			writeProjectConfig('web', { branchNameTemplate: 'x/${GROVE_NAME}' });

			expect(service.getPromptTemplate(repoPath, 'web')).toBe('from repo');
		});

		it('ignores a whitespace-only project template and falls through to repo', () => {
			vol.writeFileSync(
				path.join(repoPath, '.grove.json'),
				JSON.stringify({ promptTemplate: 'from repo' }, null, 2)
			);
			writeProjectConfig('web', { promptTemplate: '   \n  ' });

			expect(service.getPromptTemplate(repoPath, 'web')).toBe('from repo');
		});

		it('ignores a whitespace-only repo template', () => {
			vol.writeFileSync(
				path.join(repoPath, '.grove.json'),
				JSON.stringify({ promptTemplate: '  \t ' }, null, 2)
			);

			expect(service.getPromptTemplate(repoPath)).toBeUndefined();
		});

		it('ignores malformed project JSON and falls back to repo config', () => {
			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const dir = path.join(repoPath, 'web');
			vol.mkdirSync(dir, { recursive: true });
			vol.writeFileSync(path.join(dir, '.grove.json'), 'not json at all');
			vol.writeFileSync(
				path.join(repoPath, '.grove.json'),
				JSON.stringify({ promptTemplate: 'from repo' }, null, 2)
			);

			expect(service.getPromptTemplate(repoPath, 'web')).toBe('from repo');

			consoleErrorSpy.mockRestore();
		});
	});
});

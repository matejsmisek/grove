import fs from 'fs';
import path from 'path';

import type { IGroveConfigService, MergedGroveConfig } from '../services/interfaces.js';
import type { GroveRepoConfig } from './types.js';

/**
 * Grove repository configuration service implementation
 * Reads .grove.json and .grove.local.json from repositories
 */
export class GroveConfigService implements IGroveConfigService {
	/**
	 * Read and merge .grove.json and .grove.local.json from a repository
	 * @param repositoryPath - Absolute path to the repository root
	 * @returns Merged configuration with .grove.local.json overriding .grove.json
	 * Note: fileCopyPatterns arrays are merged (not overridden) with duplicates removed
	 */
	readGroveRepoConfig(repositoryPath: string): GroveRepoConfig {
		const groveConfigPath = path.join(repositoryPath, '.grove.json');
		const groveLocalConfigPath = path.join(repositoryPath, '.grove.local.json');

		let config: GroveRepoConfig = {};

		// Read .grove.json if it exists
		if (fs.existsSync(groveConfigPath)) {
			try {
				const data = fs.readFileSync(groveConfigPath, 'utf-8');
				const parsed = JSON.parse(data) as GroveRepoConfig;
				config = { ...parsed };
			} catch (error) {
				console.error(`Error reading .grove.json from ${repositoryPath}:`, error);
			}
		}

		// Read .grove.local.json if it exists and merge (overriding)
		if (fs.existsSync(groveLocalConfigPath)) {
			try {
				const data = fs.readFileSync(groveLocalConfigPath, 'utf-8');
				const parsed = JSON.parse(data) as GroveRepoConfig;

				// Merge fileCopyPatterns arrays (don't override)
				if (parsed.fileCopyPatterns) {
					const basePatterns = config.fileCopyPatterns || [];
					const localPatterns = parsed.fileCopyPatterns;

					// Combine arrays and remove duplicates
					const mergedPatterns = [...basePatterns, ...localPatterns];
					const uniquePatterns = Array.from(new Set(mergedPatterns));

					config = {
						...config,
						...parsed,
						fileCopyPatterns: uniquePatterns,
					};
				} else {
					// Normal override for other fields
					config = { ...config, ...parsed };
				}
			} catch (error) {
				console.error(`Error reading .grove.local.json from ${repositoryPath}:`, error);
			}
		}

		return config;
	}

	/**
	 * Validate branch name template contains ${GROVE_NAME}
	 * @param template - Branch name template to validate
	 * @returns true if valid, false otherwise
	 */
	validateBranchNameTemplate(template: string): boolean {
		return template.includes('${GROVE_NAME}');
	}

	/**
	 * Apply branch name template by replacing ${GROVE_NAME} with the normalized grove name
	 * @param template - Branch name template (e.g., "grove/${GROVE_NAME}")
	 * @param groveName - Grove name to normalize and substitute
	 * @returns Processed branch name
	 */
	applyBranchNameTemplate(template: string, groveName: string): string {
		// Normalize grove name: lowercase and replace spaces with hyphens
		const normalizedName = groveName.toLowerCase().replace(/\s+/g, '-');

		// Replace ${GROVE_NAME} with normalized name
		return template.replace(/\$\{GROVE_NAME\}/g, normalizedName);
	}

	/**
	 * Get branch name for a repository based on grove config or default
	 * @param repositoryPath - Absolute path to the repository root
	 * @param groveName - Name of the grove being created
	 * @returns Branch name to use for worktree
	 */
	getBranchNameForRepo(repositoryPath: string, groveName: string): string {
		const config = this.readGroveRepoConfig(repositoryPath);

		if (config.branchNameTemplate) {
			// Validate template
			if (!this.validateBranchNameTemplate(config.branchNameTemplate)) {
				console.warn(
					`Branch template "${config.branchNameTemplate}" in ${repositoryPath} does not contain \${GROVE_NAME}. Using default.`
				);
				// Fall back to default
				return `grove/${groveName.toLowerCase().replace(/\s+/g, '-')}`;
			}

			// Apply template
			return this.applyBranchNameTemplate(config.branchNameTemplate, groveName);
		}

		// Default branch naming
		return `grove/${groveName.toLowerCase().replace(/\s+/g, '-')}`;
	}

	/**
	 * Read and merge configs for a repository selection
	 * For monorepo projects, reads both root and project-level .grove.json files
	 * @param repositoryPath - Absolute path to the repository root
	 * @param projectPath - Optional relative path to project folder (for monorepos)
	 * @returns Merged configuration with project overriding root for most fields,
	 *          but fileCopyPatterns kept separate for staged copying
	 */
	readMergedConfig(repositoryPath: string, projectPath?: string): MergedGroveConfig {
		// Read root config
		const rootConfig = this.readGroveRepoConfig(repositoryPath);

		// Initialize merged config with root values
		const mergedConfig: MergedGroveConfig = {
			branchNameTemplate: rootConfig.branchNameTemplate,
			rootFileCopyPatterns: rootConfig.fileCopyPatterns || [],
			projectFileCopyPatterns: [],
			rootInitActions: rootConfig.initActions || [],
			projectInitActions: [],
		};

		// If no project path, return root config only
		if (!projectPath) {
			return mergedConfig;
		}

		// Read project-level config
		const projectConfigPath = path.join(repositoryPath, projectPath, '.grove.json');
		const projectLocalConfigPath = path.join(repositoryPath, projectPath, '.grove.local.json');

		let projectConfig: GroveRepoConfig = {};

		// Read project .grove.json if it exists
		if (fs.existsSync(projectConfigPath)) {
			try {
				const data = fs.readFileSync(projectConfigPath, 'utf-8');
				projectConfig = JSON.parse(data) as GroveRepoConfig;
			} catch (error) {
				console.error(`Error reading .grove.json from ${projectPath}:`, error);
			}
		}

		// Read project .grove.local.json if it exists (overrides project .grove.json)
		if (fs.existsSync(projectLocalConfigPath)) {
			try {
				const data = fs.readFileSync(projectLocalConfigPath, 'utf-8');
				const localConfig = JSON.parse(data) as GroveRepoConfig;

				// Merge project local config, with arrays being merged for fileCopyPatterns
				if (localConfig.fileCopyPatterns) {
					const basePatterns = projectConfig.fileCopyPatterns || [];
					const localPatterns = localConfig.fileCopyPatterns;
					const mergedPatterns = [...basePatterns, ...localPatterns];
					projectConfig = {
						...projectConfig,
						...localConfig,
						fileCopyPatterns: Array.from(new Set(mergedPatterns)),
					};
				} else {
					projectConfig = { ...projectConfig, ...localConfig };
				}
			} catch (error) {
				console.error(`Error reading .grove.local.json from ${projectPath}:`, error);
			}
		}

		// Apply project config overrides
		// branchNameTemplate: project overrides root if present
		if (projectConfig.branchNameTemplate) {
			mergedConfig.branchNameTemplate = projectConfig.branchNameTemplate;
		}

		// fileCopyPatterns: project patterns are kept separate (additive behavior)
		if (projectConfig.fileCopyPatterns && projectConfig.fileCopyPatterns.length > 0) {
			mergedConfig.projectFileCopyPatterns = projectConfig.fileCopyPatterns;
		}

		// initActions: project actions are kept separate
		if (projectConfig.initActions && projectConfig.initActions.length > 0) {
			mergedConfig.projectInitActions = projectConfig.initActions;
		}

		return mergedConfig;
	}

	/**
	 * Get branch name for a repository selection (with optional project path)
	 * @param repositoryPath - Absolute path to the repository root
	 * @param groveName - Name of the grove being created
	 * @param projectPath - Optional relative path to project folder (for monorepos)
	 * @returns Branch name to use for worktree
	 */
	getBranchNameForSelection(
		repositoryPath: string,
		groveName: string,
		projectPath?: string
	): string {
		const mergedConfig = this.readMergedConfig(repositoryPath, projectPath);
		const defaultBranch = `grove/${groveName.toLowerCase().replace(/\s+/g, '-')}`;

		if (mergedConfig.branchNameTemplate) {
			// Validate template
			if (!this.validateBranchNameTemplate(mergedConfig.branchNameTemplate)) {
				const configSource = projectPath ? `${projectPath}/.grove.json` : '.grove.json';
				console.warn(
					`Branch template "${mergedConfig.branchNameTemplate}" in ${configSource} does not contain \${GROVE_NAME}. Using default.`
				);
				return defaultBranch;
			}

			// Apply template
			return this.applyBranchNameTemplate(mergedConfig.branchNameTemplate, groveName);
		}

		return defaultBranch;
	}
}

import fs from 'fs';
import path from 'path';

import type { MergedGroveConfig, TemplateValidationResult } from '../services/types.js';
import type {
	FileCopyPatternEntry,
	GroveIDEConfig,
	GroveRepoConfig,
	IDEConfig,
	IDEType,
} from './types.js';

/**
 * Get the glob string from a file copy pattern entry
 */
export function getPatternString(entry: FileCopyPatternEntry): string {
	return typeof entry === 'string' ? entry : entry[0];
}

/**
 * Deduplicate pattern entries by glob string, with later entries taking precedence.
 * This ensures that when merging base and local configs, local entries override base entries
 * for the same glob pattern (e.g., local can change mode from "copy" to "link").
 */
function deduplicatePatternEntries(entries: FileCopyPatternEntry[]): FileCopyPatternEntry[] {
	const seen = new Map<string, FileCopyPatternEntry>();
	for (const entry of entries) {
		seen.set(getPatternString(entry), entry);
	}
	return Array.from(seen.values());
}

/**
 * Valid template variables for different contexts
 */
export const BRANCH_TEMPLATE_VARIABLES = ['GROVE_NAME'] as const;
export const CLAUDE_SESSION_TEMPLATE_VARIABLES = [
	'WORKING_DIR',
	'AGENT_COMMAND',
	'GROVE_NAME',
	'GROVE_NAME_SHORT',
	'WORKTREE_NAME',
	'WORKTREE_NAME_SHORT',
] as const;

/**
 * Grove repository configuration service interface
 * Reads and writes .grove.json and .grove.local.json from repositories
 */
export interface IGroveConfigService {
	/** Read and merge .grove.json and .grove.local.json from a repository */
	readGroveRepoConfig(repositoryPath: string): GroveRepoConfig;
	/**
	 * Read and merge configs for a repository selection
	 * For monorepo projects, reads both root and project-level .grove.json files
	 */
	readMergedConfig(repositoryPath: string, projectPath?: string): MergedGroveConfig;
	/** Validate branch name template contains ${GROVE_NAME} */
	validateBranchNameTemplate(template: string): boolean;
	/** Apply branch name template by replacing ${GROVE_NAME} */
	applyBranchNameTemplate(template: string, groveName: string): string;
	/** Get branch name for a repository based on config or default */
	getBranchNameForRepo(repositoryPath: string, groveName: string): string;
	/** Get branch name for a repository selection (with optional project path) */
	getBranchNameForSelection(repositoryPath: string, groveName: string, projectPath?: string): string;
	/** Check if an IDE config is a reference (starts with @) */
	isIDEReference(config: GroveIDEConfig): config is `@${IDEType}`;
	/** Parse an IDE reference to get the IDE type */
	parseIDEReference(reference: `@${IDEType}`): IDEType;
	/** Get the resolved IDE config for a repository selection */
	getIDEConfigForSelection(
		repositoryPath: string,
		projectPath?: string
	): { ideType: IDEType } | { ideConfig: IDEConfig } | undefined;
	/** Write .grove.json configuration to a repository */
	writeGroveConfig(repositoryPath: string, config: GroveRepoConfig, projectPath?: string): void;
	/** Write .grove.local.json configuration to a repository */
	writeGroveLocalConfig(repositoryPath: string, config: GroveRepoConfig, projectPath?: string): void;
	/** Read just the .grove.json file (without merging with .grove.local.json) */
	readGroveConfigOnly(repositoryPath: string, projectPath?: string): GroveRepoConfig;
	/** Read just the .grove.local.json file (without merging) */
	readGroveLocalConfigOnly(repositoryPath: string, projectPath?: string): GroveRepoConfig;
	/** Check if a .grove.json file exists */
	groveConfigExists(repositoryPath: string, projectPath?: string): boolean;
	/** Check if a .grove.local.json file exists */
	groveLocalConfigExists(repositoryPath: string, projectPath?: string): boolean;
	/** Get list of project folders in a monorepo that have .grove.json files */
	getProjectsWithGroveConfig(repositoryPath: string): string[];
	/** Validate template variables in a string */
	validateTemplateVariables(
		template: string,
		validVars: readonly string[],
		requiredVars?: readonly string[]
	): TemplateValidationResult;
	/** Validate branch name template */
	validateBranchTemplate(template: string): TemplateValidationResult;
	/** Validate Claude session template */
	validateClaudeSessionTemplate(template: string): TemplateValidationResult;
}

/**
 * Grove repository configuration service implementation
 * Reads and writes .grove.json and .grove.local.json from repositories
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

					// Combine arrays and deduplicate by glob string (local entries take precedence)
					const uniquePatterns = deduplicatePatternEntries([...basePatterns, ...localPatterns]);

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
	 * Apply branch name template by replacing ${GROVE_NAME} with the grove name
	 * @param template - Branch name template (e.g., "grove/${GROVE_NAME}")
	 * @param groveName - Grove name to substitute (should already be normalized)
	 * @returns Processed branch name
	 */
	applyBranchNameTemplate(template: string, groveName: string): string {
		// Replace ${GROVE_NAME} with the grove name (assumed to be pre-normalized)
		return template.replace(/\$\{GROVE_NAME\}/g, groveName);
	}

	/**
	 * Get branch name for a repository based on grove config or default
	 * @param repositoryPath - Absolute path to the repository root
	 * @param groveName - Name of the grove being created (should already be normalized)
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
				// Fall back to default (name should already be normalized)
				return `grove/${groveName}`;
			}

			// Apply template
			return this.applyBranchNameTemplate(config.branchNameTemplate, groveName);
		}

		// Default branch naming (name should already be normalized)
		return `grove/${groveName}`;
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
			ide: rootConfig.ide,
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
					projectConfig = {
						...projectConfig,
						...localConfig,
						fileCopyPatterns: deduplicatePatternEntries([...basePatterns, ...localPatterns]),
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

		// ide: project overrides root if present
		if (projectConfig.ide !== undefined) {
			mergedConfig.ide = projectConfig.ide;
		}

		return mergedConfig;
	}

	/**
	 * Get branch name for a repository selection (with optional project path)
	 * @param repositoryPath - Absolute path to the repository root
	 * @param groveName - Name of the grove being created (should already be normalized)
	 * @param projectPath - Optional relative path to project folder (for monorepos)
	 * @returns Branch name to use for worktree
	 */
	getBranchNameForSelection(
		repositoryPath: string,
		groveName: string,
		projectPath?: string
	): string {
		const mergedConfig = this.readMergedConfig(repositoryPath, projectPath);
		const defaultBranch = `grove/${groveName}`;

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

	/**
	 * Check if an IDE config is a reference (starts with @)
	 * @param config - The IDE config to check
	 * @returns true if the config is a reference like "@phpstorm"
	 */
	isIDEReference(config: GroveIDEConfig): config is `@${IDEType}` {
		return typeof config === 'string' && config.startsWith('@');
	}

	/**
	 * Parse an IDE reference to get the IDE type
	 * @param reference - The IDE reference (e.g., "@phpstorm")
	 * @returns The IDE type (e.g., "phpstorm")
	 */
	parseIDEReference(reference: `@${IDEType}`): IDEType {
		return reference.slice(1) as IDEType;
	}

	/**
	 * Get the resolved IDE config for a repository selection
	 * Returns the IDE config from .grove.json (project overrides root)
	 * If it's a reference, returns the type; if it's a custom config, returns the config
	 * @param repositoryPath - Absolute path to the repository root
	 * @param projectPath - Optional relative path to project folder (for monorepos)
	 * @returns Object with either ideType or ideConfig, or undefined if not configured
	 */
	getIDEConfigForSelection(
		repositoryPath: string,
		projectPath?: string
	): { ideType: IDEType } | { ideConfig: IDEConfig } | undefined {
		const mergedConfig = this.readMergedConfig(repositoryPath, projectPath);

		if (!mergedConfig.ide) {
			return undefined;
		}

		if (this.isIDEReference(mergedConfig.ide)) {
			return { ideType: this.parseIDEReference(mergedConfig.ide) };
		}

		return { ideConfig: mergedConfig.ide };
	}

	// =========================================================================
	// Write Methods
	// =========================================================================

	/**
	 * Write .grove.json configuration to a repository
	 * @param repositoryPath - Absolute path to the repository root
	 * @param config - Configuration to write
	 * @param projectPath - Optional relative path to project folder (for monorepos)
	 */
	writeGroveConfig(repositoryPath: string, config: GroveRepoConfig, projectPath?: string): void {
		const configDir = projectPath ? path.join(repositoryPath, projectPath) : repositoryPath;
		const configPath = path.join(configDir, '.grove.json');

		// Ensure directory exists
		if (!fs.existsSync(configDir)) {
			fs.mkdirSync(configDir, { recursive: true });
		}

		// Write config with pretty formatting
		fs.writeFileSync(configPath, JSON.stringify(config, null, '\t'), 'utf-8');
	}

	/**
	 * Write .grove.local.json configuration to a repository
	 * @param repositoryPath - Absolute path to the repository root
	 * @param config - Configuration to write
	 * @param projectPath - Optional relative path to project folder (for monorepos)
	 */
	writeGroveLocalConfig(
		repositoryPath: string,
		config: GroveRepoConfig,
		projectPath?: string
	): void {
		const configDir = projectPath ? path.join(repositoryPath, projectPath) : repositoryPath;
		const configPath = path.join(configDir, '.grove.local.json');

		// Ensure directory exists
		if (!fs.existsSync(configDir)) {
			fs.mkdirSync(configDir, { recursive: true });
		}

		// Write config with pretty formatting
		fs.writeFileSync(configPath, JSON.stringify(config, null, '\t'), 'utf-8');
	}

	/**
	 * Read just the .grove.json file (without merging with .grove.local.json)
	 * @param repositoryPath - Absolute path to the repository root
	 * @param projectPath - Optional relative path to project folder (for monorepos)
	 * @returns Configuration from .grove.json only
	 */
	readGroveConfigOnly(repositoryPath: string, projectPath?: string): GroveRepoConfig {
		const configDir = projectPath ? path.join(repositoryPath, projectPath) : repositoryPath;
		const configPath = path.join(configDir, '.grove.json');

		if (!fs.existsSync(configPath)) {
			return {};
		}

		try {
			const data = fs.readFileSync(configPath, 'utf-8');
			return JSON.parse(data) as GroveRepoConfig;
		} catch (error) {
			console.error(`Error reading .grove.json from ${configDir}:`, error);
			return {};
		}
	}

	/**
	 * Read just the .grove.local.json file (without merging)
	 * @param repositoryPath - Absolute path to the repository root
	 * @param projectPath - Optional relative path to project folder (for monorepos)
	 * @returns Configuration from .grove.local.json only
	 */
	readGroveLocalConfigOnly(repositoryPath: string, projectPath?: string): GroveRepoConfig {
		const configDir = projectPath ? path.join(repositoryPath, projectPath) : repositoryPath;
		const configPath = path.join(configDir, '.grove.local.json');

		if (!fs.existsSync(configPath)) {
			return {};
		}

		try {
			const data = fs.readFileSync(configPath, 'utf-8');
			return JSON.parse(data) as GroveRepoConfig;
		} catch (error) {
			console.error(`Error reading .grove.local.json from ${configDir}:`, error);
			return {};
		}
	}

	/**
	 * Check if a .grove.json file exists
	 * @param repositoryPath - Absolute path to the repository root
	 * @param projectPath - Optional relative path to project folder (for monorepos)
	 */
	groveConfigExists(repositoryPath: string, projectPath?: string): boolean {
		const configDir = projectPath ? path.join(repositoryPath, projectPath) : repositoryPath;
		const configPath = path.join(configDir, '.grove.json');
		return fs.existsSync(configPath);
	}

	/**
	 * Check if a .grove.local.json file exists
	 * @param repositoryPath - Absolute path to the repository root
	 * @param projectPath - Optional relative path to project folder (for monorepos)
	 */
	groveLocalConfigExists(repositoryPath: string, projectPath?: string): boolean {
		const configDir = projectPath ? path.join(repositoryPath, projectPath) : repositoryPath;
		const configPath = path.join(configDir, '.grove.local.json');
		return fs.existsSync(configPath);
	}

	/**
	 * Get list of project folders in a monorepo that have .grove.json files
	 * @param repositoryPath - Absolute path to the repository root
	 * @returns Array of project folder names that contain .grove.json
	 */
	getProjectsWithGroveConfig(repositoryPath: string): string[] {
		const projects: string[] = [];

		try {
			const entries = fs.readdirSync(repositoryPath, { withFileTypes: true });

			for (const entry of entries) {
				if (!entry.isDirectory()) continue;
				if (entry.name.startsWith('.')) continue;
				if (['node_modules', 'dist', 'build', 'vendor', '.git'].includes(entry.name)) continue;

				const projectConfigPath = path.join(repositoryPath, entry.name, '.grove.json');
				if (fs.existsSync(projectConfigPath)) {
					projects.push(entry.name);
				}
			}
		} catch (error) {
			console.error(`Error scanning projects in ${repositoryPath}:`, error);
		}

		return projects.sort();
	}

	/**
	 * Validate template variables in a string
	 * @param template - Template string to validate
	 * @param validVars - Array of valid variable names
	 * @param requiredVars - Array of required variable names (optional)
	 * @returns Validation result with invalid and missing required variables
	 */
	validateTemplateVariables(
		template: string,
		validVars: readonly string[],
		requiredVars: readonly string[] = []
	): TemplateValidationResult {
		const varPattern = /\$\{([^}]+)\}/g;
		const invalidVars: string[] = [];
		const foundVars = new Set<string>();
		let match;

		while ((match = varPattern.exec(template)) !== null) {
			const varName = match[1];
			foundVars.add(varName);
			if (!validVars.includes(varName)) {
				invalidVars.push(varName);
			}
		}

		const missingRequired = requiredVars.filter((v) => !foundVars.has(v));

		return {
			valid: invalidVars.length === 0 && missingRequired.length === 0,
			invalidVars,
			missingRequired,
		};
	}

	/**
	 * Validate branch name template
	 * @param template - Branch name template to validate
	 * @returns Validation result
	 */
	validateBranchTemplate(template: string): TemplateValidationResult {
		return this.validateTemplateVariables(
			template,
			BRANCH_TEMPLATE_VARIABLES,
			BRANCH_TEMPLATE_VARIABLES // GROVE_NAME is required
		);
	}

	/**
	 * Validate Claude session template
	 * @param template - Claude session template to validate
	 * @returns Validation result
	 */
	validateClaudeSessionTemplate(template: string): TemplateValidationResult {
		return this.validateTemplateVariables(
			template,
			CLAUDE_SESSION_TEMPLATE_VARIABLES
			// No required vars for session templates
		);
	}
}

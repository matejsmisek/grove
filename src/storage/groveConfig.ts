import fs from 'fs';
import path from 'path';

import type { GroveRepoConfig } from './types.js';

/**
 * Read and merge .grove.json and .grove.local.json from a repository
 * @param repositoryPath - Absolute path to the repository root
 * @returns Merged configuration with .grove.local.json overriding .grove.json
 */
export function readGroveRepoConfig(repositoryPath: string): GroveRepoConfig {
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
			config = { ...config, ...parsed };
		} catch (error) {
			console.error(`Error reading .grove.local.json from ${repositoryPath}:`, error);
		}
	}

	return config;
}

/**
 * Validate branch name template
 * @param template - Branch name template to validate
 * @returns true if valid, false otherwise
 */
export function validateBranchNameTemplate(template: string): boolean {
	return template.includes('${GROVE_NAME}');
}

/**
 * Apply branch name template by replacing ${GROVE_NAME} with the normalized grove name
 * @param template - Branch name template (e.g., "grove/${GROVE_NAME}")
 * @param groveName - Grove name to normalize and substitute
 * @returns Processed branch name
 */
export function applyBranchNameTemplate(template: string, groveName: string): string {
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
export function getBranchNameForRepo(repositoryPath: string, groveName: string): string {
	const config = readGroveRepoConfig(repositoryPath);

	if (config.branchNameTemplate) {
		// Validate template
		if (!validateBranchNameTemplate(config.branchNameTemplate)) {
			console.warn(
				`Branch template "${config.branchNameTemplate}" in ${repositoryPath} does not contain \${GROVE_NAME}. Using default.`
			);
			// Fall back to default
			return `grove/${groveName.toLowerCase().replace(/\s+/g, '-')}`;
		}

		// Apply template
		return applyBranchNameTemplate(config.branchNameTemplate, groveName);
	}

	// Default branch naming
	return `grove/${groveName.toLowerCase().replace(/\s+/g, '-')}`;
}

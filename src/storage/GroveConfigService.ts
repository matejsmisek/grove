/**
 * Grove Config Service Implementation
 * Wraps groveConfig.ts functions in a class for DI compatibility
 */
import type { IGroveConfigService } from '../services/interfaces.js';
import {
	applyBranchNameTemplate,
	getBranchNameForRepo,
	readGroveRepoConfig,
	validateBranchNameTemplate,
} from './groveConfig.js';
import type { GroveRepoConfig } from './types.js';

/**
 * Grove repository configuration service implementation
 * Reads .grove.json and .grove.local.json from repositories
 */
export class GroveConfigService implements IGroveConfigService {
	/**
	 * Read and merge .grove.json and .grove.local.json from a repository
	 */
	readGroveRepoConfig(repositoryPath: string): GroveRepoConfig {
		return readGroveRepoConfig(repositoryPath);
	}

	/**
	 * Validate branch name template contains ${GROVE_NAME}
	 */
	validateBranchNameTemplate(template: string): boolean {
		return validateBranchNameTemplate(template);
	}

	/**
	 * Apply branch name template by replacing ${GROVE_NAME}
	 */
	applyBranchNameTemplate(template: string, groveName: string): string {
		return applyBranchNameTemplate(template, groveName);
	}

	/**
	 * Get branch name for a repository based on config or default
	 */
	getBranchNameForRepo(repositoryPath: string, groveName: string): string {
		return getBranchNameForRepo(repositoryPath, groveName);
	}
}

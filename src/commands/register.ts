import { getContainer } from '../di/index.js';
import { detectMonorepo, verifyValidRepository } from '../git/index.js';
import { RepositoryServiceToken } from '../services/tokens.js';
import type { RegisterResult } from './types.js';

/**
 * Register the current directory as a repository
 * Uses the DI container to get the workspace-aware RepositoryService
 */
export async function registerRepository(cwd?: string): Promise<RegisterResult> {
	try {
		// Verify this is a valid git repository (not a worktree)
		const repoPath = await verifyValidRepository(cwd);

		// Get workspace-aware repository service from DI container
		const container = getContainer();
		const repositoryService = container.resolve(RepositoryServiceToken);

		// Check if already registered
		if (repositoryService.isRepositoryRegistered(repoPath)) {
			return {
				success: false,
				message: `Repository is already registered: ${repoPath}`,
			};
		}

		// Auto-detect monorepo layout from the folder structure
		const isMonorepo = await detectMonorepo(repoPath);

		// Add the repository
		const repository = repositoryService.addRepository(repoPath, { isMonorepo });

		return {
			success: true,
			message: `Successfully registered repository: ${repository.name}${
				isMonorepo ? ' (monorepo)' : ''
			}`,
			path: repository.path,
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
		return {
			success: false,
			message: `Failed to register repository: ${errorMessage}`,
		};
	}
}

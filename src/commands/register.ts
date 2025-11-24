import { verifyValidRepository } from '../git/index.js';
import { addRepository, isRepositoryRegistered } from '../storage/index.js';
import type { RegisterResult } from './types.js';

export type { RegisterResult } from './types.js';

/**
 * Register the current directory as a repository
 */
export function registerRepository(cwd?: string): RegisterResult {
	try {
		// Verify this is a valid git repository (not a worktree)
		const repoPath = verifyValidRepository(cwd);

		// Check if already registered
		if (isRepositoryRegistered(repoPath)) {
			return {
				success: false,
				message: `Repository is already registered: ${repoPath}`,
			};
		}

		// Add the repository
		const repository = addRepository(repoPath);

		return {
			success: true,
			message: `Successfully registered repository: ${repository.name}`,
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

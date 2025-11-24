/**
 * Repository Service Implementation
 * Wraps repositories.ts functions in a class for DI compatibility
 */
import type { IRepositoryService } from '../services/interfaces.js';
import {
	addRepository,
	getAllRepositories,
	getDefaultRepositories,
	isRepositoryRegistered,
	readRepositories,
	removeRepository,
	writeRepositories,
} from './repositories.js';
import type { RepositoriesData, Repository } from './types.js';

/**
 * Repository service implementation
 * Manages registered repositories stored in ~/.grove/repositories.json
 */
export class RepositoryService implements IRepositoryService {
	/**
	 * Get default repositories data structure
	 */
	getDefaultRepositories(): RepositoriesData {
		return getDefaultRepositories();
	}

	/**
	 * Read all repository data from storage
	 */
	readRepositories(): RepositoriesData {
		return readRepositories();
	}

	/**
	 * Write repository data to storage
	 */
	writeRepositories(data: RepositoriesData): void {
		writeRepositories(data);
	}

	/**
	 * Check if a repository is already registered
	 */
	isRepositoryRegistered(repoPath: string): boolean {
		return isRepositoryRegistered(repoPath);
	}

	/**
	 * Add a new repository to the registry
	 * @throws Error if repository already registered
	 */
	addRepository(repoPath: string): Repository {
		return addRepository(repoPath);
	}

	/**
	 * Remove a repository from the registry
	 * @returns true if repository was removed, false if not found
	 */
	removeRepository(repoPath: string): boolean {
		return removeRepository(repoPath);
	}

	/**
	 * Get all registered repositories
	 */
	getAllRepositories(): Repository[] {
		return getAllRepositories();
	}
}

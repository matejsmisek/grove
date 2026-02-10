import path from 'path';

import { JsonStore } from './JsonStore.js';
import type { ISettingsService } from './SettingsService.js';
import type { RepositoriesData, Repository } from './types.js';

/**
 * Repository service interface
 * Manages registered repositories stored in ~/.grove/repositories.json
 */
export interface IRepositoryService {
	/** Get default repositories data structure */
	getDefaultRepositories(): RepositoriesData;
	/** Read all repository data from storage */
	readRepositories(): RepositoriesData;
	/** Write repository data to storage */
	writeRepositories(data: RepositoriesData): void;
	/** Check if a repository is already registered */
	isRepositoryRegistered(repoPath: string): boolean;
	/**
	 * Add a new repository to the registry
	 * @throws Error if repository already registered
	 */
	addRepository(repoPath: string): Repository;
	/**
	 * Remove a repository from the registry
	 * @returns true if repository was removed, false if not found
	 */
	removeRepository(repoPath: string): boolean;
	/** Get all registered repositories */
	getAllRepositories(): Repository[];
	/**
	 * Update a repository's properties
	 * @returns The updated repository, or null if not found
	 */
	updateRepository(
		repoPath: string,
		updates: Partial<Pick<Repository, 'isMonorepo'>>
	): Repository | null;
}

/**
 * Repository service implementation
 * Manages registered repositories stored in ~/.grove/repositories.json
 */
export class RepositoryService implements IRepositoryService {
	private store: JsonStore<RepositoriesData>;

	constructor(private readonly settingsService: ISettingsService) {
		this.store = new JsonStore<RepositoriesData>(
			() => this.settingsService.getStorageConfig().repositoriesPath,
			() => this.settingsService.getStorageConfig().groveFolder,
			() => this.getDefaultRepositories(),
			{ label: 'repositories' }
		);
	}

	/**
	 * Get default repositories data structure
	 */
	getDefaultRepositories(): RepositoriesData {
		return {
			repositories: [],
		};
	}

	/**
	 * Read all repository data from storage
	 */
	readRepositories(): RepositoriesData {
		return this.store.read();
	}

	/**
	 * Write repository data to storage
	 */
	writeRepositories(data: RepositoriesData): void {
		this.store.write(data);
	}

	/**
	 * Check if a repository is already registered
	 */
	isRepositoryRegistered(repoPath: string): boolean {
		const data = this.readRepositories();
		return data.repositories.some((repo) => repo.path === repoPath);
	}

	/**
	 * Add a new repository to the registry
	 * @throws Error if repository already registered
	 */
	addRepository(repoPath: string): Repository {
		const data = this.readRepositories();

		// Check if already registered
		if (this.isRepositoryRegistered(repoPath)) {
			throw new Error(`Repository already registered: ${repoPath}`);
		}

		// Create new repository entry
		const repository: Repository = {
			path: repoPath,
			name: path.basename(repoPath),
			registeredAt: new Date().toISOString(),
		};

		// Add to repositories list
		data.repositories.push(repository);

		// Save to file
		this.writeRepositories(data);

		return repository;
	}

	/**
	 * Remove a repository from the registry
	 * @returns true if repository was removed, false if not found
	 */
	removeRepository(repoPath: string): boolean {
		const data = this.readRepositories();

		const initialLength = data.repositories.length;
		data.repositories = data.repositories.filter((repo) => repo.path !== repoPath);

		// Check if anything was removed
		if (data.repositories.length === initialLength) {
			return false;
		}

		// Save to file
		this.writeRepositories(data);

		return true;
	}

	/**
	 * Get all registered repositories
	 */
	getAllRepositories(): Repository[] {
		const data = this.readRepositories();
		return data.repositories;
	}

	/**
	 * Update a repository's properties
	 * @param repoPath - Path to the repository to update
	 * @param updates - Partial repository properties to update
	 * @returns The updated repository, or null if not found
	 */
	updateRepository(
		repoPath: string,
		updates: Partial<Pick<Repository, 'isMonorepo'>>
	): Repository | null {
		const data = this.readRepositories();

		const repoIndex = data.repositories.findIndex((repo) => repo.path === repoPath);
		if (repoIndex === -1) {
			return null;
		}

		// Apply updates
		data.repositories[repoIndex] = {
			...data.repositories[repoIndex],
			...updates,
		};

		// Save to file
		this.writeRepositories(data);

		return data.repositories[repoIndex];
	}
}

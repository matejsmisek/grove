import fs from 'fs';
import path from 'path';

import type { IRepositoryService } from '../services/interfaces.js';
import type { SettingsService } from './SettingsService.js';
import type { RepositoriesData, Repository } from './types.js';

/**
 * Repository service implementation
 * Manages registered repositories stored in ~/.grove/repositories.json
 */
export class RepositoryService implements IRepositoryService {
	constructor(private readonly settingsService: SettingsService) {}

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
		const config = this.settingsService.getStorageConfig();

		try {
			if (!fs.existsSync(config.repositoriesPath)) {
				// If repositories file doesn't exist, return defaults and create it
				const defaultData = this.getDefaultRepositories();
				this.writeRepositories(defaultData);
				return defaultData;
			}

			const data = fs.readFileSync(config.repositoriesPath, 'utf-8');
			const repositories = JSON.parse(data) as RepositoriesData;

			return repositories;
		} catch (error) {
			// If there's an error reading or parsing, return defaults
			console.error('Error reading repositories:', error);
			return this.getDefaultRepositories();
		}
	}

	/**
	 * Write repository data to storage
	 */
	writeRepositories(data: RepositoriesData): void {
		const config = this.settingsService.getStorageConfig();

		try {
			// Ensure .grove folder exists
			if (!fs.existsSync(config.groveFolder)) {
				fs.mkdirSync(config.groveFolder, { recursive: true });
			}

			// Write repositories with pretty formatting
			const jsonData = JSON.stringify(data, null, '\t');
			fs.writeFileSync(config.repositoriesPath, jsonData, 'utf-8');
		} catch (error) {
			console.error('Error writing repositories:', error);
			throw error;
		}
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

import fs from 'fs';
import path from 'path';

import { getStorageConfig } from './storage.js';
import type { RepositoriesData, Repository } from './types.js';

/**
 * Get default repositories data
 */
export function getDefaultRepositories(): RepositoriesData {
	return {
		repositories: [],
	};
}

/**
 * Read repositories from repositories.json
 */
export function readRepositories(): RepositoriesData {
	const config = getStorageConfig();

	try {
		if (!fs.existsSync(config.repositoriesPath)) {
			// If repositories file doesn't exist, return defaults and create it
			const defaultData = getDefaultRepositories();
			writeRepositories(defaultData);
			return defaultData;
		}

		const data = fs.readFileSync(config.repositoriesPath, 'utf-8');
		const repositories = JSON.parse(data) as RepositoriesData;

		return repositories;
	} catch (error) {
		// If there's an error reading or parsing, return defaults
		console.error('Error reading repositories:', error);
		return getDefaultRepositories();
	}
}

/**
 * Write repositories to repositories.json
 */
export function writeRepositories(data: RepositoriesData): void {
	const config = getStorageConfig();

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
export function isRepositoryRegistered(repoPath: string): boolean {
	const data = readRepositories();
	return data.repositories.some((repo) => repo.path === repoPath);
}

/**
 * Add a new repository to the registry
 */
export function addRepository(repoPath: string): Repository {
	const data = readRepositories();

	// Check if already registered
	if (isRepositoryRegistered(repoPath)) {
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
	writeRepositories(data);

	return repository;
}

/**
 * Remove a repository from the registry
 */
export function removeRepository(repoPath: string): boolean {
	const data = readRepositories();

	const initialLength = data.repositories.length;
	data.repositories = data.repositories.filter((repo) => repo.path !== repoPath);

	// Check if anything was removed
	if (data.repositories.length === initialLength) {
		return false;
	}

	// Save to file
	writeRepositories(data);

	return true;
}

/**
 * Get all registered repositories
 */
export function getAllRepositories(): Repository[] {
	const data = readRepositories();
	return data.repositories;
}

/**
 * Groves Service Implementation
 * Wraps groves.ts functions in a class for DI compatibility
 */
import type { IGrovesService } from '../services/interfaces.js';
import {
	addGroveToIndex,
	addWorktreeToGrove,
	deleteGrove,
	getAllGroves,
	getGroveById,
	readGroveMetadata,
	removeGroveFromIndex,
	updateGroveInIndex,
	writeGroveMetadata,
} from './groves.js';
import type { GroveMetadata, GroveReference, Worktree } from './types.js';

/**
 * Groves service implementation
 * Manages grove index and metadata
 */
export class GrovesService implements IGrovesService {
	/**
	 * Add a grove reference to the global index
	 */
	addGroveToIndex(groveRef: GroveReference): void {
		addGroveToIndex(groveRef);
	}

	/**
	 * Remove a grove from the index by ID
	 * @returns The removed grove reference, or null if not found
	 */
	removeGroveFromIndex(groveId: string): GroveReference | null {
		return removeGroveFromIndex(groveId);
	}

	/**
	 * Update a grove reference in the index
	 * @returns true if grove was found and updated
	 */
	updateGroveInIndex(
		groveId: string,
		updates: Partial<Pick<GroveReference, 'name' | 'updatedAt'>>
	): boolean {
		return updateGroveInIndex(groveId, updates);
	}

	/**
	 * Read grove metadata from a grove folder
	 */
	readGroveMetadata(grovePath: string): GroveMetadata | null {
		return readGroveMetadata(grovePath);
	}

	/**
	 * Write grove metadata to grove.json
	 */
	writeGroveMetadata(grovePath: string, metadata: GroveMetadata): void {
		writeGroveMetadata(grovePath, metadata);
	}

	/**
	 * Add a worktree entry to a grove's metadata
	 */
	addWorktreeToGrove(
		grovePath: string,
		repositoryName: string,
		repositoryPath: string,
		branch: string
	): Worktree {
		return addWorktreeToGrove(grovePath, repositoryName, repositoryPath, branch);
	}

	/**
	 * Get all groves from the index
	 */
	getAllGroves(): GroveReference[] {
		return getAllGroves();
	}

	/**
	 * Get a grove by its ID
	 */
	getGroveById(id: string): GroveReference | null {
		return getGroveById(id);
	}

	/**
	 * Delete a grove (remove from index and optionally delete folder)
	 */
	deleteGrove(groveId: string, deleteFolder?: boolean): boolean {
		return deleteGrove(groveId, deleteFolder);
	}
}

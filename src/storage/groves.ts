import fs from 'fs';
import path from 'path';

import { getStorageConfig } from './storage.js';
import type { GroveMetadata, GroveReference, GrovesIndex, Worktree } from './types.js';

/**
 * Get default groves index
 */
function getDefaultGrovesIndex(): GrovesIndex {
	return {
		groves: [],
	};
}

/**
 * Read groves index from groves.json (internal)
 */
function readGrovesIndex(): GrovesIndex {
	const config = getStorageConfig();

	try {
		if (!fs.existsSync(config.grovesIndexPath)) {
			// If groves index doesn't exist, return defaults and create it
			const defaultIndex = getDefaultGrovesIndex();
			writeGrovesIndex(defaultIndex);
			return defaultIndex;
		}

		const data = fs.readFileSync(config.grovesIndexPath, 'utf-8');
		const index = JSON.parse(data) as GrovesIndex;

		return index;
	} catch (error) {
		// If there's an error reading or parsing, return defaults
		console.error('Error reading groves index:', error);
		return getDefaultGrovesIndex();
	}
}

/**
 * Write groves index to groves.json (internal)
 */
function writeGrovesIndex(index: GrovesIndex): void {
	const config = getStorageConfig();

	try {
		// Ensure .grove folder exists
		if (!fs.existsSync(config.groveFolder)) {
			fs.mkdirSync(config.groveFolder, { recursive: true });
		}

		// Write index with pretty formatting
		const jsonData = JSON.stringify(index, null, '\t');
		fs.writeFileSync(config.grovesIndexPath, jsonData, 'utf-8');
	} catch (error) {
		console.error('Error writing groves index:', error);
		throw error;
	}
}

/**
 * Add a grove reference to the index
 * @param groveRef - The grove reference to add
 */
export function addGroveToIndex(groveRef: GroveReference): void {
	const index = readGrovesIndex();
	index.groves.push(groveRef);
	writeGrovesIndex(index);
}

/**
 * Remove a grove from the index by ID
 * @param groveId - ID of the grove to remove
 * @returns The removed grove reference, or null if not found
 */
export function removeGroveFromIndex(groveId: string): GroveReference | null {
	const index = readGrovesIndex();
	const groveRef = index.groves.find((ref) => ref.id === groveId);

	if (!groveRef) {
		return null;
	}

	index.groves = index.groves.filter((ref) => ref.id !== groveId);
	writeGrovesIndex(index);

	return groveRef;
}

/**
 * Update a grove reference in the index
 * @param groveId - ID of the grove to update
 * @param updates - Partial updates to apply (name, updatedAt)
 * @returns True if the grove was found and updated
 */
export function updateGroveInIndex(
	groveId: string,
	updates: Partial<Pick<GroveReference, 'name' | 'updatedAt'>>
): boolean {
	const index = readGrovesIndex();
	const groveRef = index.groves.find((ref) => ref.id === groveId);

	if (!groveRef) {
		return false;
	}

	if (updates.name !== undefined) {
		groveRef.name = updates.name;
	}
	if (updates.updatedAt !== undefined) {
		groveRef.updatedAt = updates.updatedAt;
	}

	writeGrovesIndex(index);
	return true;
}

/**
 * Read grove metadata from a grove folder
 */
export function readGroveMetadata(grovePath: string): GroveMetadata | null {
	const metadataPath = path.join(grovePath, 'grove.json');

	try {
		if (!fs.existsSync(metadataPath)) {
			return null;
		}

		const data = fs.readFileSync(metadataPath, 'utf-8');
		const metadata = JSON.parse(data) as GroveMetadata;

		return metadata;
	} catch (error) {
		console.error('Error reading grove metadata:', error);
		return null;
	}
}

/**
 * Write grove metadata to grove.json
 */
export function writeGroveMetadata(grovePath: string, metadata: GroveMetadata): void {
	const metadataPath = path.join(grovePath, 'grove.json');

	try {
		// Update the updatedAt timestamp
		metadata.updatedAt = new Date().toISOString();

		const jsonData = JSON.stringify(metadata, null, '\t');
		fs.writeFileSync(metadataPath, jsonData, 'utf-8');

		// Also update the groves index
		updateGroveInIndex(metadata.id, {
			name: metadata.name,
			updatedAt: metadata.updatedAt,
		});
	} catch (error) {
		console.error('Error writing grove metadata:', error);
		throw error;
	}
}

/**
 * Add a worktree to a grove
 */
export function addWorktreeToGrove(
	grovePath: string,
	repositoryName: string,
	repositoryPath: string,
	branch: string
): Worktree {
	const metadata = readGroveMetadata(grovePath);
	if (!metadata) {
		throw new Error(`Grove metadata not found: ${grovePath}`);
	}

	// Create worktree path
	const worktreePath = path.join(grovePath, `${repositoryName}.worktree`);

	// Create worktree entry
	const worktree: Worktree = {
		repositoryName,
		repositoryPath,
		worktreePath,
		branch,
	};

	// Add to metadata
	metadata.worktrees.push(worktree);

	// Save metadata
	writeGroveMetadata(grovePath, metadata);

	return worktree;
}

/**
 * Get all groves
 */
export function getAllGroves(): GroveReference[] {
	const index = readGrovesIndex();
	return index.groves;
}

/**
 * Get a grove by ID
 */
export function getGroveById(id: string): GroveReference | null {
	const index = readGrovesIndex();
	return index.groves.find((grove) => grove.id === id) || null;
}

/**
 * Delete a grove
 * @param groveId - ID of the grove to delete
 * @param deleteFolder - Whether to delete the grove folder (default: false)
 */
export function deleteGrove(groveId: string, deleteFolder: boolean = false): boolean {
	const groveRef = removeGroveFromIndex(groveId);

	if (!groveRef) {
		return false;
	}

	// Optionally delete the folder
	if (deleteFolder && fs.existsSync(groveRef.path)) {
		fs.rmSync(groveRef.path, { recursive: true, force: true });
	}

	return true;
}

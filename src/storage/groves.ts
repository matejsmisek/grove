import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { GitService } from '../services/GitService.js';
import { getStorageConfig, readSettings } from './storage.js';
import type { GroveMetadata, GroveReference, GrovesIndex, Repository, Worktree } from './types.js';

/**
 * Get default groves index
 */
export function getDefaultGrovesIndex(): GrovesIndex {
	return {
		groves: [],
	};
}

/**
 * Read groves index from groves.json
 */
export function readGrovesIndex(): GrovesIndex {
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
 * Write groves index to groves.json
 */
export function writeGrovesIndex(index: GrovesIndex): void {
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
 * Generate a unique ID for a grove
 */
function generateGroveId(): string {
	return crypto.randomBytes(16).toString('hex');
}

/**
 * Create a new grove
 * @param name - Name of the grove
 * @param repositories - Array of repositories to include
 * @returns The created grove metadata
 */
export async function createGrove(name: string, repositories: Repository[]): Promise<GroveMetadata> {
	const settings = readSettings();
	const groveId = generateGroveId();
	const grovePath = path.join(settings.workingFolder, name);

	// Check if grove folder already exists
	if (fs.existsSync(grovePath)) {
		throw new Error(`Grove folder already exists: ${grovePath}`);
	}

	// Create grove folder
	fs.mkdirSync(grovePath, { recursive: true });

	// Create CONTEXT.md file
	const contextPath = path.join(grovePath, 'CONTEXT.md');
	const contextContent = `# ${name}\n\nCreated: ${new Date().toISOString()}\n\n## Purpose\n\n[Add description of what you're working on in this grove]\n\n## Repositories\n\n${repositories.map((repo) => `- ${repo.name}: ${repo.path}`).join('\n')}\n\n## Notes\n\n[Add any additional notes or context here]\n`;
	fs.writeFileSync(contextPath, contextContent, 'utf-8');

	// Create grove metadata
	const now = new Date().toISOString();
	const metadata: GroveMetadata = {
		id: groveId,
		name,
		worktrees: [],
		createdAt: now,
		updatedAt: now,
	};

	// Create worktrees for each repository
	const worktrees: Worktree[] = [];
	const errors: string[] = [];

	for (const repo of repositories) {
		try {
			// Generate branch name for this grove
			const branchName = `grove/${name.toLowerCase().replace(/\s+/g, '-')}`;

			// Create worktree path
			const worktreePath = path.join(grovePath, `${repo.name}.worktree`);

			// Create GitService for the repository
			const gitService = new GitService(repo.path);

			// Add worktree (creates new branch from HEAD)
			const result = await gitService.addWorktree(worktreePath, branchName, 'HEAD');

			if (!result.success) {
				throw new Error(result.stderr || 'Failed to create worktree');
			}

			// Create worktree entry
			const worktree: Worktree = {
				repositoryName: repo.name,
				repositoryPath: repo.path,
				worktreePath,
				branch: branchName,
			};

			worktrees.push(worktree);
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Unknown error';
			errors.push(`${repo.name}: ${errorMsg}`);
		}
	}

	// If no worktrees were created, clean up and throw error
	if (worktrees.length === 0) {
		fs.rmSync(grovePath, { recursive: true, force: true });
		throw new Error(`Failed to create any worktrees:\n${errors.join('\n')}`);
	}

	// Update metadata with created worktrees
	metadata.worktrees = worktrees;

	// Save grove metadata to grove.json
	const metadataPath = path.join(grovePath, 'grove.json');
	fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, '\t'), 'utf-8');

	// Add to groves index
	const index = readGrovesIndex();
	const groveRef: GroveReference = {
		id: groveId,
		name,
		path: grovePath,
		createdAt: now,
		updatedAt: now,
	};
	index.groves.push(groveRef);
	writeGrovesIndex(index);

	// If there were partial errors, include them in the metadata
	if (errors.length > 0) {
		throw new Error(
			`Grove created with ${worktrees.length} worktree(s), but ${errors.length} failed:\n${errors.join('\n')}`,
		);
	}

	return metadata;
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
		const index = readGrovesIndex();
		const groveRef = index.groves.find((ref) => ref.id === metadata.id);
		if (groveRef) {
			groveRef.updatedAt = metadata.updatedAt;
			groveRef.name = metadata.name;
			writeGrovesIndex(index);
		}
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
	branch: string,
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
	const index = readGrovesIndex();
	const groveRef = index.groves.find((ref) => ref.id === groveId);

	if (!groveRef) {
		return false;
	}

	// Remove from index
	index.groves = index.groves.filter((ref) => ref.id !== groveId);
	writeGrovesIndex(index);

	// Optionally delete the folder
	if (deleteFolder && fs.existsSync(groveRef.path)) {
		fs.rmSync(groveRef.path, { recursive: true, force: true });
	}

	return true;
}

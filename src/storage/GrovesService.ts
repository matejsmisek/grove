import fs from 'fs';
import path from 'path';

import { JsonStore } from './JsonStore.js';
import type { ISettingsService } from './SettingsService.js';
import type { GroveMetadata, GroveReference, GrovesIndex, Worktree } from './types.js';

/**
 * Groves service interface
 * Manages grove index and metadata stored in ~/.grove/groves.json
 * and individual grove.json files
 */
export interface IGrovesService {
	/** Add a grove reference to the global index */
	addGroveToIndex(groveRef: GroveReference): void;
	/**
	 * Remove a grove from the index by ID
	 * @returns The removed grove reference, or null if not found
	 */
	removeGroveFromIndex(groveId: string): GroveReference | null;
	/**
	 * Update a grove reference in the index
	 * @returns true if grove was found and updated
	 */
	updateGroveInIndex(
		groveId: string,
		updates: Partial<Pick<GroveReference, 'name' | 'updatedAt'>>
	): boolean;
	/** Read grove metadata from a grove folder */
	readGroveMetadata(grovePath: string): GroveMetadata | null;
	/** Write grove metadata to grove.json */
	writeGroveMetadata(grovePath: string, metadata: GroveMetadata): void;
	/** Add a worktree entry to a grove's metadata */
	addWorktreeToGrove(
		grovePath: string,
		repositoryName: string,
		repositoryPath: string,
		branch: string
	): Worktree;
	/** Get all groves from the index */
	getAllGroves(): GroveReference[];
	/** Get a grove by its ID */
	getGroveById(id: string): GroveReference | null;
	/** Delete a grove (remove from index and optionally delete folder) */
	deleteGrove(groveId: string, deleteFolder?: boolean): boolean;
}

/**
 * Groves service implementation
 * Manages grove index and metadata stored in ~/.grove/groves.json
 * and individual grove.json files
 */
export class GrovesService implements IGrovesService {
	private indexStore: JsonStore<GrovesIndex>;

	constructor(private readonly settingsService: ISettingsService) {
		this.indexStore = new JsonStore<GrovesIndex>(
			() => this.settingsService.getStorageConfig().grovesIndexPath,
			() => this.settingsService.getStorageConfig().groveFolder,
			() => ({ groves: [] }),
			{ label: 'groves index' }
		);
	}

	/**
	 * Read groves index from groves.json (internal)
	 */
	private readGrovesIndex(): GrovesIndex {
		return this.indexStore.read();
	}

	/**
	 * Write groves index to groves.json (internal)
	 */
	private writeGrovesIndex(index: GrovesIndex): void {
		this.indexStore.write(index);
	}

	/**
	 * Add a grove reference to the global index
	 */
	addGroveToIndex(groveRef: GroveReference): void {
		const index = this.readGrovesIndex();
		index.groves.push(groveRef);
		this.writeGrovesIndex(index);
	}

	/**
	 * Remove a grove from the index by ID
	 * @returns The removed grove reference, or null if not found
	 */
	removeGroveFromIndex(groveId: string): GroveReference | null {
		const index = this.readGrovesIndex();
		const groveRef = index.groves.find((ref) => ref.id === groveId);

		if (!groveRef) {
			return null;
		}

		index.groves = index.groves.filter((ref) => ref.id !== groveId);
		this.writeGrovesIndex(index);

		return groveRef;
	}

	/**
	 * Update a grove reference in the index
	 * @returns true if grove was found and updated
	 */
	updateGroveInIndex(
		groveId: string,
		updates: Partial<Pick<GroveReference, 'name' | 'updatedAt'>>
	): boolean {
		const index = this.readGrovesIndex();
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

		this.writeGrovesIndex(index);
		return true;
	}

	/**
	 * Read grove metadata from a grove folder
	 */
	readGroveMetadata(grovePath: string): GroveMetadata | null {
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
	writeGroveMetadata(grovePath: string, metadata: GroveMetadata): void {
		const metadataPath = path.join(grovePath, 'grove.json');

		try {
			// Update the updatedAt timestamp
			metadata.updatedAt = new Date().toISOString();

			const jsonData = JSON.stringify(metadata, null, '\t');
			fs.writeFileSync(metadataPath, jsonData, 'utf-8');

			// Also update the groves index
			this.updateGroveInIndex(metadata.id, {
				name: metadata.name,
				updatedAt: metadata.updatedAt,
			});
		} catch (error) {
			console.error('Error writing grove metadata:', error);
			throw error;
		}
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
		const metadata = this.readGroveMetadata(grovePath);
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
		this.writeGroveMetadata(grovePath, metadata);

		return worktree;
	}

	/**
	 * Get all groves from the index
	 */
	getAllGroves(): GroveReference[] {
		const index = this.readGrovesIndex();
		return index.groves;
	}

	/**
	 * Get a grove by its ID
	 */
	getGroveById(id: string): GroveReference | null {
		const index = this.readGrovesIndex();
		return index.groves.find((grove) => grove.id === id) || null;
	}

	/**
	 * Delete a grove (remove from index and optionally delete folder)
	 */
	deleteGrove(groveId: string, deleteFolder: boolean = false): boolean {
		const groveRef = this.removeGroveFromIndex(groveId);

		if (!groveRef) {
			return false;
		}

		// Optionally delete the folder
		if (deleteFolder && fs.existsSync(groveRef.path)) {
			fs.rmSync(groveRef.path, { recursive: true, force: true });
		}

		return true;
	}
}

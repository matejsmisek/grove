import path from 'path';

import { getContainer } from '../di/index.js';
import { GrovesServiceToken } from '../services/tokens.js';
import type { GroveMetadata, GroveReference, Worktree } from '../storage/types.js';

/**
 * Result of grove status command
 */
export interface StatusResult {
	success: boolean;
	message: string;
	groveId?: string;
	groveName?: string;
	worktreeId?: string;
	worktreeName?: string;
	repository?: string;
}

/**
 * Find which grove the current directory belongs to
 * Compares cwd against all known grove paths from the groves index
 * Works at any depth within a grove folder
 */
function findGroveForPath(resolvedCwd: string, groves: GroveReference[]): GroveReference | null {
	// Ensure cwd ends with separator for accurate prefix matching
	const cwdWithSep = resolvedCwd.endsWith(path.sep) ? resolvedCwd : resolvedCwd + path.sep;

	for (const grove of groves) {
		const grovePathWithSep = grove.path.endsWith(path.sep) ? grove.path : grove.path + path.sep;
		// Check if cwd is the grove path or inside it
		if (resolvedCwd === grove.path || cwdWithSep.startsWith(grovePathWithSep)) {
			return grove;
		}
	}
	return null;
}

/**
 * Find which worktree matches the current directory
 * Returns the worktree if we're inside one, null otherwise
 */
function findCurrentWorktree(resolvedCwd: string, metadata: GroveMetadata): Worktree | null {
	const cwdWithSep = resolvedCwd.endsWith(path.sep) ? resolvedCwd : resolvedCwd + path.sep;

	for (const worktree of metadata.worktrees) {
		const worktreePathWithSep = worktree.worktreePath.endsWith(path.sep)
			? worktree.worktreePath
			: worktree.worktreePath + path.sep;
		// Check if cwd is the worktree path or inside it
		if (resolvedCwd === worktree.worktreePath || cwdWithSep.startsWith(worktreePathWithSep)) {
			return worktree;
		}
	}
	return null;
}

/**
 * Build the repository identifier, using repo.project notation for monorepo projects
 */
function formatRepository(worktree: Worktree): string {
	return worktree.projectPath
		? `${worktree.repositoryName}.${worktree.projectPath}`
		: worktree.repositoryName;
}

/**
 * Report status of the grove worktree containing the current directory.
 *
 * Detects whether the cwd is inside a known grove worktree and, when it is,
 * returns the grove ID, worktree ID, and repository (with repo.project notation
 * for monorepo projects).
 *
 * @returns Result with grove/worktree details on success
 */
export function groveStatus(): StatusResult {
	try {
		const container = getContainer();
		const grovesService = container.resolve(GrovesServiceToken);

		const resolvedCwd = path.resolve(process.cwd());
		const allGroves = grovesService.getAllGroves();

		const groveRef = findGroveForPath(resolvedCwd, allGroves);
		if (!groveRef) {
			return {
				success: false,
				message: 'Not inside a grove worktree.',
			};
		}

		const metadata = grovesService.readGroveMetadata(groveRef.path);
		if (!metadata) {
			return {
				success: false,
				message: `Could not read grove metadata from ${groveRef.path}`,
			};
		}

		const worktree = findCurrentWorktree(resolvedCwd, metadata);
		if (!worktree) {
			return {
				success: false,
				message: `Inside grove '${metadata.name}' but not inside a specific worktree.`,
				groveId: groveRef.id,
				groveName: metadata.name,
			};
		}

		// The worktree's ID is its folder name.
		const worktreeId = path.basename(worktree.worktreePath);

		return {
			success: true,
			message: `In worktree '${worktreeId}' of grove '${metadata.name}'`,
			groveId: groveRef.id,
			groveName: metadata.name,
			worktreeId,
			worktreeName: worktree.name,
			repository: formatRepository(worktree),
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
		return {
			success: false,
			message: `Failed to determine grove status: ${errorMessage}`,
		};
	}
}

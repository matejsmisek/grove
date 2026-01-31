import fs from 'fs';
import path from 'path';

import { getContainer } from '../di/index.js';
import { ClaudeSessionServiceToken, GrovesServiceToken } from '../services/tokens.js';
import type { GroveMetadata, Worktree } from '../storage/types.js';

/**
 * Result of grove claude command
 */
export interface ClaudeResult {
	success: boolean;
	message: string;
}

/**
 * Check if the given directory is a grove folder
 * A grove folder contains a grove.json file
 */
function isGrovePath(dirPath: string): boolean {
	const groveJsonPath = path.join(dirPath, 'grove.json');
	return fs.existsSync(groveJsonPath);
}

/**
 * Find the grove folder from a path
 * Checks the path itself and parent directories up to 3 levels
 * Also checks if we're inside a worktree folder within a grove
 */
function findGrovePath(startPath: string): string | null {
	let currentPath = path.resolve(startPath);

	// Check up to 5 levels (to account for being inside worktree/project folders)
	for (let i = 0; i < 5; i++) {
		if (isGrovePath(currentPath)) {
			return currentPath;
		}
		const parentPath = path.dirname(currentPath);
		if (parentPath === currentPath) {
			// Reached root
			break;
		}
		currentPath = parentPath;
	}
	return null;
}

/**
 * Find which worktree matches the current directory
 * Returns the worktree if we're inside one, null otherwise
 */
function findCurrentWorktree(cwd: string, metadata: GroveMetadata): Worktree | null {
	const resolvedCwd = path.resolve(cwd);

	// Check if we're in or under a worktree path
	for (const worktree of metadata.worktrees) {
		const resolvedWorktreePath = path.resolve(worktree.worktreePath);
		if (resolvedCwd.startsWith(resolvedWorktreePath)) {
			return worktree;
		}
	}
	return null;
}

/**
 * Open Claude session for the current grove
 * If in a grove folder or worktree, opens Claude with the appropriate working directory
 * @param cwd - Current working directory (defaults to process.cwd())
 * @returns Result indicating success or failure
 */
export function openClaude(cwd?: string): ClaudeResult {
	try {
		const currentDir = cwd || process.cwd();

		// Find the grove folder
		const grovePath = findGrovePath(currentDir);
		if (!grovePath) {
			return {
				success: false,
				message: 'Not in a grove folder. Navigate to a grove folder or worktree first.',
			};
		}

		// Get services from DI container
		const container = getContainer();
		const grovesService = container.resolve(GrovesServiceToken);
		const claudeSessionService = container.resolve(ClaudeSessionServiceToken);

		// Read grove metadata
		const metadata = grovesService.readGroveMetadata(grovePath);
		if (!metadata) {
			return {
				success: false,
				message: `Could not read grove metadata from ${grovePath}`,
			};
		}

		// Check if there are any worktrees
		if (metadata.worktrees.length === 0) {
			return {
				success: false,
				message: 'Grove has no worktrees',
			};
		}

		// Determine which worktree to use
		let targetWorktree: Worktree;

		// Check if we're inside a specific worktree
		const currentWorktree = findCurrentWorktree(currentDir, metadata);
		if (currentWorktree) {
			targetWorktree = currentWorktree;
		} else if (metadata.worktrees.length === 1) {
			// Only one worktree, use it
			targetWorktree = metadata.worktrees[0];
		} else {
			// Multiple worktrees and not in a specific one - list them
			const worktreeNames = metadata.worktrees
				.map((w) => `  - ${w.repositoryName}${w.projectPath ? `/${w.projectPath}` : ''}`)
				.join('\n');
			return {
				success: false,
				message: `Grove has multiple worktrees. Navigate to a specific worktree or specify which one:\n${worktreeNames}`,
			};
		}

		// Determine working directory (project path if monorepo, otherwise worktree root)
		const workingDir = targetWorktree.projectPath
			? path.join(targetWorktree.worktreePath, targetWorktree.projectPath)
			: targetWorktree.worktreePath;

		// Open Claude session
		const result = claudeSessionService.openSession(
			workingDir,
			targetWorktree.repositoryPath,
			targetWorktree.projectPath,
			undefined, // Use default terminal
			metadata.name
		);

		if (!result.success) {
			return {
				success: false,
				message: result.message,
			};
		}

		const displayName = targetWorktree.projectPath
			? `${targetWorktree.repositoryName}/${targetWorktree.projectPath}`
			: targetWorktree.repositoryName;

		return {
			success: true,
			message: `Opened Claude session for ${displayName} in grove '${metadata.name}'`,
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
		return {
			success: false,
			message: `Failed to open Claude session: ${errorMessage}`,
		};
	}
}

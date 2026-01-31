import path from 'path';

import { getContainer } from '../di/index.js';
import { ClaudeSessionServiceToken, GrovesServiceToken } from '../services/tokens.js';
import type { GroveMetadata, GroveReference, Worktree } from '../storage/types.js';

/**
 * Result of grove claude command
 */
export interface ClaudeResult {
	success: boolean;
	message: string;
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
 * Open Claude session for the current grove
 * Detects grove by comparing cwd against known grove paths from the index
 * @param cwd - Current working directory (defaults to process.cwd())
 * @returns Result indicating success or failure
 */
export function openClaude(cwd?: string): ClaudeResult {
	try {
		const currentDir = path.resolve(cwd || process.cwd());

		// Get services from DI container
		const container = getContainer();
		const grovesService = container.resolve(GrovesServiceToken);
		const claudeSessionService = container.resolve(ClaudeSessionServiceToken);

		// Get all known groves from the index
		const allGroves = grovesService.getAllGroves();

		// Find which grove we're in
		const groveRef = findGroveForPath(currentDir, allGroves);
		if (!groveRef) {
			return {
				success: false,
				message: 'Not in a grove folder. Navigate to a grove folder or worktree first.',
			};
		}

		// Read grove metadata
		const metadata = grovesService.readGroveMetadata(groveRef.path);
		if (!metadata) {
			return {
				success: false,
				message: `Could not read grove metadata from ${groveRef.path}`,
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

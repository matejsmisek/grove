import fs from 'fs';
import path from 'path';

import type { IGrovesService } from '../storage/GrovesService.js';
import type { Repository } from '../storage/types.js';
import type { IGitService } from './GitService.js';

/** An existing git worktree (created outside Grove) that no grove tracks yet. */
export interface AdoptableWorktree {
	repository: Repository;
	/** Canonical absolute path to the worktree */
	worktreePath: string;
	/** Branch checked out in the worktree ('detached' when none) */
	branch: string;
}

/**
 * Resolve a path to its canonical form for comparisons (symlinks such as
 * /tmp -> /private/tmp on macOS would otherwise make equal paths differ).
 */
export function canonicalPath(p: string): string {
	try {
		return fs.realpathSync(p);
	} catch {
		return path.resolve(p);
	}
}

/**
 * Find linked git worktrees of the given repositories that no grove tracks
 * yet - candidates for adoption. Skips each repository's main checkout and
 * every worktree already recorded in a grove (ignoring closed entries, whose
 * folders no longer exist). Repositories whose worktrees cannot be listed
 * are skipped silently.
 */
export async function findAdoptableWorktrees(
	gitService: IGitService,
	grovesService: IGrovesService,
	repositories: Repository[]
): Promise<AdoptableWorktree[]> {
	// Worktrees any grove already tracks.
	const trackedPaths = new Set<string>();
	for (const ref of grovesService.getAllGroves()) {
		const metadata = grovesService.readGroveMetadata(ref.path);
		for (const worktree of metadata?.worktrees ?? []) {
			if (!worktree.closed) {
				trackedPaths.add(canonicalPath(worktree.worktreePath));
			}
		}
	}

	const found: AdoptableWorktree[] = [];
	for (const repository of repositories) {
		const result = await gitService.listWorktrees(repository.path);
		if (!result.success) {
			continue;
		}
		const repoPath = canonicalPath(repository.path);
		for (const info of gitService.parseWorktreeList(result.stdout)) {
			const worktreePath = canonicalPath(info.path);
			// Skip the main checkout and anything a grove already tracks.
			if (worktreePath === repoPath || trackedPaths.has(worktreePath)) {
				continue;
			}
			found.push({
				repository,
				worktreePath,
				branch: info.branch.replace(/^refs\/heads\//, ''),
			});
		}
	}

	return found;
}

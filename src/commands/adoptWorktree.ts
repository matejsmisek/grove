import fs from 'fs';

import { getContainer } from '../di/index.js';
import { findMainRepoRootSync, isGitWorktree } from '../git/index.js';
import { canonicalPath } from '../services/adoptableWorktrees.js';
import { GitServiceToken, GroveServiceToken, RepositoryServiceToken } from '../services/tokens.js';

/**
 * Result of adopt-worktree command
 */
export interface AdoptWorktreeResult {
	success: boolean;
	message: string;
	worktreeId?: string;
	worktreeName?: string;
	worktreePath?: string;
	branch?: string;
}

/**
 * Adopt an existing git worktree (created outside Grove, e.g. with plain
 * `git worktree add`) into a grove. The worktree stays where it is on disk and
 * keeps its branch; only grove metadata is written, so it shows up in the UI
 * like any other worktree. The worktree's repository must be registered.
 *
 * @param groveId - ID of the grove to adopt the worktree into
 * @param worktreePathArg - Path to the existing worktree (relative or absolute)
 * @param name - Display name for the worktree (defaults to its folder name)
 * @returns Result with the adopted worktree's id, name, path and branch on success
 */
export async function adoptWorktree(
	groveId: string,
	worktreePathArg: string,
	name?: string
): Promise<AdoptWorktreeResult> {
	try {
		// Get services from DI container
		const container = getContainer();
		const repositoryService = container.resolve(RepositoryServiceToken);
		const gitService = container.resolve(GitServiceToken);
		const groveService = container.resolve(GroveServiceToken);

		const worktreePath = canonicalPath(worktreePathArg);
		if (!fs.existsSync(worktreePath)) {
			return { success: false, message: `Path does not exist: ${worktreePath}` };
		}

		if (!(await isGitWorktree(worktreePath))) {
			return {
				success: false,
				message: `'${worktreePath}' is not a linked git worktree (the main checkout cannot be adopted)`,
			};
		}

		// Resolve the worktree back to its main repository and require that
		// repository to be registered, so the adopted worktree behaves like any
		// other (status, sessions, IDE shortcuts).
		const repoRoot = findMainRepoRootSync(worktreePath);
		if (!repoRoot) {
			return {
				success: false,
				message: `Could not resolve the main repository for '${worktreePath}'`,
			};
		}

		const repository = repositoryService
			.getAllRepositories()
			.find((repo) => canonicalPath(repo.path) === canonicalPath(repoRoot));
		if (!repository) {
			return {
				success: false,
				message: `Repository '${repoRoot}' is not registered. Run 'grove workspace add-repository ${repoRoot}' first.`,
			};
		}

		// Confirm git itself lists this path as a worktree of the repository.
		const listResult = await gitService.listWorktrees(repository.path);
		if (!listResult.success) {
			return { success: false, message: `Failed to list worktrees: ${listResult.stderr}` };
		}
		const isListed = gitService
			.parseWorktreeList(listResult.stdout)
			.some((info) => canonicalPath(info.path) === worktreePath);
		if (!isListed) {
			return {
				success: false,
				message: `'${worktreePath}' is not a worktree of repository '${repository.name}'`,
			};
		}

		const branch = await gitService.getCurrentBranch(worktreePath);

		const metadata = groveService.adoptWorktreeIntoGrove(groveId, {
			repository,
			worktreePath,
			branch,
			name,
		});

		const adopted = metadata.worktrees[metadata.worktrees.length - 1];
		return {
			success: true,
			message: `Adopted worktree into grove "${metadata.name}"`,
			worktreeId: adopted.id,
			worktreeName: adopted.name,
			worktreePath: adopted.worktreePath,
			branch: adopted.branch,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		return { success: false, message };
	}
}

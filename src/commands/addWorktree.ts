import path from 'path';

import { getContainer } from '../di/index.js';
import {
	GroveServiceToken,
	GrovesServiceToken,
	RepositoryServiceToken,
} from '../services/tokens.js';

/**
 * Result of add-worktree command
 */
export interface AddWorktreeResult {
	success: boolean;
	message: string;
	worktreeId?: string;
	worktreeName?: string;
	worktreePath?: string;
}

/**
 * Parse repository argument into repository name and optional project path
 * Supports formats:
 * - "reponame" - whole repository
 * - "reponame.projectfolder" - monorepo project
 */
function parseRepositoryArg(repoArg: string): { repoName: string; projectPath?: string } {
	const parts = repoArg.split('.');
	if (parts.length === 1) {
		return { repoName: parts[0] };
	}
	// First part is repo name, rest is project path (in case project has dots)
	const repoName = parts[0];
	const projectPath = parts.slice(1).join('.');
	return { repoName, projectPath };
}

/**
 * Add a worktree to an existing grove from the command line.
 *
 * Two modes:
 * - Standard: `repoArg` selects the repository (reponame or reponame.project), branching off main.
 * - Fork: `forkFromWorktreeId` names an existing worktree in the grove; the new worktree branches
 *   off that worktree's branch. `repoArg` is optional here — when omitted it reuses the source
 *   worktree's project; when provided it may select a different project within the same repository
 *   (a monorepo). Selecting a different repository is rejected.
 *
 * @param groveId - ID of the grove to add the worktree to
 * @param worktreeName - Name for the new worktree
 * @param repoArg - Repository argument (reponame or reponame.project); optional in fork mode
 * @param forkFromWorktreeId - Name (or folder) of the worktree to fork from
 * @returns Result with worktree path on success
 */
export async function addWorktree(
	groveId: string,
	worktreeName: string,
	repoArg?: string,
	forkFromWorktreeId?: string
): Promise<AddWorktreeResult> {
	try {
		// Get services from DI container
		const container = getContainer();
		const repositoryService = container.resolve(RepositoryServiceToken);
		const groveService = container.resolve(GroveServiceToken);
		const grovesService = container.resolve(GrovesServiceToken);

		const repositories = repositoryService.getAllRepositories();

		let selection: { repository: (typeof repositories)[number]; projectPath?: string };
		let forkFromWorktreePath: string | undefined;

		if (forkFromWorktreeId) {
			// Fork mode: resolve the source worktree and derive its repository/project/branch.
			const groveRef = grovesService.getGroveById(groveId);
			if (!groveRef) {
				return { success: false, message: `Grove '${groveId}' not found` };
			}
			const metadata = grovesService.readGroveMetadata(groveRef.path);
			if (!metadata) {
				return { success: false, message: `Grove metadata for '${groveId}' not found` };
			}

			// Match the source worktree by its name or by its folder basename.
			const source = metadata.worktrees.find(
				(w) =>
					!w.closed &&
					(w.name === forkFromWorktreeId || path.basename(w.worktreePath) === forkFromWorktreeId)
			);

			if (!source) {
				const available = metadata.worktrees
					.filter((w) => !w.closed)
					.map((w) => w.name || path.basename(w.worktreePath))
					.join(', ');
				return {
					success: false,
					message: `Worktree '${forkFromWorktreeId}' not found in grove. Available: ${available || 'none'}`,
				};
			}

			const repository = repositories.find((r) => r.path === source.repositoryPath);
			if (!repository) {
				return {
					success: false,
					message: `Repository for worktree '${forkFromWorktreeId}' (${source.repositoryName}) is not registered.`,
				};
			}

			// A fork stays within the source worktree's repository. The repository argument is
			// optional: when omitted, the new worktree reuses the source worktree's project; when
			// provided, it may pick a different project within the same (monorepo) repository.
			let projectPath = source.projectPath;
			if (repoArg) {
				const parsed = parseRepositoryArg(repoArg);

				// Only the source repository may be forked into.
				if (parsed.repoName.toLowerCase() !== repository.name.toLowerCase()) {
					return {
						success: false,
						message: `Cannot fork '${forkFromWorktreeId}' into '${parsed.repoName}'. Forks must stay within the source repository '${repository.name}'.`,
					};
				}

				// A project path requires the repository to be a monorepo.
				if (parsed.projectPath && !repository.isMonorepo) {
					return {
						success: false,
						message: `Repository '${repository.name}' is not a monorepo, so a project path cannot be selected.`,
					};
				}

				projectPath = parsed.projectPath;
			}

			selection = { repository, projectPath };
			forkFromWorktreePath = source.worktreePath;
		} else {
			if (!repoArg) {
				return {
					success: false,
					message: 'Repository is required when not using --fork.',
				};
			}

			// Parse repository argument
			const { repoName, projectPath } = parseRepositoryArg(repoArg);

			// Find the repository by name
			const repository = repositories.find((r) => r.name.toLowerCase() === repoName.toLowerCase());

			if (!repository) {
				const availableRepos = repositories.map((r) => r.name).join(', ');
				return {
					success: false,
					message: `Repository '${repoName}' not found. Available: ${availableRepos || 'none (register with --register)'}`,
				};
			}

			// If project path specified, verify the repository is a monorepo
			if (projectPath && !repository.isMonorepo) {
				return {
					success: false,
					message: `Repository '${repoName}' is not marked as a monorepo. Use '${repoName}' without project path or mark it as a monorepo first.`,
				};
			}

			selection = { repository, projectPath };
		}

		// Add worktree to the grove with progress logging to console
		const metadata = await groveService.addWorktreeToGrove(
			groveId,
			selection,
			worktreeName,
			(message) => {
				console.log('  ', message);
			},
			forkFromWorktreePath
		);

		// Find the newly added worktree (it's the last one)
		const newWorktree = metadata.worktrees[metadata.worktrees.length - 1];

		return {
			success: true,
			message: `Worktree '${worktreeName}' added to grove '${metadata.name}'`,
			worktreeId: newWorktree?.name,
			worktreeName: worktreeName,
			worktreePath: newWorktree?.worktreePath,
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
		return {
			success: false,
			message: `Failed to add worktree: ${errorMessage}`,
		};
	}
}

import { getContainer } from '../di/index.js';
import { GroveServiceToken, RepositoryServiceToken } from '../services/tokens.js';

/**
 * Result of add-worktree command
 */
export interface AddWorktreeResult {
	success: boolean;
	message: string;
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
 * Add a worktree to an existing grove from the command line
 * @param groveId - ID of the grove to add the worktree to
 * @param worktreeName - Name for the new worktree
 * @param repoArg - Repository argument (reponame or reponame.project)
 * @returns Result with worktree path on success
 */
export async function addWorktree(
	groveId: string,
	worktreeName: string,
	repoArg: string
): Promise<AddWorktreeResult> {
	try {
		// Get services from DI container
		const container = getContainer();
		const repositoryService = container.resolve(RepositoryServiceToken);
		const groveService = container.resolve(GroveServiceToken);

		// Parse repository argument
		const { repoName, projectPath } = parseRepositoryArg(repoArg);

		// Find the repository by name
		const repositories = repositoryService.getAllRepositories();
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

		// Create repository selection
		const selection = {
			repository,
			projectPath,
		};

		// Add worktree to the grove with progress logging to console
		const metadata = await groveService.addWorktreeToGrove(
			groveId,
			selection,
			worktreeName,
			(message) => {
				console.log('  ', message);
			}
		);

		// Find the newly added worktree (it's the last one)
		const newWorktree = metadata.worktrees[metadata.worktrees.length - 1];

		return {
			success: true,
			message: `Worktree '${worktreeName}' added to grove '${metadata.name}'`,
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

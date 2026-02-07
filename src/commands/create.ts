import { getContainer } from '../di/index.js';
import { GroveServiceToken, RepositoryServiceToken } from '../services/tokens.js';
import type { RepositorySelection } from '../storage/types.js';

/**
 * Result of grove create command
 */
export interface CreateResult {
	success: boolean;
	message: string;
	grovePath?: string;
	groveId?: string;
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
 * Create a new grove from the command line
 * @param name - Name of the grove
 * @param repoArg - Repository argument (reponame or reponame.project), optional for empty groves
 * @returns Result with grove path and ID on success
 */
export async function createGrove(name: string, repoArg?: string): Promise<CreateResult> {
	try {
		// Get services from DI container
		const container = getContainer();
		const repositoryService = container.resolve(RepositoryServiceToken);
		const groveService = container.resolve(GroveServiceToken);

		let selections: RepositorySelection[] = [];

		if (repoArg) {
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
			selections = [
				{
					repository,
					projectPath,
				},
			];
		}

		// Create the grove with progress logging to console
		const metadata = await groveService.createGrove(name, selections, (message) => {
			console.log('  ', message);
		});

		// Get the grove path from the first worktree's parent directory,
		// or use the settings working folder for empty groves
		const grovePath =
			metadata.worktrees.length > 0
				? metadata.worktrees[0].worktreePath.replace(/\/[^/]+$/, '')
				: undefined;

		const worktreeCount = metadata.worktrees.length;
		const suffix = worktreeCount === 0 ? ' (empty, add worktrees with: grove add-worktree)' : '';

		return {
			success: true,
			message: `Grove '${metadata.name}' created successfully${suffix}`,
			grovePath,
			groveId: metadata.id,
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
		return {
			success: false,
			message: `Failed to create grove: ${errorMessage}`,
		};
	}
}

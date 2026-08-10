/**
 * Shared lookups for resolving a grove or worktree from CLI arguments.
 */
import type { IGrovesService } from '../storage/GrovesService.js';
import type { GroveMetadata, GroveReference, Worktree } from '../storage/types.js';

export type WorktreeMatch = {
	groveRef: GroveReference;
	metadata: GroveMetadata;
	worktree: Worktree;
};

/**
 * Find an open worktree by its globally-unique id across every grove. Worktree
 * ids are unique, so no grove needs to be specified.
 */
export function findOpenWorktreeById(
	grovesService: IGrovesService,
	worktreeId: string
): WorktreeMatch | { error: string } {
	for (const groveRef of grovesService.getAllGroves()) {
		const metadata = grovesService.readGroveMetadata(groveRef.path);
		if (!metadata) {
			continue;
		}
		const worktree = metadata.worktrees.find((w) => !w.closed && w.id === worktreeId);
		if (worktree) {
			return { groveRef, metadata, worktree };
		}
	}
	return {
		error: `Worktree with id '${worktreeId}' not found. Run 'grove list' to see worktree ids.`,
	};
}

/**
 * Resolve a grove by its id, falling back to a unique display-name match. An
 * ambiguous name (more than one grove) is reported as an error listing the ids.
 */
export function findGroveByIdOrName(
	grovesService: IGrovesService,
	identifier: string
): { groveRef: GroveReference } | { error: string } {
	const byId = grovesService.getGroveById(identifier);
	if (byId) {
		return { groveRef: byId };
	}

	const byName = grovesService.getAllGroves().filter((g) => g.name === identifier);
	if (byName.length === 1) {
		return { groveRef: byName[0] };
	}
	if (byName.length > 1) {
		const list = byName.map((g) => `  - ${g.id} (${g.name})`).join('\n');
		return { error: `Multiple groves named '${identifier}'. Use the grove id:\n${list}` };
	}

	return { error: `Grove '${identifier}' not found. Run 'grove list' to see groves.` };
}

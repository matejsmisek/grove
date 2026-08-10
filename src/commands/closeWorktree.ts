import { getContainer } from '../di/index.js';
import {
	GitLabPluginToken,
	GitServiceToken,
	GroveServiceToken,
	GrovesServiceToken,
} from '../services/tokens.js';
import { confirmYesNo, isInteractive } from './confirm.js';
import { findOpenWorktreeById } from './worktreeLookup.js';
import { computeWorktreeSafety, describeWorktreeIssues } from './worktreeSafety.js';

export interface CloseWorktreeCommandResult {
	success: boolean;
	message: string;
	/** Extra lines printed indented under the message. */
	details?: string[];
	/**
	 * True when the close was refused/aborted for safety (unmerged work) rather
	 * than failing outright — the exit code is still non-zero.
	 */
	blocked?: boolean;
}

/**
 * Close a single worktree from the CLI, identified by its globally-unique id
 * (see `grove list`). Mirrors the interactive close screen's safety checks: when
 * the worktree has unsaved or unmerged work the command prompts for confirmation
 * (interactive terminal) or refuses and points at `--force` (non-interactive,
 * e.g. a Claude session). `--force` skips all checks.
 *
 * @param worktreeId - Globally-unique worktree id.
 * @param force - Skip safety checks and close unconditionally.
 */
export async function closeWorktreeCommand(
	worktreeId: string,
	force: boolean
): Promise<CloseWorktreeCommandResult> {
	try {
		const container = getContainer();
		const grovesService = container.resolve(GrovesServiceToken);
		const groveService = container.resolve(GroveServiceToken);
		const gitService = container.resolve(GitServiceToken);
		const gitlabPlugin = container.resolve(GitLabPluginToken);

		const match = findOpenWorktreeById(grovesService, worktreeId);
		if ('error' in match) {
			return { success: false, message: match.error };
		}
		const { metadata, worktree } = match;

		if (!force) {
			const safety = await computeWorktreeSafety({ gitService, gitlabPlugin }, worktree, {
				prune: true,
			});
			if (safety.hasIssues) {
				const reasons = describeWorktreeIssues(safety).join(', ');

				if (!isInteractive()) {
					return {
						success: false,
						blocked: true,
						message: `Refusing to close worktree '${worktree.name}': ${reasons}.`,
						details: ['Re-run with --force to close anyway.'],
					};
				}

				console.error(
					`Worktree '${worktree.name}' (${worktree.branch}) has unsaved or unmerged work: ${reasons}.`
				);
				const confirmed = await confirmYesNo(`Close worktree '${worktree.name}' and delete it anyway?`);
				if (!confirmed) {
					return { success: false, blocked: true, message: 'Aborted. Worktree was not closed.' };
				}
			}
		}

		const result = await groveService.closeWorktree(metadata.id, worktree.worktreePath);
		if (!result.success) {
			return {
				success: false,
				message: result.message ?? 'Failed to close worktree',
				details: result.errors,
			};
		}

		return {
			success: true,
			message: `Worktree '${worktree.name}' closed (grove '${metadata.name}').`,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error occurred';
		return { success: false, message: `Failed to close worktree: ${message}` };
	}
}

import { getContainer } from '../di/index.js';
import {
	GitLabPluginToken,
	GitServiceToken,
	GroveServiceToken,
	GrovesServiceToken,
} from '../services/tokens.js';
import { confirmYesNo, isInteractive } from './confirm.js';
import { findGroveByIdOrName } from './worktreeLookup.js';
import { computeWorktreeSafety, describeWorktreeIssues } from './worktreeSafety.js';

export interface CloseGroveCommandResult {
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
 * Close a whole grove from the CLI, mirroring the interactive close screen's
 * safety checks. When a worktree has unsaved or unmerged work the command either
 * prompts for confirmation (interactive terminal) or refuses and points at
 * `--force` (non-interactive, e.g. a Claude session). `--force` skips all checks.
 *
 * @param groveArg - Grove id or (unique) name; see `grove list`.
 * @param force - Skip safety checks and close unconditionally.
 */
export async function closeGroveCommand(
	groveArg: string,
	force: boolean
): Promise<CloseGroveCommandResult> {
	try {
		const container = getContainer();
		const grovesService = container.resolve(GrovesServiceToken);
		const groveService = container.resolve(GroveServiceToken);
		const gitService = container.resolve(GitServiceToken);
		const gitlabPlugin = container.resolve(GitLabPluginToken);

		const resolved = findGroveByIdOrName(grovesService, groveArg);
		if ('error' in resolved) {
			return { success: false, message: resolved.error };
		}
		const { groveRef } = resolved;

		const metadata = grovesService.readGroveMetadata(groveRef.path);
		if (!metadata) {
			return { success: false, message: `Could not read grove metadata from ${groveRef.path}` };
		}

		const openWorktrees = metadata.worktrees.filter((w) => !w.closed);

		if (!force && openWorktrees.length > 0) {
			const flagged: string[] = [];
			for (const worktree of openWorktrees) {
				const safety = await computeWorktreeSafety({ gitService, gitlabPlugin }, worktree, {
					prune: true,
				});
				if (safety.hasIssues) {
					flagged.push(
						`  - ${worktree.name} (${worktree.branch}): ${describeWorktreeIssues(safety).join(', ')}`
					);
				}
			}

			if (flagged.length > 0) {
				if (!isInteractive()) {
					return {
						success: false,
						blocked: true,
						message: `Refusing to close grove '${groveRef.name}': worktrees have unmerged or unsaved work.`,
						details: [...flagged, 'Re-run with --force to close anyway.'],
					};
				}

				console.error(`Grove '${groveRef.name}' has worktrees with unsaved or unmerged work:`);
				flagged.forEach((line) => console.error(line));
				const confirmed = await confirmYesNo(
					`Close grove '${groveRef.name}' and delete these worktrees anyway?`
				);
				if (!confirmed) {
					return { success: false, blocked: true, message: 'Aborted. Grove was not closed.' };
				}
			}
		}

		const result = await groveService.closeGrove(groveRef.id);
		if (!result.success) {
			return {
				success: false,
				message: result.message ?? 'Failed to close grove',
				details: result.errors,
			};
		}

		return { success: true, message: `Grove '${groveRef.name}' closed.` };
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error occurred';
		return { success: false, message: `Failed to close grove: ${message}` };
	}
}

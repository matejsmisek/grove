import path from 'path';

import { getContainer } from '../di/index.js';
import {
	AsanaPluginToken,
	BackgroundSessionServiceToken,
	GroveServiceToken,
	GrovesServiceToken,
} from '../services/tokens.js';
import type { IGrovesService } from '../storage/GrovesService.js';
import type { GroveMetadata, Worktree } from '../storage/types.js';
import { parseAsanaTaskUrl } from '../utils/index.js';
import { findCurrentWorktree, findGroveForPath } from './claude.js';
import { findOpenWorktreeById } from './worktreeLookup.js';

/**
 * Result of grove claude-asana command
 */
export interface ClaudeAsanaResult {
	success: boolean;
	message: string;
}

/**
 * Launch a background Claude session seeded from an Asana task, without opening the
 * prompt editor — the headless equivalent of the UI's "Launch instant Claude from
 * Asana" action.
 *
 * The target worktree is resolved by its globally-unique `worktreeId` (see
 * `grove list`) when given; otherwise from the current directory (the worktree it sits
 * in, or the surrounding grove's single worktree). The Asana task is taken from
 * `asanaUrl` when given, otherwise from the worktree's stored Asana reference (e.g. one
 * attached via `add-worktree --asana`). The task's name and description seed the
 * configured Asana prompt template, which is dispatched straight to `claude --bg`; the
 * session id is persisted on the worktree so it can be attached later.
 *
 * @param worktreeId - Optional worktree id. When omitted, the worktree is detected from cwd.
 * @param asanaUrl - Optional Asana task URL. When omitted, the worktree's stored reference is used.
 * @returns Result indicating success or failure
 */
export async function openClaudeFromAsana(
	worktreeId?: string,
	asanaUrl?: string
): Promise<ClaudeAsanaResult> {
	try {
		const container = getContainer();
		const grovesService = container.resolve(GrovesServiceToken);
		const groveService = container.resolve(GroveServiceToken);
		const backgroundSessionService = container.resolve(BackgroundSessionServiceToken);
		const asanaPlugin = container.resolve(AsanaPluginToken);

		// Resolve the target worktree (and its grove) by id, or from the current directory.
		const target = worktreeId
			? findOpenWorktreeById(grovesService, worktreeId)
			: findWorktreeFromCwd(grovesService);
		if ('error' in target) {
			return { success: false, message: target.error };
		}
		const { metadata, worktree } = target;

		// Determine the Asana task gid: from the explicit URL, else the worktree's reference.
		let taskGid: string;
		if (asanaUrl) {
			const parsed = parseAsanaTaskUrl(asanaUrl);
			if (!parsed) {
				return { success: false, message: `'${asanaUrl}' is not a recognizable Asana task URL.` };
			}
			taskGid = parsed.gid;
		} else if (worktree.reference?.type === 'asana') {
			taskGid = worktree.reference.id;
		} else {
			return {
				success: false,
				message:
					'No Asana task linked to this worktree. Pass --asana <url>, or create the worktree with add-worktree --asana.',
			};
		}

		// Fetch the task and build the prompt from the configured template.
		const task = await asanaPlugin.getTask(taskGid);
		const promptBody = asanaPlugin.buildInstantClaudePrompt(task);

		const workingDir = worktree.projectPath
			? path.join(worktree.worktreePath, worktree.projectPath)
			: worktree.worktreePath;

		// Dispatch the background session without opening the prompt editor.
		const result = await backgroundSessionService.launchInstantSessionFromReference(
			workingDir,
			worktree.repositoryPath,
			promptBody,
			worktree.projectPath,
			metadata.name,
			worktree.name,
			true
		);

		if (!result.success) {
			return { success: false, message: result.message };
		}

		// Persist the session id so the worktree shows a tracked, attachable session.
		if (result.sessionId) {
			try {
				groveService.setWorktreeBackgroundSession(
					metadata.id,
					worktree.worktreePath,
					result.sessionId,
					result.sessionName
				);
			} catch {
				// Ignore persistence errors; the session was still dispatched.
			}
		}

		const displayName = worktree.projectPath
			? `${worktree.repositoryName}/${worktree.projectPath}`
			: worktree.repositoryName;

		return {
			success: true,
			message: `Started background Claude from Asana task "${task.name}" in ${displayName} (grove '${metadata.name}')`,
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
		return { success: false, message: `Failed to launch Claude from Asana: ${errorMessage}` };
	}
}

type WorktreeMatch = { metadata: GroveMetadata; worktree: Worktree };

/**
 * Find the target worktree from the current directory: the grove containing cwd, then
 * the worktree containing cwd, falling back to the grove's single worktree.
 */
function findWorktreeFromCwd(grovesService: IGrovesService): WorktreeMatch | { error: string } {
	const currentDir = path.resolve(process.cwd());
	const groveRef = findGroveForPath(currentDir, grovesService.getAllGroves());
	if (!groveRef) {
		return { error: 'Not in a grove folder. Navigate into a worktree or pass a worktree id.' };
	}

	const metadata = grovesService.readGroveMetadata(groveRef.path);
	if (!metadata) {
		return { error: `Could not read grove metadata from ${groveRef.path}` };
	}

	const openWorktrees = metadata.worktrees.filter((w) => !w.closed);
	if (openWorktrees.length === 0) {
		return { error: 'Grove has no worktrees' };
	}

	const currentWorktree = findCurrentWorktree(currentDir, metadata);
	if (currentWorktree && !currentWorktree.closed) {
		return { metadata, worktree: currentWorktree };
	}

	if (openWorktrees.length === 1) {
		return { metadata, worktree: openWorktrees[0] };
	}

	const available = openWorktrees.map((w) => `  - ${w.id} (${w.name})`).join('\n');
	return {
		error: `Grove has multiple worktrees. Pass a worktree id, or run from inside one:\n${available}`,
	};
}

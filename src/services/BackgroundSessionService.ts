import path from 'path';

import type { ClaudeTerminalType } from '../storage/types.js';
import { shortSessionId } from '../utils/claudeAgents.js';
import { commandExists } from '../utils/commandExists.js';
import { getDirenvWarning, wrapSpawnWithDirenv } from '../utils/direnv.js';
import { hasExternalEditor, openExternalEditor } from '../utils/externalEditor.js';
import {
	fillPromptTemplate,
	preparePromptTemplate,
	stripPlaceholder,
} from '../utils/promptTemplate.js';
import { spawnCollect } from '../utils/spawnCollect.js';
import type { ISessionLauncherService } from './SessionLauncherService.js';
import type { ISessionTemplateService } from './SessionTemplateService.js';
import type { ClaudeSessionResult } from './types.js';

/**
 * Background session service interface
 * Dispatches Claude background sessions via `claude --bg` (Instant Claude and the
 * "Open in Claude" standard launch), including direnv wrapping and the `$EDITOR`
 * prompt interaction. Interactive terminal launches live in SessionLauncherService.
 */
export interface IBackgroundSessionService {
	/**
	 * Launch an "Instant Claude" background session via `claude --bg`, prefilling
	 * the prompt from the configured template (edited in $EDITOR). The result
	 * includes the dispatched session's short ID for later attaching.
	 */
	launchInstantSession(
		workingDir: string,
		repositoryPath: string,
		projectPath?: string,
		groveName?: string,
		worktreeName?: string
	): Promise<ClaudeSessionResult>;
	/**
	 * Launch an "Instant Claude" background session like {@link launchInstantSession},
	 * but seed the prompt by replacing the template's `{prompt}` placeholder with
	 * `promptBody` (e.g. the contents of a linked Asana task) instead of removing it.
	 * When `skipEditor` is true the prompt is dispatched as-is, without opening
	 * `$EDITOR` first (used by the headless CLI launch).
	 */
	launchInstantSessionFromReference(
		workingDir: string,
		repositoryPath: string,
		promptBody: string,
		projectPath?: string,
		groveName?: string,
		worktreeName?: string,
		skipEditor?: boolean
	): Promise<ClaudeSessionResult>;
	/**
	 * Launch a standard Claude session as a background session (`claude --bg`, no
	 * prompt) and attach to it immediately, so every regular launch is a tracked,
	 * re-attachable agent. The result carries the session id for persistence.
	 */
	launchStandardSession(
		workingDir: string,
		repositoryPath: string,
		projectPath?: string,
		terminalType?: ClaudeTerminalType,
		groveName?: string,
		worktreeName?: string
	): Promise<ClaudeSessionResult>;
}

/**
 * Background Session Service
 * Dispatches Claude background sessions (`claude --bg`) for Instant Claude and the
 * standard "open + attach" launch. Defers interactive terminal launching to
 * SessionLauncherService and template resolution to SessionTemplateService.
 */
export class BackgroundSessionService implements IBackgroundSessionService {
	constructor(
		private readonly templateService: ISessionTemplateService,
		private readonly launcherService: ISessionLauncherService
	) {}

	/**
	 * Resolve the prompt text for an "Instant Claude" launch: resolve the configured
	 * template, open it in $EDITOR (caret at the `{prompt}` placeholder) for editing,
	 * and return the result. `placeholderReplacement` fills `{prompt}` (e.g. a linked
	 * Asana task) instead of removing it; remaining tokens are stripped before launch.
	 * Returns null when the user cancels the editor or leaves the prompt empty.
	 */
	private resolvePromptText(
		repositoryPath: string,
		projectPath?: string,
		placeholderReplacement?: string,
		skipEditor = false
	): string | null {
		const template = this.templateService.getPromptTemplateForRepo(repositoryPath, projectPath) ?? '';
		const prepared =
			placeholderReplacement === undefined
				? preparePromptTemplate(template)
				: fillPromptTemplate(template, placeholderReplacement);

		if (!skipEditor && hasExternalEditor()) {
			const edited = openExternalEditor(prepared.content, {
				extension: '.md',
				prefix: 'grove-prompt-',
				cursor: prepared.cursor,
			});
			// Editor cancelled/failed
			if (edited === null) {
				return null;
			}
			const text = stripPlaceholder(edited).trim();
			return text || null;
		}

		// No editor available: fall back to the template text directly
		const text = prepared.content.trim();
		return text || null;
	}

	/**
	 * Build a display name for a background session from grove/worktree names.
	 */
	private buildSessionName(
		repositoryPath: string,
		groveName?: string,
		worktreeName?: string
	): string {
		const parts: string[] = [];
		if (groveName) {
			parts.push(groveName);
		}
		const leaf = worktreeName || path.basename(repositoryPath);
		// Avoid duplicating the name (e.g. "name/name") when the grove and
		// worktree names are identical.
		if (leaf !== groveName) {
			parts.push(leaf);
		}
		return (parts.join('/') || 'grove-session').slice(0, 60);
	}

	/**
	 * Parse the short session ID printed by `claude --bg` from its output.
	 * Looks for the "backgrounded · <id> · <name>" line, falling back to the
	 * "claude attach <id>" hint line.
	 */
	private parseBackgroundSessionId(output: string): string | null {
		// Strip ANSI color codes (ESC[...m). Built dynamically to avoid a literal
		// control character in the source.
		const ansiPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
		const clean = output.replace(ansiPattern, '');

		// "backgrounded · <id> · <name>" — match the first token after the label,
		// tolerating whatever separator the CLI uses.
		const backgrounded = clean.match(/backgrounded[^A-Za-z0-9]+([A-Za-z0-9_-]+)/);
		if (backgrounded) {
			return backgrounded[1];
		}

		// Fallback: "claude attach <id>" hint line
		const attach = clean.match(/claude\s+attach\s+([A-Za-z0-9_-]+)/);
		if (attach) {
			return attach[1];
		}

		return null;
	}

	/** Launch an "Instant Claude" background session with the configured prompt template. */
	async launchInstantSession(
		workingDir: string,
		repositoryPath: string,
		projectPath?: string,
		groveName?: string,
		worktreeName?: string
	): Promise<ClaudeSessionResult> {
		return this.launchInstant(workingDir, repositoryPath, projectPath, groveName, worktreeName);
	}

	/** Like {@link launchInstantSession}, but seeds the prompt template with `promptBody`. */
	async launchInstantSessionFromReference(
		workingDir: string,
		repositoryPath: string,
		promptBody: string,
		projectPath?: string,
		groveName?: string,
		worktreeName?: string,
		skipEditor = false
	): Promise<ClaudeSessionResult> {
		return this.launchInstant(
			workingDir,
			repositoryPath,
			projectPath,
			groveName,
			worktreeName,
			promptBody,
			skipEditor
		);
	}

	/**
	 * Shared implementation for {@link launchInstantSession} and
	 * {@link launchInstantSessionFromReference}. When `promptBody` is provided the
	 * template's `{prompt}` placeholder is filled with it; otherwise it is removed.
	 * `--bg` dispatches the session and returns immediately, printing the session's
	 * short ID, which is parsed and returned so the caller can persist it.
	 */
	private async launchInstant(
		workingDir: string,
		repositoryPath: string,
		projectPath?: string,
		groveName?: string,
		worktreeName?: string,
		promptBody?: string,
		skipEditor = false
	): Promise<ClaudeSessionResult> {
		if (!(await commandExists('claude'))) {
			return {
				success: false,
				message: 'Claude CLI not found. Please install Claude CLI first.',
			};
		}

		const prompt = this.resolvePromptText(repositoryPath, projectPath, promptBody, skipEditor);
		if (!prompt) {
			return {
				success: false,
				message: 'No prompt provided for Instant Claude.',
			};
		}

		const name = this.buildSessionName(repositoryPath, groveName, worktreeName);
		const dispatched = await this.dispatchBackgroundSession(workingDir, name, prompt);
		if ('errorMessage' in dispatched) {
			return { success: false, message: dispatched.errorMessage };
		}

		return {
			success: true,
			message: this.appendWarning(
				`Started background Claude session (${dispatched.sessionId})`,
				dispatched.warning
			),
			sessionId: dispatched.sessionId,
			sessionName: name,
		};
	}

	/**
	 * Launch a "standard" Claude session as a background session (`claude --bg`,
	 * no prompt) and immediately attach to it in a terminal. This makes every
	 * regular launch a tracked, re-attachable agent. Returns the session id so the
	 * caller can persist it on the worktree. If the attach step fails, the session
	 * id is still returned (the background session was created and is tracked).
	 */
	async launchStandardSession(
		workingDir: string,
		repositoryPath: string,
		projectPath?: string,
		terminalType?: ClaudeTerminalType,
		groveName?: string,
		worktreeName?: string
	): Promise<ClaudeSessionResult> {
		if (!(await commandExists('claude'))) {
			return {
				success: false,
				message: 'Claude CLI not found. Please install Claude CLI first.',
			};
		}

		const name = this.buildSessionName(repositoryPath, groveName, worktreeName);
		const dispatched = await this.dispatchBackgroundSession(workingDir, name);
		if ('errorMessage' in dispatched) {
			return { success: false, message: dispatched.errorMessage };
		}

		const sessionId = dispatched.sessionId;
		const attach = await this.launcherService.attachSession(
			shortSessionId(sessionId),
			workingDir,
			repositoryPath,
			projectPath,
			terminalType,
			groveName,
			worktreeName
		);

		return {
			success: attach.success,
			// On success the attach result already carries any direnv warning (added
			// by the terminal launcher); only the failure branch needs it appended.
			message: attach.success
				? attach.message
				: this.appendWarning(
						`Started background session (${sessionId}) but failed to attach: ${attach.message}`,
						dispatched.warning
					),
			sessionId,
			sessionName: name,
		};
	}

	/**
	 * Dispatch a background Claude session via `claude --bg --name <name> [prompt]`.
	 * `--bg` returns immediately, printing the session's short ID, which is parsed
	 * and returned. Omitting the prompt launches a plain background session.
	 */
	private async dispatchBackgroundSession(
		workingDir: string,
		name: string,
		prompt?: string
	): Promise<{ sessionId: string; warning?: string } | { errorMessage: string }> {
		const claudeArgs = ['--bg', '--name', name];
		if (prompt) {
			claudeArgs.push(prompt);
		}

		// Wrap with `direnv exec` when the worktree uses direnv so the background
		// session inherits the same environment an interactive shell would load.
		const { command, args } = wrapSpawnWithDirenv(workingDir, 'claude', claudeArgs);

		const result = await spawnCollect(command, args, {
			cwd: workingDir,
			timeoutMs: 30000,
		});

		if (result.error) {
			return { errorMessage: `Failed to launch background session: ${result.error.message}` };
		}

		if (result.timedOut) {
			return { errorMessage: 'Timed out launching background session.' };
		}

		const output = `${result.stdout}\n${result.stderr}`;
		const sessionId = this.parseBackgroundSessionId(output);

		if (!sessionId) {
			return {
				errorMessage: `Started Claude but could not determine the session ID. Output: ${output.trim().slice(0, 200)}`,
			};
		}

		return { sessionId, warning: getDirenvWarning(workingDir) };
	}

	/** Append a direnv (or other) warning to a result message when present. */
	private appendWarning(message: string, warning?: string): string {
		return warning ? `${message}\n⚠ ${warning}` : message;
	}
}

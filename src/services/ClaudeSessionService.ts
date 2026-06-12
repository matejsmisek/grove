import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

import type { IGroveConfigService } from '../storage/GroveConfigService.js';
import type { ISessionsService } from '../storage/SessionsService.js';
import type { ISettingsService } from '../storage/SettingsService.js';
import type { ClaudeTerminalType } from '../storage/types.js';
import {
	type ClaudeAgentInfo,
	listClaudeAgentSessions,
	shortSessionId,
} from '../utils/claudeAgents.js';
import { commandExists } from '../utils/commandExists.js';
import { getDirenvWarning, prefixCommandWithDirenv, wrapSpawnWithDirenv } from '../utils/direnv.js';
import { hasExternalEditor, openExternalEditor } from '../utils/externalEditor.js';
import {
	fillPromptTemplate,
	preparePromptTemplate,
	stripPlaceholder,
} from '../utils/promptTemplate.js';
import type { ClaudeSessionResult } from './types.js';

/**
 * Claude session service interface
 * Launches Claude CLI in terminal sessions with multiple tabs
 */
export interface IClaudeSessionService {
	/** Detect all available supported terminals (konsole or kitty) */
	detectAvailableTerminals(): Promise<ClaudeTerminalType[]>;
	/** @deprecated Use detectAvailableTerminals() instead */
	detectTerminal(): Promise<ClaudeTerminalType | null>;
	/** Get the default template for a terminal type */
	getDefaultTemplate(terminalType: ClaudeTerminalType): string;
	/** Get the effective template for a terminal type */
	getEffectiveTemplate(terminalType: ClaudeTerminalType): string;
	/** Get the template for a specific repository/project */
	getTemplateForRepo(
		terminalType: ClaudeTerminalType,
		repositoryPath: string,
		projectPath?: string
	): string;
	/**
	 * Resolve the configured prompt template for a repository/project.
	 * Priority: project-level .grove.json > repo-level config > settings.
	 * Returns undefined when no (non-empty) template is configured.
	 */
	getPromptTemplateForRepo(repositoryPath: string, projectPath?: string): string | undefined;
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
	 * The filled prompt is opened in $EDITOR for review before dispatch.
	 */
	launchInstantSessionFromReference(
		workingDir: string,
		repositoryPath: string,
		promptBody: string,
		projectPath?: string,
		groveName?: string,
		worktreeName?: string
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
	/** Attach to a running background session via `claude attach <id>` in a terminal */
	attachSession(
		sessionId: string,
		workingDir: string,
		repositoryPath: string,
		projectPath?: string,
		terminalType?: ClaudeTerminalType,
		groveName?: string,
		worktreeName?: string
	): Promise<ClaudeSessionResult>;
	/** Whether a background session still exists (its `~/.claude/jobs/<id>` dir is present) */
	isBackgroundSessionAlive(sessionId: string): boolean;
	/** List all live Claude sessions (interactive + background) via `claude agents --json` */
	listAgentSessions(): Promise<ClaudeAgentInfo[]>;
	/**
	 * List the Claude sessions Grove should show: the live `claude agents --json`
	 * sessions, reconciled against the persisted registry (written by hooks) and
	 * with archived sessions excluded. Reconciling also archives registry entries
	 * that are no longer reported live.
	 */
	listTrackedSessions(): Promise<ClaudeAgentInfo[]>;
	/**
	 * Archive a session: remove it from Claude's agent list (`claude rm <id>`) and
	 * mark it archived in the registry so Grove stops showing it. The registry
	 * entry is kept (archived sessions are stored, just hidden).
	 */
	archiveSession(sessionId: string): Promise<void>;
	/** Apply template by replacing placeholders */
	applyTemplate(
		template: string,
		workingDir: string,
		agentCommand?: string,
		groveName?: string,
		worktreeName?: string
	): string;
	/** Open Claude in a terminal session */
	openSession(
		workingDir: string,
		repositoryPath: string,
		projectPath?: string,
		terminalType?: ClaudeTerminalType,
		groveName?: string,
		worktreeName?: string
	): Promise<ClaudeSessionResult>;
	/** Resume an existing Claude session */
	resumeSession(
		sessionId: string,
		workingDir: string,
		terminalType: ClaudeTerminalType,
		groveName?: string,
		worktreeName?: string
	): Promise<ClaudeSessionResult>;
	/** Continue the most recent Claude session in a directory */
	continueSession(
		workingDir: string,
		repositoryPath: string,
		projectPath?: string,
		terminalType?: ClaudeTerminalType,
		groveName?: string,
		worktreeName?: string
	): Promise<ClaudeSessionResult>;
}

/**
 * Claude Session Service
 * Launches Claude CLI in terminal sessions with multiple tabs (konsole or kitty)
 */
export class ClaudeSessionService implements IClaudeSessionService {
	constructor(
		private readonly settingsService: ISettingsService,
		private readonly groveConfigService: IGroveConfigService,
		private readonly sessionsService: ISessionsService
	) {}

	/**
	 * Check if a command exists in the system PATH (async, non-blocking).
	 * Delegates to the shared, cached {@link commandExists} helper.
	 */
	private commandExists(command: string): Promise<boolean> {
		return commandExists(command);
	}

	/**
	 * Detect all available supported terminals (konsole or kitty)
	 */
	async detectAvailableTerminals(): Promise<ClaudeTerminalType[]> {
		const terminals: ClaudeTerminalType[] = [];
		if (await this.commandExists('konsole')) {
			terminals.push('konsole');
		}
		if (await this.commandExists('kitty')) {
			terminals.push('kitty');
		}
		return terminals;
	}

	/**
	 * Detect which supported terminal is available (konsole or kitty)
	 * @deprecated Use detectAvailableTerminals() instead
	 */
	async detectTerminal(): Promise<ClaudeTerminalType | null> {
		const terminals = await this.detectAvailableTerminals();
		return terminals.length > 0 ? terminals[0] : null;
	}

	/**
	 * Get the default template for a terminal type
	 */
	getDefaultTemplate(terminalType: ClaudeTerminalType): string {
		if (terminalType === 'konsole') {
			return `title: Claude ;; workdir: \${WORKING_DIR} ;; command: \${AGENT_COMMAND}
title: cmd ;; workdir: \${WORKING_DIR} ;; command: bash
`;
		} else {
			// kitty
			return `layout tall
cd \${WORKING_DIR}
layout tall:bias=65;full_size=1
launch --title "claude" \${AGENT_COMMAND}
launch --title "cmd" bash
`;
		}
	}

	/**
	 * Get the effective template for a terminal type
	 * Checks settings for custom template, falls back to default
	 */
	getEffectiveTemplate(terminalType: ClaudeTerminalType): string {
		const settings = this.settingsService.readSettings();
		const templates = settings.claudeSessionTemplates;
		if (templates) {
			const template = templates[terminalType];
			if (template) {
				return template.content;
			}
		}
		return this.getDefaultTemplate(terminalType);
	}

	/**
	 * Get the template for a specific repository/project
	 * Checks .grove.json for custom template, then settings, then default
	 * Priority: project-level .grove.json > repo-level .grove.json > settings > default
	 */
	getTemplateForRepo(
		terminalType: ClaudeTerminalType,
		repositoryPath: string,
		projectPath?: string
	): string {
		// Config precedence (project-level .grove.json > repo-level config) is
		// owned by GroveConfigService; only the settings/default fallback is local.
		const configured = this.groveConfigService.getClaudeSessionTemplate(
			terminalType,
			repositoryPath,
			projectPath
		);
		if (configured !== undefined) {
			return configured;
		}

		// Fall back to settings or default
		return this.getEffectiveTemplate(terminalType);
	}

	/**
	 * Resolve the configured prompt template for a repository/project.
	 * Priority: project-level .grove.json > repo-level config (.grove.json /
	 * .grove.local.json) > settings (workspace-inherited from global).
	 * Returns undefined when no non-empty template is configured.
	 */
	getPromptTemplateForRepo(repositoryPath: string, projectPath?: string): string | undefined {
		// Config precedence (project-level .grove.json > repo-level config) is
		// owned by GroveConfigService; only the settings fallback is local.
		const configured = this.groveConfigService.getPromptTemplate(repositoryPath, projectPath);
		if (configured !== undefined) {
			return configured;
		}

		// Fall back to settings (workspace/global)
		const settings = this.settingsService.readSettings();
		if (typeof settings.promptTemplate === 'string' && settings.promptTemplate.trim()) {
			return settings.promptTemplate;
		}

		return undefined;
	}

	/**
	 * Resolve the prompt text for an "Instant Claude" launch.
	 *
	 * Resolves the configured prompt template, opens it in the user's $EDITOR (with
	 * the caret positioned at the `{prompt}` placeholder) so it can be edited, and
	 * returns the resulting text. When no template is configured the editor opens
	 * empty so the user can type a prompt.
	 *
	 * When `placeholderReplacement` is provided the `{prompt}` placeholder is filled
	 * with it (e.g. a linked Asana task's contents); otherwise the placeholder is
	 * removed. Any remaining placeholder tokens are stripped before launch.
	 *
	 * Returns null when the user cancels the editor or leaves the prompt empty.
	 */
	private resolvePromptText(
		repositoryPath: string,
		projectPath?: string,
		placeholderReplacement?: string
	): string | null {
		const template = this.getPromptTemplateForRepo(repositoryPath, projectPath) ?? '';
		const prepared =
			placeholderReplacement === undefined
				? preparePromptTemplate(template)
				: fillPromptTemplate(template, placeholderReplacement);

		if (hasExternalEditor()) {
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

	/**
	 * Directory under which background session state is stored
	 * (`$CLAUDE_CONFIG_DIR` or `~/.claude`).
	 */
	private claudeConfigDir(): string {
		return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
	}

	/**
	 * Whether a background session still exists. A background session's short ID
	 * is the name of its directory under `~/.claude/jobs/<id>`, so checking for
	 * that directory is a cheap existence test.
	 */
	isBackgroundSessionAlive(sessionId: string): boolean {
		if (!sessionId) {
			return false;
		}
		try {
			return fs.existsSync(path.join(this.claudeConfigDir(), 'jobs', sessionId));
		} catch {
			return false;
		}
	}

	/**
	 * List all live Claude sessions (interactive and background) by invoking
	 * `claude agents --json`. Delegates to the shared util; never throws.
	 */
	listAgentSessions(): Promise<ClaudeAgentInfo[]> {
		return listClaudeAgentSessions();
	}

	/**
	 * List the sessions Grove should display. Relies solely on the live
	 * `claude agents --json` data — the hook-written registry (`sessions.json`)
	 * is intentionally ignored, so what's shown always matches what Claude
	 * currently reports. Archived sessions are still hidden via `claude rm`,
	 * which drops them from the live list (see `archiveSession`).
	 */
	listTrackedSessions(): Promise<ClaudeAgentInfo[]> {
		return this.listAgentSessions();
	}

	/**
	 * Archive a session: best-effort `claude rm <id>` to drop it from the agent
	 * list, then flag it archived in the registry so it disappears from the UI
	 * immediately (the entry is kept, just hidden).
	 */
	async archiveSession(sessionId: string): Promise<void> {
		await this.claudeRemoveAgent(sessionId);
		try {
			const existing = this.sessionsService.getSession(sessionId);
			if (existing) {
				this.sessionsService.updateSession(sessionId, {
					archived: true,
					isRunning: false,
					status: 'closed',
				});
			} else {
				this.sessionsService.addSession({
					sessionId,
					agentType: 'claude',
					groveId: null,
					workspacePath: '',
					worktreePath: null,
					status: 'closed',
					isRunning: false,
					archived: true,
					lastUpdate: new Date().toISOString(),
				});
			}
		} catch {
			// Registry persistence is best-effort; the agent was still removed.
		}
	}

	/** Remove a session from Claude's agent list via `claude rm <id>` (best-effort). */
	private async claudeRemoveAgent(sessionId: string): Promise<void> {
		// Non-blocking; failures are ignored — the registry archive still hides the session.
		await this.spawnCollect('claude', ['rm', shortSessionId(sessionId)], { timeoutMs: 20000 });
	}

	/**
	 * Run a command via async `spawn`, collecting stdout/stderr, with a timeout.
	 * Never rejects: process errors and timeouts are reported on the resolved
	 * object so callers can branch without try/catch. On timeout the child is
	 * killed.
	 */
	private spawnCollect(
		command: string,
		args: string[],
		opts: { cwd?: string; timeoutMs: number }
	): Promise<{ stdout: string; stderr: string; error?: Error; timedOut: boolean }> {
		return new Promise((resolve) => {
			let stdout = '';
			let stderr = '';
			let timedOut = false;
			let settled = false;

			const proc = spawn(command, args, { cwd: opts.cwd });

			const finish = (extra: { error?: Error } = {}) => {
				if (settled) {
					return;
				}
				settled = true;
				clearTimeout(timer);
				resolve({ stdout, stderr, timedOut, ...extra });
			};

			const timer = setTimeout(() => {
				timedOut = true;
				proc.kill();
				finish();
			}, opts.timeoutMs);

			proc.stdout?.on('data', (chunk) => {
				stdout += chunk.toString();
			});
			proc.stderr?.on('data', (chunk) => {
				stderr += chunk.toString();
			});
			proc.on('error', (error) => finish({ error }));
			proc.on('close', () => finish());
		});
	}

	/**
	 * Launch an "Instant Claude" background session: resolve and edit the prompt
	 * template, then dispatch `claude --bg --name <name> "<prompt>"` in the
	 * working directory. `--bg` dispatches the session and returns immediately,
	 * printing the session's short ID, which is parsed and returned so the caller
	 * can persist it and later attach with `attachSession`.
	 */
	async launchInstantSession(
		workingDir: string,
		repositoryPath: string,
		projectPath?: string,
		groveName?: string,
		worktreeName?: string
	): Promise<ClaudeSessionResult> {
		if (!(await this.commandExists('claude'))) {
			return {
				success: false,
				message: 'Claude CLI not found. Please install Claude CLI first.',
			};
		}

		const prompt = this.resolvePromptText(repositoryPath, projectPath);
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
	 * Launch an "Instant Claude" background session seeded with `promptBody`: the
	 * configured prompt template's `{prompt}` placeholder is filled with the body
	 * (e.g. a linked Asana task's name + description), opened in $EDITOR for review,
	 * then dispatched via `claude --bg`. Mirrors {@link launchInstantSession}.
	 */
	async launchInstantSessionFromReference(
		workingDir: string,
		repositoryPath: string,
		promptBody: string,
		projectPath?: string,
		groveName?: string,
		worktreeName?: string
	): Promise<ClaudeSessionResult> {
		if (!(await this.commandExists('claude'))) {
			return {
				success: false,
				message: 'Claude CLI not found. Please install Claude CLI first.',
			};
		}

		const prompt = this.resolvePromptText(repositoryPath, projectPath, promptBody);
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
		if (!(await this.commandExists('claude'))) {
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
		const attach = await this.attachSession(
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

		const result = await this.spawnCollect(command, args, {
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

	/**
	 * Attach to a running background Claude session in a terminal, launching
	 * `claude attach <sessionId>` via the repository's session template.
	 */
	async attachSession(
		sessionId: string,
		workingDir: string,
		repositoryPath: string,
		projectPath?: string,
		terminalType?: ClaudeTerminalType,
		groveName?: string,
		worktreeName?: string
	): Promise<ClaudeSessionResult> {
		// Determine which terminal to use (same logic as openSession)
		let terminal: ClaudeTerminalType | undefined = terminalType;
		if (!terminal) {
			const settings = this.settingsService.readSettings();
			if (settings.selectedClaudeTerminal) {
				terminal = settings.selectedClaudeTerminal;
			} else {
				const detected = await this.detectTerminal();
				terminal = detected ?? undefined;
			}
		}

		if (!terminal) {
			return {
				success: false,
				message: 'No supported terminal found. This feature requires KDE Konsole or Kitty.',
			};
		}

		if (!(await this.commandExists(terminal))) {
			return {
				success: false,
				message: `Selected terminal '${terminal}' is not available on this system.`,
			};
		}

		if (!(await this.commandExists('claude'))) {
			return {
				success: false,
				message: 'Claude CLI not found. Please install Claude CLI first.',
			};
		}

		try {
			this.ensureTmpDir();

			const template = this.getTemplateForRepo(terminal, repositoryPath, projectPath);
			const sessionContent = this.applyTemplate(
				template,
				workingDir,
				prefixCommandWithDirenv(workingDir, `claude attach ${sessionId}`),
				groveName,
				worktreeName
			);

			const tmpSessionId = crypto.randomBytes(8).toString('hex');
			const tmpDir = this.getTmpDir();

			const direnvWarning = getDirenvWarning(workingDir);
			if (terminal === 'konsole') {
				return this.launchKonsole(sessionContent, tmpDir, tmpSessionId, direnvWarning);
			} else {
				return this.launchKitty(sessionContent, tmpDir, tmpSessionId, direnvWarning);
			}
		} catch (error) {
			return {
				success: false,
				message: `Failed to attach to Claude session: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	/** Append a direnv (or other) warning to a result message when present. */
	private appendWarning(message: string, warning?: string): string {
		return warning ? `${message}\n⚠ ${warning}` : message;
	}

	/**
	 * Shorten a name to max 15 characters
	 * Uses smart truncation: keeps the beginning, truncates the rest
	 */
	private shortenName(name: string): string {
		if (name.length <= 15) {
			return name;
		}
		return name.slice(0, 15);
	}

	/**
	 * Apply template by replacing placeholders:
	 * - ${WORKING_DIR}: Working directory path
	 * - ${AGENT_COMMAND}: Agent command (defaults to 'claude')
	 * - ${GROVE_NAME}: Full grove name
	 * - ${GROVE_NAME_SHORT}: Shortened grove name (max 15 chars)
	 * - ${WORKTREE_NAME}: Full worktree name
	 * - ${WORKTREE_NAME_SHORT}: Shortened worktree name (max 15 chars)
	 */
	applyTemplate(
		template: string,
		workingDir: string,
		agentCommand: string = 'claude',
		groveName?: string,
		worktreeName?: string
	): string {
		let result = template
			.replace(/\$\{WORKING_DIR\}/g, workingDir)
			.replace(/\$\{AGENT_COMMAND\}/g, agentCommand);

		if (groveName) {
			result = result
				.replace(/\$\{GROVE_NAME\}/g, groveName)
				.replace(/\$\{GROVE_NAME_SHORT\}/g, this.shortenName(groveName));
		}

		if (worktreeName) {
			result = result
				.replace(/\$\{WORKTREE_NAME\}/g, worktreeName)
				.replace(/\$\{WORKTREE_NAME_SHORT\}/g, this.shortenName(worktreeName));
		}

		return result;
	}

	/**
	 * Get the path to the tmp directory inside .grove folder
	 */
	private getTmpDir(): string {
		const config = this.settingsService.getStorageConfig();
		return path.join(config.groveFolder, 'tmp');
	}

	/**
	 * Ensure the tmp directory exists
	 */
	private ensureTmpDir(): void {
		const tmpDir = this.getTmpDir();
		if (!fs.existsSync(tmpDir)) {
			fs.mkdirSync(tmpDir, { recursive: true });
		}
	}

	/**
	 * Open Claude in a terminal session with the working directory set
	 */
	async openSession(
		workingDir: string,
		repositoryPath: string,
		projectPath?: string,
		terminalType?: ClaudeTerminalType,
		groveName?: string,
		worktreeName?: string
	): Promise<ClaudeSessionResult> {
		// Determine which terminal to use
		let terminal: ClaudeTerminalType | undefined = terminalType;
		if (!terminal) {
			// Check settings for selected terminal
			const settings = this.settingsService.readSettings();
			if (settings.selectedClaudeTerminal) {
				terminal = settings.selectedClaudeTerminal;
			} else {
				// Auto-detect
				const detected = await this.detectTerminal();
				terminal = detected ?? undefined;
			}
		}

		if (!terminal) {
			return {
				success: false,
				message: 'No supported terminal found. This feature requires KDE Konsole or Kitty.',
			};
		}

		// Verify the selected terminal is actually available
		if (!(await this.commandExists(terminal))) {
			return {
				success: false,
				message: `Selected terminal '${terminal}' is not available on this system.`,
			};
		}

		// Check if claude command is available
		if (!(await this.commandExists('claude'))) {
			return {
				success: false,
				message: 'Claude CLI not found. Please install Claude CLI first.',
			};
		}

		try {
			this.ensureTmpDir();

			// Get the appropriate template (always uses repo-specific lookup)
			const template = this.getTemplateForRepo(terminal, repositoryPath, projectPath);

			// Apply template with working directory, grove name, and worktree name.
			// "Open Claude" launches plain `claude` (no prefilled prompt); the prompt
			// template is used by "Instant Claude" instead (launchInstantSession).
			const sessionContent = this.applyTemplate(
				template,
				workingDir,
				prefixCommandWithDirenv(workingDir, 'claude'),
				groveName,
				worktreeName
			);

			// Generate unique filename for the session file
			const sessionId = crypto.randomBytes(8).toString('hex');
			const tmpDir = this.getTmpDir();

			const direnvWarning = getDirenvWarning(workingDir);
			if (terminal === 'konsole') {
				return this.launchKonsole(sessionContent, tmpDir, sessionId, direnvWarning);
			} else {
				return this.launchKitty(sessionContent, tmpDir, sessionId, direnvWarning);
			}
		} catch (error) {
			return {
				success: false,
				message: `Failed to open Claude session: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	/**
	 * Launch konsole with tabs file
	 */
	private launchKonsole(
		sessionContent: string,
		tmpDir: string,
		sessionId: string,
		warning?: string
	): ClaudeSessionResult {
		const tabsFile = path.join(tmpDir, `konsole-tabs-${sessionId}.txt`);

		// Write the tabs file
		fs.writeFileSync(tabsFile, sessionContent, 'utf-8');

		// Launch konsole with the tabs file
		const proc = spawn('konsole', ['--tabs-from-file', tabsFile, '-e', 'bash', '-c', 'exit'], {
			detached: true,
			stdio: 'ignore',
		});

		proc.on('error', (err) => {
			console.error(`[ClaudeSessionService] spawn error: ${err.message}`);
		});

		proc.unref();

		// Delete the temp file after a short delay to allow konsole to read it
		setTimeout(() => {
			try {
				if (fs.existsSync(tabsFile)) {
					fs.unlinkSync(tabsFile);
				}
			} catch {
				// Ignore deletion errors
			}
		}, 2000);

		return {
			success: true,
			message: this.appendWarning('Opened Claude session', warning),
		};
	}

	/**
	 * Launch kitty with session file
	 */
	private launchKitty(
		sessionContent: string,
		tmpDir: string,
		sessionId: string,
		warning?: string
	): ClaudeSessionResult {
		const sessionFile = path.join(tmpDir, `kitty-session-${sessionId}.conf`);

		// Write the session file
		fs.writeFileSync(sessionFile, sessionContent, 'utf-8');

		// Launch kitty with the session file
		const proc = spawn('kitty', ['--session', sessionFile], {
			detached: true,
			stdio: 'ignore',
		});

		proc.on('error', (err) => {
			console.error(`[ClaudeSessionService] spawn error: ${err.message}`);
		});

		proc.unref();

		// Delete the temp file after a short delay to allow kitty to read it
		setTimeout(() => {
			try {
				if (fs.existsSync(sessionFile)) {
					fs.unlinkSync(sessionFile);
				}
			} catch {
				// Ignore deletion errors
			}
		}, 2000);

		return {
			success: true,
			message: this.appendWarning('Opened Claude session', warning),
		};
	}

	/**
	 * Continue the most recent Claude session in a directory using `claude --continue`
	 */
	async continueSession(
		workingDir: string,
		repositoryPath: string,
		projectPath?: string,
		terminalType?: ClaudeTerminalType,
		groveName?: string,
		worktreeName?: string
	): Promise<ClaudeSessionResult> {
		// Determine which terminal to use (same logic as openSession)
		let terminal: ClaudeTerminalType | undefined = terminalType;
		if (!terminal) {
			const settings = this.settingsService.readSettings();
			if (settings.selectedClaudeTerminal) {
				terminal = settings.selectedClaudeTerminal;
			} else {
				const detected = await this.detectTerminal();
				terminal = detected ?? undefined;
			}
		}

		if (!terminal) {
			return {
				success: false,
				message: 'No supported terminal found. This feature requires KDE Konsole or Kitty.',
			};
		}

		if (!(await this.commandExists(terminal))) {
			return {
				success: false,
				message: `Selected terminal '${terminal}' is not available on this system.`,
			};
		}

		if (!(await this.commandExists('claude'))) {
			return {
				success: false,
				message: 'Claude CLI not found. Please install Claude CLI first.',
			};
		}

		try {
			this.ensureTmpDir();

			const template = this.getTemplateForRepo(terminal, repositoryPath, projectPath);
			const sessionContent = this.applyTemplate(
				template,
				workingDir,
				prefixCommandWithDirenv(workingDir, 'claude --continue'),
				groveName,
				worktreeName
			);

			const sessionId = crypto.randomBytes(8).toString('hex');
			const tmpDir = this.getTmpDir();

			const direnvWarning = getDirenvWarning(workingDir);
			if (terminal === 'konsole') {
				return this.launchKonsole(sessionContent, tmpDir, sessionId, direnvWarning);
			} else {
				return this.launchKitty(sessionContent, tmpDir, sessionId, direnvWarning);
			}
		} catch (error) {
			return {
				success: false,
				message: `Failed to continue Claude session: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	/**
	 * Resume an existing Claude session
	 */
	async resumeSession(
		sessionId: string,
		workingDir: string,
		terminalType: ClaudeTerminalType,
		groveName?: string,
		worktreeName?: string
	): Promise<ClaudeSessionResult> {
		// Verify the selected terminal is actually available
		if (!(await this.commandExists(terminalType))) {
			return {
				success: false,
				message: `Selected terminal '${terminalType}' is not available on this system.`,
			};
		}

		// Check if claude command is available
		if (!(await this.commandExists('claude'))) {
			return {
				success: false,
				message: 'Claude CLI not found. Please install Claude CLI first.',
			};
		}

		try {
			this.ensureTmpDir();

			// Get the appropriate template (use global template since we don't have repo info here)
			const template = this.getEffectiveTemplate(terminalType);

			// Build the agent command with --resume flag
			const agentCommand = prefixCommandWithDirenv(workingDir, `claude --resume ${sessionId}`);

			// Apply template with working directory, resume command, grove name, and worktree name
			const sessionContent = this.applyTemplate(
				template,
				workingDir,
				agentCommand,
				groveName,
				worktreeName
			);

			// Generate unique filename for the session file
			const tmpSessionId = crypto.randomBytes(8).toString('hex');
			const tmpDir = this.getTmpDir();

			const direnvWarning = getDirenvWarning(workingDir);
			if (terminalType === 'konsole') {
				return this.launchKonsole(sessionContent, tmpDir, tmpSessionId, direnvWarning);
			} else {
				return this.launchKitty(sessionContent, tmpDir, tmpSessionId, direnvWarning);
			}
		} catch (error) {
			return {
				success: false,
				message: `Failed to resume Claude session: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}
}

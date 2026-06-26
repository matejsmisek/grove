import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import type { ISettingsService } from '../storage/SettingsService.js';
import type { ClaudeTerminalType } from '../storage/types.js';
import { detectAvailableTerminalIds, getAdapter, isAdapterAvailable } from '../terminals/index.js';
import type { ClaudeLaunchContext } from '../terminals/index.js';
import { commandExists } from '../utils/commandExists.js';
import { getDirenvWarning, prefixCommandWithDirenv } from '../utils/direnv.js';
import { buildSessionName, shellQuoteArg } from '../utils/sessionName.js';
import type { ISessionTemplateService } from './SessionTemplateService.js';
import type { ClaudeSessionResult } from './types.js';

/**
 * Session launcher service interface
 * Launches Claude CLI in interactive terminal sessions (konsole/kitty), wrapping
 * the launched command with direnv. Background (`claude --bg`) dispatch lives in
 * BackgroundSessionService; template resolution in SessionTemplateService.
 */
export interface ISessionLauncherService {
	/** Detect all available supported terminals (konsole or kitty) */
	detectAvailableTerminals(): Promise<ClaudeTerminalType[]>;
	/** @deprecated Use detectAvailableTerminals() instead */
	detectTerminal(): Promise<ClaudeTerminalType | null>;
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
 * Session Launcher Service
 * Launches Claude CLI in interactive terminal sessions with multiple tabs
 * (konsole or kitty).
 */
export class SessionLauncherService implements ISessionLauncherService {
	constructor(
		private readonly templateService: ISessionTemplateService,
		private readonly settingsService: ISettingsService
	) {}

	/**
	 * Detect all available supported terminals (konsole or kitty)
	 */
	async detectAvailableTerminals(): Promise<ClaudeTerminalType[]> {
		return detectAvailableTerminalIds();
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
	 * Open Claude in a terminal session with the working directory set.
	 * "Open Claude" launches `claude --name <grove/worktree>` (no prefilled
	 * prompt) so the session is a tracked, named agent; the prompt template is
	 * used by Instant Claude instead (BackgroundSessionService).
	 */
	async openSession(
		workingDir: string,
		repositoryPath: string,
		projectPath?: string,
		terminalType?: ClaudeTerminalType,
		groveName?: string,
		worktreeName?: string
	): Promise<ClaudeSessionResult> {
		return this.launchRepoSession(
			'open',
			workingDir,
			repositoryPath,
			projectPath,
			terminalType,
			groveName,
			worktreeName
		);
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
		return this.launchRepoSession(
			'attach',
			workingDir,
			repositoryPath,
			projectPath,
			terminalType,
			groveName,
			worktreeName,
			sessionId
		);
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
		return this.launchRepoSession(
			'continue',
			workingDir,
			repositoryPath,
			projectPath,
			terminalType,
			groveName,
			worktreeName
		);
	}

	/**
	 * Resume an existing Claude session in the given terminal. Unlike the repo-based
	 * launches this uses the effective (global) template, since no repo context is
	 * available, and the terminal is always explicit.
	 */
	async resumeSession(
		sessionId: string,
		workingDir: string,
		terminalType: ClaudeTerminalType,
		groveName?: string,
		worktreeName?: string
	): Promise<ClaudeSessionResult> {
		const unavailable = await this.checkTerminalAvailable(terminalType);
		if (unavailable) {
			return unavailable;
		}

		try {
			// Use the effective (global) template since we don't have repo info here.
			const agentCommand = prefixCommandWithDirenv(workingDir, `claude --resume ${sessionId}`);
			const template = this.templateService.getEffectiveTemplate(terminalType);
			const renderedTemplate = this.templateService.applyTemplate(
				template,
				workingDir,
				agentCommand,
				groveName,
				worktreeName
			);
			return this.launchTerminalSession(terminalType, agentCommand, renderedTemplate, workingDir);
		} catch (error) {
			return {
				success: false,
				message: `Failed to resume Claude session: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	/**
	 * Shared implementation for the repo-context launches (open / attach / continue).
	 * Each resolves the terminal, looks up the repo-specific template, substitutes the
	 * appropriate agent command, and writes/launches the terminal session.
	 */
	private async launchRepoSession(
		mode: 'open' | 'attach' | 'continue',
		workingDir: string,
		repositoryPath: string,
		projectPath?: string,
		terminalType?: ClaudeTerminalType,
		groveName?: string,
		worktreeName?: string,
		sessionId?: string
	): Promise<ClaudeSessionResult> {
		const terminal = await this.resolveSelectedTerminal(terminalType);
		const unavailable = await this.checkTerminalAvailable(terminal);
		if (unavailable) {
			return unavailable;
		}

		// Standard "open" launches start a named interactive session (`claude --name
		// <grove/worktree>`) so it shows up as a tracked agent — no `--bg`/attach dance.
		const openCommand = `claude --name ${shellQuoteArg(buildSessionName(repositoryPath, groveName, worktreeName))}`;
		const claudeCommand =
			mode === 'attach'
				? `claude attach ${sessionId}`
				: mode === 'continue'
					? 'claude --continue'
					: openCommand;
		const failureLabel = mode === 'attach' ? 'attach to' : mode === 'continue' ? 'continue' : 'open';

		try {
			const agentCommand = prefixCommandWithDirenv(workingDir, claudeCommand);
			const template = this.templateService.getTemplateForRepo(terminal!, repositoryPath, projectPath);
			const renderedTemplate = this.templateService.applyTemplate(
				template,
				workingDir,
				agentCommand,
				groveName,
				worktreeName
			);
			return this.launchTerminalSession(terminal!, agentCommand, renderedTemplate, workingDir);
		} catch (error) {
			return {
				success: false,
				message: `Failed to ${failureLabel} Claude session: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	/**
	 * Resolve which terminal to use: the explicit type, the user's selected terminal
	 * from settings, or the first auto-detected one.
	 */
	private async resolveSelectedTerminal(
		terminalType?: ClaudeTerminalType
	): Promise<ClaudeTerminalType | undefined> {
		if (terminalType) {
			return terminalType;
		}
		const settings = this.settingsService.readSettings();
		if (settings.selectedTerminal) {
			return settings.selectedTerminal;
		}
		return (await this.detectTerminal()) ?? undefined;
	}

	/**
	 * Validate that a terminal is available and that the Claude CLI exists.
	 * Returns an error result when unusable, or null when everything is ready.
	 */
	private async checkTerminalAvailable(
		terminal: ClaudeTerminalType | undefined
	): Promise<ClaudeSessionResult | null> {
		if (!terminal) {
			return {
				success: false,
				message: 'No supported terminal found. Configure one in Settings → Terminal.',
			};
		}
		const adapter = getAdapter(terminal);
		if (!adapter || !(await isAdapterAvailable(adapter))) {
			return {
				success: false,
				message: `Selected terminal '${terminal}' is not available on this system.`,
			};
		}
		if (!(await commandExists('claude'))) {
			return {
				success: false,
				message: 'Claude CLI not found. Please install Claude CLI first.',
			};
		}
		return null;
	}

	/** Append a direnv (or other) warning to a result message when present. */
	private appendWarning(message: string, warning?: string): string {
		return warning ? `${message}\n⚠ ${warning}` : message;
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
	 * Launch a Claude session in the given terminal by delegating to its adapter.
	 * Editable-template terminals (konsole/kitty) receive the rendered template and
	 * write a temp session file (removed shortly after); other terminals compose
	 * the launch from the resolved tabs. `agentCommand` is the direnv-wrapped
	 * Claude command for the first tab.
	 */
	private launchTerminalSession(
		terminal: ClaudeTerminalType,
		agentCommand: string,
		renderedTemplate: string,
		workingDir: string
	): ClaudeSessionResult {
		const adapter = getAdapter(terminal);
		if (!adapter) {
			return {
				success: false,
				message: `Unknown terminal '${terminal}'.`,
			};
		}

		this.ensureTmpDir();

		const tmpDir = this.getTmpDir();
		const sessionToken = crypto.randomBytes(8).toString('hex');
		const warning = getDirenvWarning(workingDir);

		const ctx: ClaudeLaunchContext = {
			workingDir,
			tabs: [
				{ title: 'claude', command: agentCommand },
				{ title: 'cmd', command: 'bash' },
			],
			renderedTemplate: adapter.editableTemplate ? renderedTemplate : undefined,
			tmpDir,
			sessionToken,
			custom: this.settingsService.readSettings().terminalConfigs?.[terminal],
		};

		const spec = adapter.launchClaude(ctx);

		// Write the temp session file (file-based terminals) before launching.
		if (spec.sessionFile) {
			fs.writeFileSync(spec.sessionFile.path, spec.sessionFile.content, 'utf-8');
		}

		const proc = spawn(spec.command, spec.args, {
			detached: true,
			stdio: 'ignore',
			shell: spec.shell,
		});

		proc.on('error', (err) => {
			console.error(`[SessionLauncherService] spawn error: ${err.message}`);
		});

		proc.unref();

		// Delete the temp file after a short delay to allow the terminal to read it.
		if (spec.sessionFile) {
			const filePath = spec.sessionFile.path;
			setTimeout(() => {
				try {
					if (fs.existsSync(filePath)) {
						fs.unlinkSync(filePath);
					}
				} catch {
					// Ignore deletion errors
				}
			}, 2000);
		}

		return {
			success: true,
			message: this.appendWarning('Opened Claude session', warning),
		};
	}
}

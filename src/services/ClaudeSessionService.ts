import { execSync, spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import type { IGroveConfigService } from '../storage/GroveConfigService.js';
import type { ISettingsService } from '../storage/SettingsService.js';
import type { ClaudeTerminalType } from '../storage/types.js';
import type { ClaudeSessionResult } from './types.js';

/**
 * Claude session service interface
 * Launches Claude CLI in terminal sessions with multiple tabs
 */
export interface IClaudeSessionService {
	/** Detect all available supported terminals (konsole or kitty) */
	detectAvailableTerminals(): ClaudeTerminalType[];
	/** @deprecated Use detectAvailableTerminals() instead */
	detectTerminal(): ClaudeTerminalType | null;
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
	): ClaudeSessionResult;
	/** Resume an existing Claude session */
	resumeSession(
		sessionId: string,
		workingDir: string,
		terminalType: ClaudeTerminalType,
		groveName?: string,
		worktreeName?: string
	): ClaudeSessionResult;
	/** Continue the most recent Claude session in a directory */
	continueSession(
		workingDir: string,
		repositoryPath: string,
		projectPath?: string,
		terminalType?: ClaudeTerminalType,
		groveName?: string,
		worktreeName?: string
	): ClaudeSessionResult;
}

/**
 * Claude Session Service
 * Launches Claude CLI in terminal sessions with multiple tabs (konsole or kitty)
 */
export class ClaudeSessionService implements IClaudeSessionService {
	constructor(
		private readonly settingsService: ISettingsService,
		private readonly groveConfigService: IGroveConfigService
	) {}

	/**
	 * Check if a command exists in the system PATH
	 */
	private commandExists(command: string): boolean {
		try {
			execSync(`which ${command}`, { stdio: 'ignore' });
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Detect all available supported terminals (konsole or kitty)
	 */
	detectAvailableTerminals(): ClaudeTerminalType[] {
		const terminals: ClaudeTerminalType[] = [];
		if (this.commandExists('konsole')) {
			terminals.push('konsole');
		}
		if (this.commandExists('kitty')) {
			terminals.push('kitty');
		}
		return terminals;
	}

	/**
	 * Detect which supported terminal is available (konsole or kitty)
	 * @deprecated Use detectAvailableTerminals() instead
	 */
	detectTerminal(): ClaudeTerminalType | null {
		const terminals = this.detectAvailableTerminals();
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
		// If monorepo, check project-level config first (highest priority)
		if (projectPath) {
			const projectConfigPath = path.join(repositoryPath, projectPath, '.grove.json');
			if (fs.existsSync(projectConfigPath)) {
				try {
					const projectConfigContent = fs.readFileSync(projectConfigPath, 'utf-8');
					const projectConfig = JSON.parse(projectConfigContent);
					if (
						projectConfig.claudeSessionTemplates &&
						projectConfig.claudeSessionTemplates[terminalType]
					) {
						return projectConfig.claudeSessionTemplates[terminalType].content;
					}
				} catch {
					// Ignore JSON parse errors
				}
			}
		}

		// Check repository-level config
		const repoConfig = this.groveConfigService.readGroveRepoConfig(repositoryPath);
		const repoTemplates = repoConfig.claudeSessionTemplates;
		if (repoTemplates) {
			const repoTemplate = repoTemplates[terminalType];
			if (repoTemplate) {
				return repoTemplate.content;
			}
		}

		// Fall back to settings or default
		return this.getEffectiveTemplate(terminalType);
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
	openSession(
		workingDir: string,
		repositoryPath: string,
		projectPath?: string,
		terminalType?: ClaudeTerminalType,
		groveName?: string,
		worktreeName?: string
	): ClaudeSessionResult {
		// Determine which terminal to use
		let terminal: ClaudeTerminalType | undefined = terminalType;
		if (!terminal) {
			// Check settings for selected terminal
			const settings = this.settingsService.readSettings();
			if (settings.selectedClaudeTerminal) {
				terminal = settings.selectedClaudeTerminal;
			} else {
				// Auto-detect
				const detected = this.detectTerminal();
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
		if (!this.commandExists(terminal)) {
			return {
				success: false,
				message: `Selected terminal '${terminal}' is not available on this system.`,
			};
		}

		// Check if claude command is available
		if (!this.commandExists('claude')) {
			return {
				success: false,
				message: 'Claude CLI not found. Please install Claude CLI first.',
			};
		}

		try {
			this.ensureTmpDir();

			// Get the appropriate template (always uses repo-specific lookup)
			const template = this.getTemplateForRepo(terminal, repositoryPath, projectPath);

			// Apply template with working directory, grove name, and worktree name
			const sessionContent = this.applyTemplate(
				template,
				workingDir,
				'claude',
				groveName,
				worktreeName
			);

			// Generate unique filename for the session file
			const sessionId = crypto.randomBytes(8).toString('hex');
			const tmpDir = this.getTmpDir();

			if (terminal === 'konsole') {
				return this.launchKonsole(sessionContent, tmpDir, sessionId);
			} else {
				return this.launchKitty(sessionContent, tmpDir, sessionId);
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
		sessionId: string
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
			message: 'Opened Claude session',
		};
	}

	/**
	 * Launch kitty with session file
	 */
	private launchKitty(
		sessionContent: string,
		tmpDir: string,
		sessionId: string
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
			message: 'Opened Claude session',
		};
	}

	/**
	 * Continue the most recent Claude session in a directory using `claude --continue`
	 */
	continueSession(
		workingDir: string,
		repositoryPath: string,
		projectPath?: string,
		terminalType?: ClaudeTerminalType,
		groveName?: string,
		worktreeName?: string
	): ClaudeSessionResult {
		// Determine which terminal to use (same logic as openSession)
		let terminal: ClaudeTerminalType | undefined = terminalType;
		if (!terminal) {
			const settings = this.settingsService.readSettings();
			if (settings.selectedClaudeTerminal) {
				terminal = settings.selectedClaudeTerminal;
			} else {
				const detected = this.detectTerminal();
				terminal = detected ?? undefined;
			}
		}

		if (!terminal) {
			return {
				success: false,
				message: 'No supported terminal found. This feature requires KDE Konsole or Kitty.',
			};
		}

		if (!this.commandExists(terminal)) {
			return {
				success: false,
				message: `Selected terminal '${terminal}' is not available on this system.`,
			};
		}

		if (!this.commandExists('claude')) {
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
				'claude --continue',
				groveName,
				worktreeName
			);

			const sessionId = crypto.randomBytes(8).toString('hex');
			const tmpDir = this.getTmpDir();

			if (terminal === 'konsole') {
				return this.launchKonsole(sessionContent, tmpDir, sessionId);
			} else {
				return this.launchKitty(sessionContent, tmpDir, sessionId);
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
	resumeSession(
		sessionId: string,
		workingDir: string,
		terminalType: ClaudeTerminalType,
		groveName?: string,
		worktreeName?: string
	): ClaudeSessionResult {
		// Verify the selected terminal is actually available
		if (!this.commandExists(terminalType)) {
			return {
				success: false,
				message: `Selected terminal '${terminalType}' is not available on this system.`,
			};
		}

		// Check if claude command is available
		if (!this.commandExists('claude')) {
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
			const agentCommand = `claude --resume ${sessionId}`;

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

			if (terminalType === 'konsole') {
				return this.launchKonsole(sessionContent, tmpDir, tmpSessionId);
			} else {
				return this.launchKitty(sessionContent, tmpDir, tmpSessionId);
			}
		} catch (error) {
			return {
				success: false,
				message: `Failed to resume Claude session: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}
}

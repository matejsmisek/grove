import type { IGroveConfigService } from '../storage/GroveConfigService.js';
import type { ISettingsService } from '../storage/SettingsService.js';
import type { ClaudeTerminalType } from '../storage/types.js';

/**
 * Session template service interface
 * Resolves Claude terminal session templates and the Instant Claude prompt
 * template, and performs template variable substitution.
 */
export interface ISessionTemplateService {
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
	/** Apply template by replacing placeholders */
	applyTemplate(
		template: string,
		workingDir: string,
		agentCommand?: string,
		groveName?: string,
		worktreeName?: string
	): string;
}

/**
 * Session Template Service
 * Resolves the konsole/kitty session templates and the Instant Claude prompt
 * template for a repository/project, and substitutes template variables.
 */
export class SessionTemplateService implements ISessionTemplateService {
	constructor(
		private readonly settingsService: ISettingsService,
		private readonly groveConfigService: IGroveConfigService
	) {}

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
}

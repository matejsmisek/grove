import fs from 'fs';
import path from 'path';
import os from 'os';

import { AgentType } from '../storage/types.js';

export interface SetupHooksResult {
	success: boolean;
	message: string;
	details?: string[];
}

interface ClaudeSettings {
	hooks?: {
		SessionStart?: HookConfig[];
		SessionEnd?: HookConfig[];
		Stop?: HookConfig[];
		Notification?: HookConfig[];
		[key: string]: HookConfig[] | undefined;
	};
	[key: string]: unknown;
}

interface HookConfig {
	matcher: string;
	hooks: Array<{
		type: string;
		command?: string;
		[key: string]: unknown;
	}>;
}

/**
 * Get the grove binary path
 */
function getGroveBinary(): string {
	// In production, use the installed path
	// In development, use the current process
	const isDevMode = process.argv[1]?.includes('tsx') || process.argv[1]?.includes('node');

	if (isDevMode) {
		// Development: use node with source file
		const sourceFile = path.resolve(__dirname, '../index.js');
		return `node ${sourceFile}`;
	}

	// Production: use installed binary
	return 'grove';
}

/**
 * Setup hooks for Claude Code
 */
async function setupClaudeHooks(): Promise<SetupHooksResult> {
	const claudeConfigPath = path.join(os.homedir(), '.claude', 'settings.json');
	const groveBin = getGroveBinary();

	// Check if Claude config exists
	if (!fs.existsSync(claudeConfigPath)) {
		return {
			success: false,
			message: 'Claude Code settings not found',
			details: [
				`Expected location: ${claudeConfigPath}`,
				'Make sure Claude Code is installed and has been run at least once.',
			],
		};
	}

	// Read existing config
	let config: ClaudeSettings;
	try {
		const content = fs.readFileSync(claudeConfigPath, 'utf8');
		config = JSON.parse(content) as ClaudeSettings;
	} catch (error) {
		return {
			success: false,
			message: 'Failed to read Claude Code settings',
			details: [error instanceof Error ? error.message : 'Unknown error'],
		};
	}

	// Ensure hooks object exists
	if (!config.hooks) {
		config.hooks = {};
	}

	// Define the hooks we want to add
	const hooksToAdd = {
		SessionStart: {
			matcher: '*',
			hooks: [
				{
					type: 'command',
					command: `${groveBin} session-start --agent-type claude --session-id "$CLAUDE_SESSION_ID" --cwd "$PWD"`,
				},
			],
		},
		Stop: {
			matcher: '*',
			hooks: [
				{
					type: 'command',
					command: `${groveBin} session-idle --session-id "$CLAUDE_SESSION_ID"`,
				},
			],
		},
		Notification: {
			matcher: '*',
			hooks: [
				{
					type: 'command',
					command: `${groveBin} session-attention --session-id "$CLAUDE_SESSION_ID"`,
				},
			],
		},
		SessionEnd: {
			matcher: '*',
			hooks: [
				{
					type: 'command',
					command: `${groveBin} session-end --session-id "$CLAUDE_SESSION_ID"`,
				},
			],
		},
	};

	const addedHooks: string[] = [];
	const skippedHooks: string[] = [];

	// Add hooks if they don't already exist
	for (const [hookName, hookConfig] of Object.entries(hooksToAdd)) {
		// Initialize hook array if it doesn't exist
		if (!config.hooks[hookName]) {
			config.hooks[hookName] = [];
		}

		const existingHooks = config.hooks[hookName]!;

		// Check if grove hook already exists
		const alreadyExists = existingHooks.some((existing) =>
			existing.hooks.some((h) => h.type === 'command' && h.command?.includes('grove session-')),
		);

		if (alreadyExists) {
			skippedHooks.push(hookName);
			continue;
		}

		// Add the hook
		existingHooks.push(hookConfig);
		addedHooks.push(hookName);
	}

	// Write updated config back
	try {
		// Create backup first
		const backupPath = `${claudeConfigPath}.backup`;
		fs.copyFileSync(claudeConfigPath, backupPath);

		// Write updated config
		fs.writeFileSync(claudeConfigPath, JSON.stringify(config, null, 2), 'utf8');

		const details: string[] = [];
		if (addedHooks.length > 0) {
			details.push(`Added hooks: ${addedHooks.join(', ')}`);
		}
		if (skippedHooks.length > 0) {
			details.push(`Already configured: ${skippedHooks.join(', ')}`);
		}
		details.push(`Backup saved to: ${backupPath}`);

		return {
			success: true,
			message: 'Claude Code hooks configured successfully!',
			details,
		};
	} catch (error) {
		return {
			success: false,
			message: 'Failed to write Claude Code settings',
			details: [error instanceof Error ? error.message : 'Unknown error'],
		};
	}
}

/**
 * Setup hooks for Gemini Code (placeholder)
 */
async function setupGeminiHooks(): Promise<SetupHooksResult> {
	return {
		success: false,
		message: 'Gemini Code hooks not yet implemented',
		details: ['Gemini Code integration is planned for a future release.'],
	};
}

/**
 * Setup hooks for Codex (placeholder)
 */
async function setupCodexHooks(): Promise<SetupHooksResult> {
	return {
		success: false,
		message: 'Codex hooks not yet implemented',
		details: ['Codex integration is planned for a future release.'],
	};
}

/**
 * Main entry point for setting up agent hooks
 */
export async function setupAgentHooks(agentType: AgentType): Promise<SetupHooksResult> {
	switch (agentType) {
		case 'claude':
			return setupClaudeHooks();
		case 'gemini':
			return setupGeminiHooks();
		case 'codex':
			return setupCodexHooks();
		default:
			return {
				success: false,
				message: `Unknown agent type: ${agentType}`,
				details: ['Supported agents: claude, gemini, codex'],
			};
	}
}

/**
 * Verify if hooks are already configured for an agent
 */
export async function verifyAgentHooks(agentType: AgentType): Promise<{
	configured: boolean;
	hooks: string[];
	missing: string[];
}> {
	if (agentType !== 'claude') {
		return { configured: false, hooks: [], missing: [] };
	}

	const claudeConfigPath = path.join(os.homedir(), '.claude', 'settings.json');

	if (!fs.existsSync(claudeConfigPath)) {
		return {
			configured: false,
			hooks: [],
			missing: ['SessionStart', 'Stop', 'Notification', 'SessionEnd'],
		};
	}

	try {
		const content = fs.readFileSync(claudeConfigPath, 'utf8');
		const config = JSON.parse(content) as ClaudeSettings;

		const requiredHooks = ['SessionStart', 'Stop', 'Notification', 'SessionEnd'];
		const configuredHooks: string[] = [];
		const missingHooks: string[] = [];

		for (const hookName of requiredHooks) {
			const hookExists = config.hooks?.[hookName]?.some((existing) =>
				existing.hooks.some((h) => h.type === 'command' && h.command?.includes('grove session-')),
			);

			if (hookExists) {
				configuredHooks.push(hookName);
			} else {
				missingHooks.push(hookName);
			}
		}

		return {
			configured: missingHooks.length === 0,
			hooks: configuredHooks,
			missing: missingHooks,
		};
	} catch {
		return { configured: false, hooks: [], missing: [] };
	}
}

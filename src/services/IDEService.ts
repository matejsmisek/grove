import { execSync, spawn } from 'child_process';
import os from 'os';

import type { IDEConfig, IDEType } from '../storage/types.js';

export interface IDEResult {
	success: boolean;
	message: string;
}

/**
 * IDE definitions with default commands and arguments
 * {path} will be replaced with the actual directory path
 */
interface IDEDefinition {
	name: string;
	command: string;
	args: string[];
	/** Alternative commands to try if primary not found */
	alternativeCommands?: string[];
}

/**
 * Default IDE configurations for each supported IDE type
 */
const IDE_DEFINITIONS: Record<IDEType, IDEDefinition> = {
	vscode: {
		name: 'Visual Studio Code',
		command: 'code',
		args: ['{path}'],
		alternativeCommands: ['code-insiders'],
	},
	phpstorm: {
		name: 'PhpStorm',
		command: 'phpstorm',
		args: ['{path}'],
		alternativeCommands: ['pstorm'],
	},
	webstorm: {
		name: 'WebStorm',
		command: 'webstorm',
		args: ['{path}'],
		alternativeCommands: ['wstorm'],
	},
	idea: {
		name: 'IntelliJ IDEA',
		command: 'idea',
		args: ['{path}'],
	},
	vim: {
		name: 'Vim',
		command: 'vim',
		args: ['{path}'],
		alternativeCommands: ['nvim', 'gvim'],
	},
};

/**
 * All supported IDE types
 */
export const ALL_IDE_TYPES: IDEType[] = ['vscode', 'phpstorm', 'webstorm', 'idea', 'vim'];

/**
 * Get the display name for an IDE type
 */
export function getIDEDisplayName(ideType: IDEType): string {
	return IDE_DEFINITIONS[ideType].name;
}

/**
 * Check if a command exists in the system PATH
 */
export function isCommandAvailable(command: string): boolean {
	try {
		const checkCmd = os.platform() === 'win32' ? `where ${command}` : `which ${command}`;
		execSync(checkCmd, { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

/**
 * Get the default IDE configuration for a given IDE type
 */
export function getDefaultIDEConfig(ideType: IDEType): IDEConfig {
	const definition = IDE_DEFINITIONS[ideType];
	return {
		command: definition.command,
		args: definition.args,
	};
}

/**
 * Detect which IDEs are available on the system
 * Returns an array of available IDE types
 */
export function detectAvailableIDEs(): IDEType[] {
	const available: IDEType[] = [];

	for (const ideType of ALL_IDE_TYPES) {
		const definition = IDE_DEFINITIONS[ideType];

		// Check main command
		if (isCommandAvailable(definition.command)) {
			available.push(ideType);
			continue;
		}

		// Check alternative commands
		if (definition.alternativeCommands) {
			for (const altCmd of definition.alternativeCommands) {
				if (isCommandAvailable(altCmd)) {
					available.push(ideType);
					break;
				}
			}
		}
	}

	return available;
}

/**
 * Get the effective IDE configuration
 * Returns custom config if set, otherwise returns default for the IDE type
 */
export function getEffectiveIDEConfig(
	ideType: IDEType,
	customConfigs?: Partial<Record<IDEType, IDEConfig>>
): IDEConfig {
	// Use custom config if available
	if (customConfigs && customConfigs[ideType]) {
		return customConfigs[ideType]!;
	}

	// Otherwise use default
	const definition = IDE_DEFINITIONS[ideType];

	// Check if default command exists, otherwise try alternatives
	if (isCommandAvailable(definition.command)) {
		return {
			command: definition.command,
			args: definition.args,
		};
	}

	// Try alternative commands
	if (definition.alternativeCommands) {
		for (const altCmd of definition.alternativeCommands) {
			if (isCommandAvailable(altCmd)) {
				return {
					command: altCmd,
					args: definition.args,
				};
			}
		}
	}

	// Return default even if not found (let it fail at runtime)
	return {
		command: definition.command,
		args: definition.args,
	};
}

/**
 * Open an IDE at the specified directory using saved config
 */
export function openIDEInPath(path: string, config: IDEConfig | undefined): IDEResult {
	if (!config) {
		return {
			success: false,
			message: 'No IDE configured. Please configure an IDE in Settings.',
		};
	}

	try {
		// Replace {path} placeholder in args
		const args = config.args.map((arg) => arg.replace('{path}', path));

		const proc = spawn(config.command, args, {
			detached: true,
			stdio: 'ignore',
			shell: os.platform() === 'win32',
		});

		proc.on('error', (err) => {
			console.error(`[IDEService] spawn error: ${err.message}`);
		});

		proc.unref();

		return {
			success: true,
			message: `Opened IDE in ${path}`,
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to open IDE: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

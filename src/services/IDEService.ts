import { execSync, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

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
 * JetBrains IDE types (subset of IDEType that can be auto-detected)
 */
type JetBrainsIDEType = 'phpstorm' | 'webstorm' | 'idea' | 'pycharm';

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
	pycharm: {
		name: 'PyCharm',
		command: 'pycharm',
		args: ['{path}'],
		alternativeCommands: ['charm'],
	},
	'jetbrains-auto': {
		name: 'JetBrains (auto-detect)',
		command: 'idea', // Default fallback
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
export const ALL_IDE_TYPES: IDEType[] = [
	'vscode',
	'jetbrains-auto',
	'phpstorm',
	'webstorm',
	'idea',
	'pycharm',
	'vim',
];

/**
 * Check if a string is a valid IDE type
 */
export function isValidIDEType(value: string): value is IDEType {
	return ALL_IDE_TYPES.includes(value as IDEType);
}

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
 * Count files with specific extensions in a directory (non-recursive, quick check)
 */
function countFilesByExtension(dirPath: string, extensions: string[]): number {
	try {
		const entries = fs.readdirSync(dirPath, { withFileTypes: true });
		return entries.filter((entry) => {
			if (!entry.isFile()) return false;
			const ext = path.extname(entry.name).toLowerCase();
			return extensions.includes(ext);
		}).length;
	} catch {
		return 0;
	}
}

/**
 * Check if a file exists in the given directory
 */
function hasFile(dirPath: string, filename: string): boolean {
	try {
		return fs.existsSync(path.join(dirPath, filename));
	} catch {
		return false;
	}
}

/**
 * Detect which JetBrains IDE is most appropriate for a project directory.
 * Detection strategy:
 * 1. Check for config files (most definitive)
 * 2. Count file extensions as fallback
 * 3. Default to IntelliJ IDEA
 */
export function detectJetBrainsIDE(projectPath: string): JetBrainsIDEType {
	// Config file detection (highest priority)
	// PHP: composer.json
	if (hasFile(projectPath, 'composer.json')) {
		return 'phpstorm';
	}

	// Python: requirements.txt, pyproject.toml, setup.py, Pipfile
	if (
		hasFile(projectPath, 'requirements.txt') ||
		hasFile(projectPath, 'pyproject.toml') ||
		hasFile(projectPath, 'setup.py') ||
		hasFile(projectPath, 'Pipfile')
	) {
		return 'pycharm';
	}

	// Java/Kotlin: pom.xml, build.gradle, build.gradle.kts
	if (
		hasFile(projectPath, 'pom.xml') ||
		hasFile(projectPath, 'build.gradle') ||
		hasFile(projectPath, 'build.gradle.kts')
	) {
		return 'idea';
	}

	// JavaScript/TypeScript: package.json (check after PHP to avoid false positives)
	if (hasFile(projectPath, 'package.json')) {
		return 'webstorm';
	}

	// File extension counting (fallback)
	const phpCount = countFilesByExtension(projectPath, ['.php']);
	const pyCount = countFilesByExtension(projectPath, ['.py']);
	const javaCount = countFilesByExtension(projectPath, ['.java', '.kt', '.kts', '.scala']);
	const jsCount = countFilesByExtension(projectPath, ['.js', '.ts', '.jsx', '.tsx', '.vue']);

	const counts: { ide: JetBrainsIDEType; count: number }[] = [
		{ ide: 'phpstorm', count: phpCount },
		{ ide: 'pycharm', count: pyCount },
		{ ide: 'idea', count: javaCount },
		{ ide: 'webstorm', count: jsCount },
	];

	// Find the IDE with the highest file count
	const maxCount = counts.reduce((prev, current) => (current.count > prev.count ? current : prev));

	if (maxCount.count > 0) {
		return maxCount.ide;
	}

	// Default fallback
	return 'idea';
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
 * Result of resolving jetbrains-auto to a specific IDE
 */
export interface ResolvedIDEConfig {
	/** The resolved IDE type (never 'jetbrains-auto') */
	resolvedType: Exclude<IDEType, 'jetbrains-auto'>;
	/** The IDE configuration to use (undefined if IDE type is invalid) */
	config: IDEConfig | undefined;
}

/**
 * Resolve IDE type and config for a specific project path.
 * Handles 'jetbrains-auto' by detecting the appropriate JetBrains IDE.
 */
export function resolveIDEForPath(
	ideType: IDEType,
	projectPath: string,
	customConfigs?: Partial<Record<IDEType, IDEConfig>>
): ResolvedIDEConfig {
	let resolvedType: Exclude<IDEType, 'jetbrains-auto'>;

	if (ideType === 'jetbrains-auto') {
		resolvedType = detectJetBrainsIDE(projectPath);
	} else {
		resolvedType = ideType;
	}

	const config = getEffectiveIDEConfig(resolvedType, customConfigs);
	return { resolvedType, config };
}

/**
 * JetBrains IDE types for availability checking
 */
const JETBRAINS_IDE_TYPES: JetBrainsIDEType[] = ['phpstorm', 'webstorm', 'idea', 'pycharm'];

/**
 * Detect which IDEs are available on the system
 * Returns an array of available IDE types
 */
export function detectAvailableIDEs(): IDEType[] {
	const available: IDEType[] = [];
	let hasAnyJetBrains = false;

	for (const ideType of ALL_IDE_TYPES) {
		// Skip jetbrains-auto in the main loop - we'll add it separately
		if (ideType === 'jetbrains-auto') continue;

		const definition = IDE_DEFINITIONS[ideType];

		// Check main command
		if (isCommandAvailable(definition.command)) {
			available.push(ideType);
			if (JETBRAINS_IDE_TYPES.includes(ideType as JetBrainsIDEType)) {
				hasAnyJetBrains = true;
			}
			continue;
		}

		// Check alternative commands
		if (definition.alternativeCommands) {
			for (const altCmd of definition.alternativeCommands) {
				if (isCommandAvailable(altCmd)) {
					available.push(ideType);
					if (JETBRAINS_IDE_TYPES.includes(ideType as JetBrainsIDEType)) {
						hasAnyJetBrains = true;
					}
					break;
				}
			}
		}
	}

	// Add jetbrains-auto if any JetBrains IDE is available
	if (hasAnyJetBrains) {
		// Insert after vscode (index 1) to maintain nice ordering
		const vsCodeIndex = available.indexOf('vscode');
		if (vsCodeIndex >= 0) {
			available.splice(vsCodeIndex + 1, 0, 'jetbrains-auto');
		} else {
			available.unshift('jetbrains-auto');
		}
	}

	return available;
}

/**
 * Get the effective IDE configuration
 * Returns custom config if set, otherwise returns default for the IDE type
 * Returns undefined if the IDE type is not valid
 */
export function getEffectiveIDEConfig(
	ideType: IDEType | string,
	customConfigs?: Partial<Record<IDEType, IDEConfig>>
): IDEConfig | undefined {
	// Validate IDE type at runtime (TypeScript types are erased)
	if (!isValidIDEType(ideType)) {
		console.warn(`Invalid IDE type: "${ideType}". Valid types: ${ALL_IDE_TYPES.join(', ')}`);
		return undefined;
	}

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

import os from 'os';

import type { TerminalId } from '../storage/types.js';
import { commandExists } from '../utils/commandExists.js';
import { ALL_TERMINAL_ADAPTERS } from './adapters.js';
import type { TerminalAdapter } from './types.js';

const registry = new Map<TerminalId, TerminalAdapter>(
	ALL_TERMINAL_ADAPTERS.map((adapter) => [adapter.id, adapter])
);

/** Resolve an adapter by id. */
export function getAdapter(id: TerminalId): TerminalAdapter | undefined {
	return registry.get(id);
}

/** All registered adapters, in preference order. */
export function allAdapters(): TerminalAdapter[] {
	return ALL_TERMINAL_ADAPTERS;
}

/**
 * Adapters available on the given platform (defaults to the current platform).
 * `custom` is always included so users can configure an unlisted terminal.
 */
export function adaptersForPlatform(platform: NodeJS.Platform = os.platform()): TerminalAdapter[] {
	return ALL_TERMINAL_ADAPTERS.filter((a) => a.platforms.includes(platform));
}

/** Display name for a terminal id (falls back to the raw id). */
export function getTerminalDisplayName(id: TerminalId): string {
	return registry.get(id)?.displayName ?? id;
}

/** Whether an adapter is installed/usable on the current platform. */
export async function isAdapterAvailable(adapter: TerminalAdapter): Promise<boolean> {
	if (!adapter.platforms.includes(os.platform())) {
		return false;
	}
	if (adapter.isAvailable) {
		return adapter.isAvailable();
	}
	// App-based terminals (no PATH command) are assumed present on their platform.
	if (!adapter.detectCommand) {
		return true;
	}
	return commandExists(adapter.detectCommand);
}

/**
 * Detect every installed terminal on the current platform, in preference order.
 * The first entry is the auto-detected default. Excludes `custom`.
 */
export async function detectAvailableTerminalIds(): Promise<TerminalId[]> {
	const available: TerminalId[] = [];
	for (const adapter of adaptersForPlatform()) {
		if (adapter.id === 'custom') {
			continue;
		}
		if (await isAdapterAvailable(adapter)) {
			available.push(adapter.id);
		}
	}
	return available;
}

/**
 * Map a legacy terminal command (from the old `settings.terminal.command`) to a
 * terminal id, for one-time settings migration. Returns undefined when the
 * command does not correspond to a known adapter (caller falls back to `custom`).
 */
export function commandToTerminalId(command: string): TerminalId | undefined {
	// macOS Terminal.app was historically launched via `open -a Terminal`.
	if (command === 'open') {
		return 'terminal-app';
	}
	const match = ALL_TERMINAL_ADAPTERS.find((a) => a.detectCommand === command || a.id === command);
	return match?.id;
}

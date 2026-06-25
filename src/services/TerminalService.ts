import { spawn } from 'child_process';
import os from 'os';

import type { Settings, TerminalId, TerminalSettings } from '../storage/types.js';
import {
	detectAvailableTerminalIds,
	getAdapter,
	getTerminalDisplayName,
} from '../terminals/index.js';

export interface TerminalResult {
	success: boolean;
	message: string;
}

export { getTerminalDisplayName };

/**
 * Detect every terminal installed on the current platform, in preference order.
 * The first entry is the auto-detected default. Backed by the terminal adapter
 * registry (`src/terminals/`).
 */
export function detectAvailableTerminals(): Promise<TerminalId[]> {
	return detectAvailableTerminalIds();
}

/**
 * Resolve which terminal id to use: the user's `selectedTerminal`, otherwise the
 * first auto-detected terminal. Returns undefined when none is available.
 */
export async function resolveTerminalId(settings: Settings): Promise<TerminalId | undefined> {
	if (settings.selectedTerminal) {
		return settings.selectedTerminal;
	}
	const detected = await detectAvailableTerminalIds();
	return detected[0];
}

/**
 * Open a plain terminal window in the specified directory using the given
 * terminal id. `custom` config is required only for the `custom` terminal id.
 */
export function openTerminalInPath(
	path: string,
	terminalId: TerminalId | undefined,
	custom?: TerminalSettings
): TerminalResult {
	if (!terminalId) {
		return {
			success: false,
			message: 'No terminal configured. Choose one in Settings → Terminal.',
		};
	}

	const adapter = getAdapter(terminalId);
	if (!adapter) {
		return {
			success: false,
			message: `Unknown terminal '${terminalId}'. Choose one in Settings → Terminal.`,
		};
	}

	try {
		const spec = adapter.openTerminal(path, custom);
		if (!spec.command) {
			return {
				success: false,
				message: 'No command configured for the custom terminal.',
			};
		}

		const proc = spawn(spec.command, spec.args, {
			detached: true,
			stdio: 'ignore',
			shell: spec.shell ?? os.platform() === 'win32',
		});

		proc.on('error', (err) => {
			console.error(`[TerminalService] spawn error: ${err.message}`);
		});

		proc.unref();

		return {
			success: true,
			message: `Opened ${getTerminalDisplayName(terminalId)} in ${path}`,
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to open terminal: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

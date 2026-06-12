import { spawn } from 'child_process';
import os from 'os';

/**
 * Per-command availability cache. A command's presence in PATH does not change
 * mid-session, so results are cached forever (no TTL). The cache stores the
 * in-flight promise so concurrent callers for the same command share one probe.
 */
const cache = new Map<string, Promise<boolean>>();

/**
 * Check whether a command exists in the system PATH without blocking the event
 * loop. Uses `which` (or `where` on Windows) via async `spawn` and resolves to
 * the exit-code check. Results are memoized per command for the process lifetime.
 */
export function commandExists(command: string): Promise<boolean> {
	const cached = cache.get(command);
	if (cached) {
		return cached;
	}

	const probe = new Promise<boolean>((resolve) => {
		const checkCmd = os.platform() === 'win32' ? 'where' : 'which';
		const proc = spawn(checkCmd, [command], { stdio: 'ignore' });
		proc.on('close', (code) => resolve(code === 0));
		proc.on('error', () => resolve(false));
	});

	cache.set(command, probe);
	return probe;
}

/**
 * Clear the command-availability cache. Intended for tests so each case starts
 * from a clean slate.
 */
export function clearCommandExistsCache(): void {
	cache.clear();
}

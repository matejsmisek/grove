import { spawn } from 'child_process';

/**
 * Result of {@link spawnCollect}. `error` is set when the process failed to spawn,
 * `timedOut` when it was killed for exceeding the timeout.
 */
export interface SpawnCollectResult {
	stdout: string;
	stderr: string;
	error?: Error;
	timedOut: boolean;
}

/**
 * Run a command via async `spawn`, collecting stdout/stderr, with a timeout.
 * Never rejects: process errors and timeouts are reported on the resolved object
 * so callers can branch without try/catch. On timeout the child is killed.
 */
export function spawnCollect(
	command: string,
	args: string[],
	opts: { cwd?: string; timeoutMs: number }
): Promise<SpawnCollectResult> {
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

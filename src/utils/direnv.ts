import { execSync, spawnSync } from 'child_process';

/**
 * direnv integration helpers.
 *
 * Some repositories rely on direnv to load their environment from a `.envrc`
 * file. The `.envrc` may live in the worktree itself or in any parent
 * directory. When launching Claude or running init actions in such a directory
 * we must wrap the command with `direnv exec <dir> …` so the environment is
 * loaded exactly the way an interactive shell would load it.
 *
 * Detection is delegated to direnv itself (`direnv status`) rather than walking
 * the tree by hand, so Grove never diverges from what `direnv exec` actually
 * resolves at launch time (including parent `.envrc` files and the user's
 * whitelist configuration).
 */

/** Cached result of the `which direnv` probe; direnv availability never changes mid-session. */
let direnvAvailableCache: boolean | undefined;

/**
 * Whether the `direnv` binary is available on PATH. Memoized for the process
 * lifetime since installation state does not change while Grove is running.
 */
export function isDirenvAvailable(): boolean {
	if (direnvAvailableCache === undefined) {
		try {
			execSync('which direnv', { stdio: 'ignore' });
			direnvAvailableCache = true;
		} catch {
			direnvAvailableCache = false;
		}
	}
	return direnvAvailableCache;
}

export interface DirenvDirStatus {
	/** An `.envrc`/`.env` was found for this directory (here or in a parent). */
	hasEnvrc: boolean;
	/** Absolute path of the resolved `.envrc`/`.env`, if any. */
	rcPath?: string;
	/**
	 * Whether direnv is currently allowed to load the resolved file. When false
	 * and the path is not whitelisted, `direnv exec` will warn and run the
	 * command WITHOUT loading the environment until `direnv allow` is run.
	 */
	allowed: boolean;
}

/**
 * Ask direnv whether the given directory resolves to an `.envrc`/`.env` (walking
 * up to parents) by parsing `direnv status`. Returns a no-direnv result when the
 * binary is missing or the probe fails for any reason — detection is strictly
 * best-effort and must never throw into a launch path.
 */
export function getDirenvDirStatus(dir: string): DirenvDirStatus {
	const none: DirenvDirStatus = { hasEnvrc: false, allowed: false };

	if (!isDirenvAvailable()) {
		return none;
	}

	try {
		const result = spawnSync('direnv', ['status'], {
			cwd: dir,
			encoding: 'utf-8',
			timeout: 5000,
		});

		const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;

		// direnv prints "Found RC path <path>" when an .envrc/.env is resolved for
		// the directory (here or in a parent), and "Loaded RC path <path>" when one
		// is already loaded in the current shell. Either means the directory uses
		// direnv. Older versions ignore the unsupported --json flag, so we parse the
		// stable text format.
		const rcMatch = output.match(/(?:Found|Loaded) RC path\s+(.+)/i);
		if (!rcMatch) {
			return none;
		}

		const allowedMatch = output.match(/(?:Found|Loaded) RC allowed\s+(\S+)/i);
		// 2.32 prints true/false; tolerate a numeric "0" (allowed) from other builds.
		const allowed = allowedMatch ? /^(true|0)$/i.test(allowedMatch[1]) : false;

		return {
			hasEnvrc: true,
			rcPath: rcMatch[1].trim(),
			allowed,
		};
	} catch {
		return none;
	}
}

/**
 * Whether commands launched in `dir` should be wrapped with `direnv exec`.
 * True when direnv is installed and an `.envrc`/`.env` resolves for the directory.
 */
export function dirNeedsDirenv(dir: string): boolean {
	return getDirenvDirStatus(dir).hasEnvrc;
}

/**
 * Wrap a command + argv for `spawn`/`spawnSync` so it runs under `direnv exec`
 * when `dir` uses direnv. Returns the original command/args otherwise.
 *
 * Uses the argv form (no shell), so directory paths containing spaces are handled
 * safely. Wrapping is harmless even when the `.envrc` is not yet allowed: direnv
 * warns and runs the command without the environment rather than failing.
 */
export function wrapSpawnWithDirenv(
	dir: string,
	command: string,
	args: string[]
): { command: string; args: string[] } {
	if (!dirNeedsDirenv(dir)) {
		return { command, args };
	}
	return { command: 'direnv', args: ['exec', dir, command, ...args] };
}

/**
 * Prefix a shell command string with `direnv exec <dir>` when `dir` uses direnv.
 * Used when the command is substituted into a terminal session template
 * (konsole/kitty) that is itself parsed/executed by the terminal. The directory
 * is left unquoted to match how `${WORKING_DIR}` is used in those templates.
 */
export function prefixCommandWithDirenv(dir: string, command: string): string {
	if (!dirNeedsDirenv(dir)) {
		return command;
	}
	return `direnv exec ${dir} ${command}`;
}

/**
 * A user-facing warning when `dir` resolves to an `.envrc`/`.env` that direnv has
 * found but is NOT allowed to load (and is not whitelisted). In that state
 * `direnv exec` runs the command WITHOUT the environment, which is rarely what the
 * user wants — so we tell them to run `direnv allow`. Returns undefined when there
 * is nothing to warn about (no direnv, no `.envrc`, or already allowed).
 *
 * Note: a whitelisted directory reports `allowed = true`, so this never warns for
 * paths under the user's `whitelist.prefix`.
 */
export function getDirenvAllowWarning(dir: string): string | undefined {
	const status = getDirenvDirStatus(dir);
	if (status.hasEnvrc && !status.allowed) {
		return `direnv: ${status.rcPath ?? '.envrc'} is not allowed — its environment will NOT be loaded. Run \`direnv allow\` in that directory.`;
	}
	return undefined;
}

/** Reset the memoized availability probe. Intended for tests only. */
export function __resetDirenvCacheForTests(): void {
	direnvAvailableCache = undefined;
}

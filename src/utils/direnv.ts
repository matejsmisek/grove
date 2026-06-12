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
	/**
	 * Absolute path of the `.envrc`/`.env` currently LOADED in the inherited
	 * environment (direnv's `DIRENV_DIFF`), if any. This can differ from `rcPath`
	 * — or be set while `hasEnvrc` is false — when the process was spawned
	 * carrying a parent shell's direnv environment (rather than entered via the
	 * direnv shell hook). That is a STALE environment leaking into `dir`; see
	 * `hasStaleDirenvEnv` / `getStaleDirenvWarning`.
	 */
	loadedRcPath?: string;
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

		// `direnv status` prints two distinct families of lines, and they mean
		// different things:
		//   "Found RC path <p>"  — an .envrc/.env that RESOLVES for `dir` (walking
		//                          up the tree). This is the ONLY reliable signal
		//                          that THIS directory uses direnv.
		//   "Loaded RC path <p>" — whatever is currently LOADED in the inherited
		//                          environment (direnv's DIRENV_DIFF). When the
		//                          process was spawned carrying a parent shell's
		//                          direnv env, this is a DIFFERENT directory and
		//                          must NOT be read as `dir` using direnv.
		// Older versions ignore the unsupported --json flag, so we parse the stable
		// text format.
		const foundPath = output.match(/Found RC path\s+(.+)/i);
		const loadedPath = output.match(/Loaded RC path\s+(.+)/i);

		const hasEnvrc = Boolean(foundPath);
		const loadedRcPath = loadedPath ? loadedPath[1].trim() : undefined;

		// Nothing resolves for the directory and nothing is loaded — direnv plays
		// no part here.
		if (!hasEnvrc && !loadedRcPath) {
			return none;
		}

		// `allowed` reflects the directory's OWN resolved file ("Found RC allowed"),
		// not the inherited/loaded one. 2.32 prints true/false; tolerate a numeric
		// "0" (allowed) from other builds.
		const allowedMatch = output.match(/Found RC allowed\s+(\S+)/i);
		const allowed = allowedMatch ? /^(true|0)$/i.test(allowedMatch[1]) : false;

		return {
			hasEnvrc,
			rcPath: foundPath ? foundPath[1].trim() : undefined,
			allowed,
			loadedRcPath,
		};
	} catch {
		return none;
	}
}

/**
 * Whether `dir` has its OWN direnv config — i.e. an `.envrc`/`.env` resolves for
 * the directory (here or in a parent). Note this is about the directory itself,
 * not about whatever environment the current process happens to carry; for the
 * launch-wrapping decision use `shouldRunUnderDirenv`.
 */
export function dirNeedsDirenv(dir: string): boolean {
	return getDirenvDirStatus(dir).hasEnvrc;
}

/**
 * Whether commands launched in `dir` should run under `direnv exec`. True when
 * direnv is installed and EITHER:
 *   - `dir` uses direnv (`hasEnvrc`) — so `direnv exec` LOADS the right env; or
 *   - a direnv environment is currently loaded from elsewhere (`loadedRcPath`) —
 *     so `direnv exec <dir>` reverts the inherited `DIRENV_DIFF` and SCRUBS that
 *     stale environment instead of letting it leak into the launched command.
 *
 * Running `direnv exec <dir>` is safe in both cases: when `dir` has no `.envrc`
 * the inherited diff is reverted to the original environment; when it has one the
 * correct environment is loaded.
 */
export function shouldRunUnderDirenv(dir: string): boolean {
	const status = getDirenvDirStatus(dir);
	return status.hasEnvrc || Boolean(status.loadedRcPath);
}

/**
 * Wrap a command + argv for `spawn`/`spawnSync` so it runs under `direnv exec`
 * when `dir` uses direnv. Returns the original command/args otherwise.
 *
 * Uses the argv form (no shell), so directory paths containing spaces are handled
 * safely. Wrapping is harmless even when the `.envrc` is not yet allowed: direnv
 * warns and runs the command without the environment rather than failing. It also
 * scrubs a stale inherited environment (see `shouldRunUnderDirenv`).
 */
export function wrapSpawnWithDirenv(
	dir: string,
	command: string,
	args: string[]
): { command: string; args: string[] } {
	if (!shouldRunUnderDirenv(dir)) {
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
	if (!shouldRunUnderDirenv(dir)) {
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

/**
 * Whether the current process carries a STALE direnv environment relative to
 * `dir` — i.e. an `.envrc`/`.env` is loaded in the inherited environment but it
 * was loaded for a DIFFERENT directory than `dir` resolves to (or `dir` resolves
 * to none at all).
 *
 * This happens when a process is spawned — rather than entered via direnv's
 * interactive shell hook — inheriting the parent shell's `DIRENV_DIFF`: another
 * directory's environment (`PATH`, secrets, `GIT_COMMON_DIR`, …) leaks into a
 * directory that does not use it. `shouldRunUnderDirenv` returns true in this
 * case so the launch wrapper scrubs the stale environment via `direnv exec`.
 */
export function hasStaleDirenvEnv(dir: string): boolean {
	const status = getDirenvDirStatus(dir);
	if (!status.loadedRcPath) {
		return false;
	}
	return !status.hasEnvrc || status.loadedRcPath !== status.rcPath;
}

/**
 * A user-facing warning when `dir` carries a stale inherited direnv environment
 * (see `hasStaleDirenvEnv`). Returns undefined when there is nothing to warn
 * about (no loaded env, or the loaded env is exactly `dir`'s own `.envrc`).
 */
export function getStaleDirenvWarning(dir: string): string | undefined {
	const status = getDirenvDirStatus(dir);
	if (!status.loadedRcPath || (status.hasEnvrc && status.loadedRcPath === status.rcPath)) {
		return undefined;
	}
	if (!status.hasEnvrc) {
		return `direnv: a stale environment loaded from ${status.loadedRcPath} is active, but this directory has no .envrc of its own — it will be scrubbed by \`direnv exec\` before launch.`;
	}
	return `direnv: a stale environment loaded from ${status.loadedRcPath} is active, but this directory resolves to ${status.rcPath} — it will be reloaded by \`direnv exec\` before launch.`;
}

/**
 * Combined user-facing direnv warning for a launch in `dir`: surfaces a stale
 * inherited environment and/or an unallowed `.envrc`. Returns undefined when
 * there is nothing to warn about.
 */
export function getDirenvWarning(dir: string): string | undefined {
	const warnings = [getStaleDirenvWarning(dir), getDirenvAllowWarning(dir)].filter(Boolean);
	return warnings.length > 0 ? warnings.join('\n') : undefined;
}

/** Reset the memoized availability probe. Intended for tests only. */
export function __resetDirenvCacheForTests(): void {
	direnvAvailableCache = undefined;
}

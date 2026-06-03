import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Environment variable that overrides the location of the global Grove
 * settings folder. When set, its value is used as the directory where global
 * Grove data (settings.json, repositories.json, groves.json, workspaces.json,
 * ...) is stored instead of the default ~/.grove.
 */
export const GROVE_GLOBAL_DIR_ENV = 'GROVE_GLOBAL_DIR';

/**
 * Error thrown when the configured global Grove folder cannot be used.
 * Carries enough context to render a helpful, full-screen error message.
 */
export class GlobalGroveDirError extends Error {
	constructor(
		public readonly folder: string,
		public readonly fromEnv: boolean,
		public readonly reason: string
	) {
		super(
			`Unable to use global Grove directory "${folder}"${
				fromEnv ? ` (from ${GROVE_GLOBAL_DIR_ENV})` : ''
			}: ${reason}`
		);
		this.name = 'GlobalGroveDirError';
	}
}

/**
 * Resolve the folder used to store global Grove settings.
 *
 * Honors the GROVE_GLOBAL_DIR environment variable when set (resolved to an
 * absolute path), otherwise defaults to ~/.grove.
 */
export function getGlobalGroveFolder(): string {
	const override = process.env[GROVE_GLOBAL_DIR_ENV]?.trim();
	if (override) {
		return path.resolve(override);
	}
	return path.join(os.homedir(), '.grove');
}

/**
 * Ensure the global Grove folder exists, creating it (recursively) if needed.
 *
 * Returns the resolved folder path on success. Throws a {@link GlobalGroveDirError}
 * when the folder cannot be created or an existing path is not a directory.
 */
export function ensureGlobalGroveFolder(): string {
	const folder = getGlobalGroveFolder();
	const fromEnv = Boolean(process.env[GROVE_GLOBAL_DIR_ENV]?.trim());

	try {
		fs.mkdirSync(folder, { recursive: true });
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new GlobalGroveDirError(folder, fromEnv, reason);
	}

	let isDirectory = false;
	try {
		isDirectory = fs.statSync(folder).isDirectory();
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new GlobalGroveDirError(folder, fromEnv, reason);
	}

	if (!isDirectory) {
		throw new GlobalGroveDirError(folder, fromEnv, 'path exists but is not a directory');
	}

	return folder;
}

import type { IUpdateService } from '../services/UpdateService.js';
import { isNewerVersion } from '../utils/version.js';

/** The npm package name Grove is published under. */
const PACKAGE_NAME = 'hypergrove';

export interface UpdateCheckResult {
	/** Whether the version check itself succeeded (false only when the registry couldn't be reached). */
	success: boolean;
	/** Installed version. */
	current: string;
	/** Latest published version, or null when it couldn't be determined. */
	latest: string | null;
	/** Whether a newer version is available. */
	updateAvailable: boolean;
	/** The command the user should run to update. */
	installCommand: string;
	/** Human-readable lines to print to stdout. */
	lines: string[];
}

/**
 * `grove update` — a notify-only update check. Fetches the latest published
 * version from the npm registry (forced, bypassing the cache, since the user
 * explicitly asked) and prints the exact `npm install -g hypergrove@<version>`
 * command to run. It never installs anything itself, matching the convention of
 * npm/yarn/gh and Grove's in-app "Update available" hint.
 */
export async function checkForUpdate(updateService: IUpdateService): Promise<UpdateCheckResult> {
	const current = updateService.getCurrentVersion();
	const latest = await updateService.getLatestVersion({ force: true });

	if (latest === null) {
		// Offline / registry unavailable: we don't know the exact version, so fall
		// back to the @latest tag in the hint.
		const installCommand = `npm install -g ${PACKAGE_NAME}@latest`;
		return {
			success: false,
			current,
			latest: null,
			updateAvailable: false,
			installCommand,
			lines: [
				`Grove v${current}`,
				'',
				'Could not check for updates (offline or registry unavailable).',
				'To update to the latest version, run:',
				`  ${installCommand}`,
			],
		};
	}

	if (!isNewerVersion(latest, current)) {
		return {
			success: true,
			current,
			latest,
			updateAvailable: false,
			installCommand: `npm install -g ${PACKAGE_NAME}@${latest}`,
			lines: [`Grove v${current} is up to date (latest: v${latest}).`],
		};
	}

	const installCommand = `npm install -g ${PACKAGE_NAME}@${latest}`;
	return {
		success: true,
		current,
		latest,
		updateAvailable: true,
		installCommand,
		lines: [
			`Update available: Grove v${current} → v${latest}`,
			'',
			'To update, run:',
			`  ${installCommand}`,
		],
	};
}

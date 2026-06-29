import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { useService } from '../di/index.js';
import { UpdateServiceToken } from '../services/tokens.js';
import { getAppVersion, isNewerVersion } from '../utils/version.js';

export interface UpdateStatus {
	/** The installed Grove version. */
	current: string;
	/** The latest published version, or null when unknown (offline / not yet checked). */
	latest: string | null;
	/** True when a strictly newer version than {@link current} is available. */
	updateAvailable: boolean;
}

const FALLBACK: UpdateStatus = {
	current: getAppVersion(),
	latest: null,
	updateAvailable: false,
};

const UpdateStatusContext = createContext<UpdateStatus | null>(null);

/**
 * Checks the npm registry for a newer Grove release once on mount (non-blocking;
 * the result is cached for 2h by {@link UpdateService}) and shares it with the
 * status bar via {@link useUpdateStatus}. Notify-only — it never installs
 * anything, it just lets the UI surface an "Update available" hint.
 */
export function UpdateStatusProvider({ children }: { children: React.ReactNode }) {
	const updateService = useService(UpdateServiceToken);
	const current = useMemo(() => updateService.getCurrentVersion(), [updateService]);
	const [latest, setLatest] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		void updateService.getLatestVersion().then((value) => {
			if (!cancelled) {
				setLatest(value);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [updateService]);

	const value = useMemo<UpdateStatus>(
		() => ({
			current,
			latest,
			updateAvailable: latest !== null && isNewerVersion(latest, current),
		}),
		[current, latest]
	);

	return <UpdateStatusContext.Provider value={value}>{children}</UpdateStatusContext.Provider>;
}

/**
 * Access the shared update status. Returns a safe fallback (current version,
 * no update) when used outside the provider.
 */
export function useUpdateStatus(): UpdateStatus {
	return useContext(UpdateStatusContext) ?? FALLBACK;
}

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { useService } from '../di/index.js';
import { UpdateServiceToken } from '../services/tokens.js';
import { getAppVersion, isNewerVersion, shouldShowUpdateNotification } from '../utils/version.js';

export interface UpdateStatus {
	/** The installed Grove version. */
	current: string;
	/** The latest published version, or null when unknown (offline / not yet checked). */
	latest: string | null;
	/** True when a strictly newer version than {@link current} is available. */
	updateAvailable: boolean;
	/**
	 * Whether the "update available" modal should be shown. True only when an
	 * update is available and it isn't snoozed (see the 7-day cooldown in
	 * {@link shouldShowUpdateNotification}) and it hasn't been dismissed this
	 * session.
	 */
	showNotification: boolean;
	/**
	 * Dismiss the "update available" modal for the current latest version,
	 * starting the snooze cooldown. Hides the modal for the rest of the session.
	 */
	dismissNotification: () => void;
}

const FALLBACK: UpdateStatus = {
	current: getAppVersion(),
	latest: null,
	updateAvailable: false,
	showNotification: false,
	dismissNotification: () => {},
};

const UpdateStatusContext = createContext<UpdateStatus | null>(null);

/**
 * Checks the npm registry for a newer Grove release once on mount (non-blocking;
 * the result is cached for 2h by {@link UpdateService}) and shares it with the
 * status bar and the "update available" modal via {@link useUpdateStatus}.
 * Notify-only — it never installs anything, it just lets the UI surface an
 * "Update available" hint and the upgrade command.
 */
export function UpdateStatusProvider({ children }: { children: React.ReactNode }) {
	const updateService = useService(UpdateServiceToken);
	const current = useMemo(() => updateService.getCurrentVersion(), [updateService]);
	const [latest, setLatest] = useState<string | null>(null);
	// Read the persisted dismissal once; it only changes via dismissNotification.
	const [dismissal] = useState(() => updateService.getDismissal());
	const [dismissedThisSession, setDismissedThisSession] = useState(false);

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

	const dismissNotification = useCallback(() => {
		if (latest) {
			updateService.dismissUpdate(latest);
		}
		setDismissedThisSession(true);
	}, [latest, updateService]);

	const value = useMemo<UpdateStatus>(() => {
		const updateAvailable = latest !== null && isNewerVersion(latest, current);
		const showNotification =
			!dismissedThisSession &&
			shouldShowUpdateNotification({
				current,
				latest,
				dismissedVersion: dismissal.version,
				dismissedAt: dismissal.at,
				now: Date.now(),
			});
		return { current, latest, updateAvailable, showNotification, dismissNotification };
	}, [current, latest, dismissal, dismissedThisSession, dismissNotification]);

	return <UpdateStatusContext.Provider value={value}>{children}</UpdateStatusContext.Provider>;
}

/**
 * Access the shared update status. Returns a safe fallback (current version,
 * no update) when used outside the provider.
 */
export function useUpdateStatus(): UpdateStatus {
	return useContext(UpdateStatusContext) ?? FALLBACK;
}

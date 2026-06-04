import { useEffect, useState } from 'react';

import type { MrCellState } from '../components/MergeRequestCell.js';
import { useService } from '../di/index.js';
import { GITLAB_PLUGIN_ID, type GitLabPlugin, MR_CACHE_TTL_MS } from '../plugins/gitlab/index.js';
import { GitServiceToken, PluginRegistryToken } from '../services/tokens.js';

/**
 * Resolve (and keep fresh) the GitLab merge request status for a worktree branch.
 *
 * Returns `undefined` when the GitLab plugin is disabled/unconfigured or when
 * inputs are missing — callers can simply render nothing in that case. Otherwise
 * it returns a loading/none/error/loaded cell state. The status loads after the
 * first render (never blocking) and refreshes in the background every
 * {@link MR_CACHE_TTL_MS}; the plugin's own cache makes repeat resolves cheap.
 *
 * @param repositoryPath - repository root whose `origin` remote is queried
 * @param branch - the worktree's branch name
 * @param enabled - gate (e.g. false for closed worktrees)
 */
export function useMergeRequestStatus(
	repositoryPath: string | undefined,
	branch: string | undefined,
	enabled: boolean
): MrCellState | undefined {
	const gitService = useService(GitServiceToken);
	const pluginRegistry = useService(PluginRegistryToken);
	const [state, setState] = useState<MrCellState | undefined>(undefined);

	useEffect(() => {
		const plugin = pluginRegistry.get(GITLAB_PLUGIN_ID) as GitLabPlugin | undefined;
		const active =
			enabled &&
			!!repositoryPath &&
			!!branch &&
			!!plugin &&
			pluginRegistry.isEnabled(GITLAB_PLUGIN_ID) &&
			!!plugin.getAccessToken();

		if (!active || !plugin || !repositoryPath || !branch) {
			setState(undefined);
			return;
		}

		let cancelled = false;

		const fetchStatus = async (showLoading: boolean) => {
			if (showLoading) {
				setState((prev) => prev ?? { state: 'loading' });
			}
			try {
				const remoteUrl = await gitService.getRemoteUrl(repositoryPath);
				if (cancelled) {
					return;
				}
				if (!remoteUrl) {
					setState({ state: 'none' });
					return;
				}
				const info = await plugin.getMergeRequestStatus(remoteUrl, branch);
				if (cancelled) {
					return;
				}
				setState(info ? { state: 'loaded', info } : { state: 'none' });
			} catch {
				if (!cancelled) {
					setState({ state: 'error' });
				}
			}
		};

		fetchStatus(true);
		const interval = setInterval(() => fetchStatus(false), MR_CACHE_TTL_MS);

		return () => {
			cancelled = true;
			clearInterval(interval);
		};
	}, [repositoryPath, branch, enabled, gitService, pluginRegistry]);

	return state;
}

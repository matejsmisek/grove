import React, { useEffect, useState } from 'react';

import { Box, Text, useInput } from 'ink';

import { useService } from '../di/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import { GITLAB_TOKEN_ENV_VAR, GITLAB_URL_ENV_VAR } from '../plugins/gitlab/index.js';
import type { GitLabUser } from '../plugins/gitlab/index.js';
import { GitLabPluginToken } from '../services/tokens.js';

type ConnectionStatus =
	| { state: 'no-token' }
	| { state: 'checking' }
	| { state: 'connected'; user: GitLabUser }
	| { state: 'error'; message: string };

export function GitLabSettingsScreen() {
	const { goBack, canGoBack } = useNavigation();
	const plugin = useService(GitLabPluginToken);

	const [enabled, setEnabled] = useState(plugin.isEnabled());
	const [isToggling, setIsToggling] = useState(false);
	const [toggleError, setToggleError] = useState<string | null>(null);
	const [status, setStatus] = useState<ConnectionStatus>({ state: 'checking' });

	const token = plugin.getAccessToken();
	const baseUrl = plugin.getBaseUrl();
	const tokenFromEnv = !!process.env[GITLAB_TOKEN_ENV_VAR];
	const urlFromEnv = !!process.env[GITLAB_URL_ENV_VAR];

	useEffect(() => {
		let cancelled = false;

		// Only probe the connection while the plugin is enabled
		if (!enabled) {
			return;
		}

		if (!token) {
			setStatus({ state: 'no-token' });
			return;
		}

		setStatus({ state: 'checking' });

		plugin
			.validateToken()
			.then((user) => {
				if (!cancelled) {
					setStatus({ state: 'connected', user });
				}
			})
			.catch((error: unknown) => {
				if (!cancelled) {
					const message = error instanceof Error ? error.message : 'Unknown error';
					setStatus({ state: 'error', message });
				}
			});

		return () => {
			cancelled = true;
		};
	}, [plugin, token, enabled]);

	useInput(async (input, key) => {
		if (isToggling) return;

		if (key.escape && canGoBack) {
			goBack();
		} else if (key.return || input === ' ') {
			setIsToggling(true);
			setToggleError(null);
			try {
				if (enabled) {
					await plugin.disable();
				} else {
					await plugin.enable();
				}
			} catch (error: unknown) {
				setToggleError(error instanceof Error ? error.message : 'Failed to update plugin');
			} finally {
				// Reflect the persisted state, even if initialization failed
				setEnabled(plugin.isEnabled());
				setIsToggling(false);
			}
		}
	});

	// Mask the token for display
	const maskToken = (value: string): string => {
		if (value.length <= 8) {
			return '****';
		}
		return value.substring(0, 4) + '...' + value.substring(value.length - 4);
	};

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="yellow">
					GitLab Integration
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text dimColor>
					Authenticated via the <Text color="cyan">{GITLAB_TOKEN_ENV_VAR}</Text> environment variable.
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text color="cyan">{'> '}</Text>
				<Text bold>Enabled: </Text>
				<Text color={enabled ? 'green' : 'red'}>{enabled ? 'On' : 'Off'}</Text>
				{isToggling && <Text color="yellow"> …</Text>}
			</Box>

			{toggleError && (
				<Box marginBottom={1}>
					<Text color="red">{toggleError}</Text>
				</Box>
			)}

			{enabled ? (
				<>
					<Box flexDirection="column" marginBottom={1}>
						<Box>
							<Text>Instance: </Text>
							<Text color="cyan">{baseUrl}</Text>
							{urlFromEnv && <Text dimColor> (from {GITLAB_URL_ENV_VAR})</Text>}
						</Box>
						<Box>
							<Text>Token: </Text>
							{token ? (
								<>
									<Text color="cyan">{maskToken(token)}</Text>
									<Text dimColor>
										{' '}
										{tokenFromEnv ? `(from ${GITLAB_TOKEN_ENV_VAR})` : '(from settings)'}
									</Text>
								</>
							) : (
								<Text color="red">not set</Text>
							)}
						</Box>
					</Box>

					<Box marginTop={1} flexDirection="column">
						<Text bold>Status</Text>
						<Box marginTop={1}>
							{status.state === 'no-token' && (
								<Text color="yellow">
									No token found. Set {GITLAB_TOKEN_ENV_VAR} to enable the GitLab integration.
								</Text>
							)}
							{status.state === 'checking' && <Text color="yellow">Checking connection…</Text>}
							{status.state === 'connected' && (
								<Box flexDirection="column">
									<Text color="green">
										✓ Connected as {status.user.name} (@{status.user.username})
									</Text>
									{status.user.email && <Text dimColor>{status.user.email}</Text>}
									{status.user.webUrl && <Text dimColor>{status.user.webUrl}</Text>}
								</Box>
							)}
							{status.state === 'error' && <Text color="red">✗ {status.message}</Text>}
						</Box>
					</Box>
				</>
			) : (
				<Box marginBottom={1}>
					<Text dimColor>Enable the plugin to check the GitLab connection.</Text>
				</Box>
			)}

			<Box marginTop={2} flexDirection="column">
				<Text dimColor>
					Create a Personal Access Token (scope: <Text color="cyan">api</Text> or{' '}
					<Text color="cyan">read_api</Text>) at {baseUrl}/-/user_settings/personal_access_tokens
				</Text>
				<Text dimColor>
					For self-hosted instances, set <Text color="cyan">{GITLAB_URL_ENV_VAR}</Text> to your instance
					URL.
				</Text>
				<Text dimColor>
					Press <Text color="cyan">Enter</Text> or <Text color="cyan">Space</Text> to toggle
				</Text>
				{canGoBack && (
					<Text dimColor>
						Press <Text color="cyan">ESC</Text> to go back
					</Text>
				)}
			</Box>
		</Box>
	);
}

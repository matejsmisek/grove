import React, { useEffect, useState } from 'react';

import { Box, Text, useInput } from 'ink';

import { useService } from '../di/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import { ASANA_PLUGIN_ID, ASANA_TOKEN_ENV_VAR, AsanaPlugin } from '../plugins/asana/index.js';
import type { AsanaUser } from '../plugins/asana/index.js';
import { PluginRegistryToken } from '../services/tokens.js';

type ConnectionStatus =
	| { state: 'no-token' }
	| { state: 'checking' }
	| { state: 'connected'; user: AsanaUser }
	| { state: 'error'; message: string };

export function AsanaSettingsScreen() {
	const { goBack, canGoBack } = useNavigation();
	const pluginRegistry = useService(PluginRegistryToken);

	// Resolve the Asana plugin from the registry
	const plugin = pluginRegistry.get(ASANA_PLUGIN_ID) as AsanaPlugin | undefined;

	const [enabled, setEnabled] = useState(pluginRegistry.isEnabled(ASANA_PLUGIN_ID));
	const [isToggling, setIsToggling] = useState(false);
	const [toggleError, setToggleError] = useState<string | null>(null);
	const [status, setStatus] = useState<ConnectionStatus>({ state: 'checking' });

	const token = plugin?.getAccessToken();
	const tokenFromEnv = !!process.env[ASANA_TOKEN_ENV_VAR];

	useEffect(() => {
		let cancelled = false;

		// Only probe the connection while the plugin is enabled
		if (!enabled) {
			return;
		}

		if (!plugin || !token) {
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
					await pluginRegistry.disable(ASANA_PLUGIN_ID);
				} else {
					await pluginRegistry.enable(ASANA_PLUGIN_ID);
				}
			} catch (error: unknown) {
				setToggleError(error instanceof Error ? error.message : 'Failed to update plugin');
			} finally {
				// Reflect the persisted state, even if initialization failed
				setEnabled(pluginRegistry.isEnabled(ASANA_PLUGIN_ID));
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
					Asana Integration
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text dimColor>
					Authenticated via the <Text color="cyan">{ASANA_TOKEN_ENV_VAR}</Text> environment variable.
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
							<Text>Token: </Text>
							{token ? (
								<>
									<Text color="cyan">{maskToken(token)}</Text>
									<Text dimColor> {tokenFromEnv ? `(from ${ASANA_TOKEN_ENV_VAR})` : '(from settings)'}</Text>
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
									No token found. Set {ASANA_TOKEN_ENV_VAR} to enable the Asana integration.
								</Text>
							)}
							{status.state === 'checking' && <Text color="yellow">Checking connection…</Text>}
							{status.state === 'connected' && (
								<Box flexDirection="column">
									<Text color="green">✓ Connected as {status.user.name}</Text>
									{status.user.email && <Text dimColor>{status.user.email}</Text>}
								</Box>
							)}
							{status.state === 'error' && <Text color="red">✗ {status.message}</Text>}
						</Box>
					</Box>
				</>
			) : (
				<Box marginBottom={1}>
					<Text dimColor>Enable the plugin to check the Asana connection.</Text>
				</Box>
			)}

			<Box marginTop={2} flexDirection="column">
				<Text dimColor>
					Create a Personal Access Token at https://app.asana.com/0/my-apps and set it via{' '}
					<Text color="cyan">{ASANA_TOKEN_ENV_VAR}</Text>.
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

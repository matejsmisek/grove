import React, { useEffect, useState } from 'react';

import { Box, Text, useInput } from 'ink';

import { useService } from '../di/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import {
	ASANA_TOKEN_ENV_VAR,
	DEFAULT_ASANA_INSTANT_CLAUDE_TEMPLATE,
	buildAsanaTemplateEditorHeader,
	stripAsanaTemplateComments,
} from '../plugins/asana/index.js';
import type { AsanaUser } from '../plugins/asana/index.js';
import { AsanaPluginToken } from '../services/tokens.js';
import { hasExternalEditor, openExternalEditor } from '../utils/externalEditor.js';

type ConnectionStatus =
	| { state: 'no-token' }
	| { state: 'checking' }
	| { state: 'connected'; user: AsanaUser }
	| { state: 'error'; message: string };

export function AsanaSettingsScreen() {
	const { goBack, canGoBack } = useNavigation();
	const plugin = useService(AsanaPluginToken);

	const [enabled, setEnabled] = useState(plugin.isEnabled());
	const [isToggling, setIsToggling] = useState(false);
	const [toggleError, setToggleError] = useState<string | null>(null);
	const [status, setStatus] = useState<ConnectionStatus>({ state: 'checking' });
	const [template, setTemplate] = useState<string | undefined>(
		() => plugin.getSettings().instantClaudeTemplate
	);
	const [templateMessage, setTemplateMessage] = useState<string | null>(null);

	const token = plugin.getAccessToken();
	const tokenFromEnv = !!process.env[ASANA_TOKEN_ENV_VAR];
	const editorAvailable = hasExternalEditor();

	// Persist the instant-Claude template both to settings (durable) and to the live
	// plugin instance (so the next launch picks it up without a restart).
	const persistTemplate = (value: string | undefined) => {
		plugin.updatePluginSettings({ instantClaudeTemplate: value });
		plugin.configure({ instantClaudeTemplate: value });
		setTemplate(value);
	};

	const handleEditTemplate = () => {
		const body = template && template.trim() ? template : DEFAULT_ASANA_INSTANT_CLAUDE_TEMPLATE;
		const edited = openExternalEditor(buildAsanaTemplateEditorHeader() + body, {
			extension: '.md',
			prefix: 'grove-asana-template-',
		});
		if (edited === null) {
			return;
		}
		const cleaned = stripAsanaTemplateComments(edited).trim();
		if (cleaned) {
			persistTemplate(cleaned);
			setTemplateMessage('Template saved');
		} else {
			persistTemplate(undefined);
			setTemplateMessage('Template reset to default');
		}
		setTimeout(() => setTemplateMessage(null), 2000);
	};

	const handleResetTemplate = () => {
		persistTemplate(undefined);
		setTemplateMessage('Template reset to default');
		setTimeout(() => setTemplateMessage(null), 2000);
	};

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
		} else if (input === 'e' && editorAvailable) {
			handleEditTemplate();
		} else if (input === 'r') {
			handleResetTemplate();
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

	const isCustomTemplate = !!(template && template.trim());
	const effectiveTemplate = isCustomTemplate ? template! : DEFAULT_ASANA_INSTANT_CLAUDE_TEMPLATE;
	const templatePreviewLines = effectiveTemplate.split('\n').slice(0, 8);

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

			<Box marginTop={1} flexDirection="column">
				<Text bold>Instant Claude template</Text>
				<Box flexDirection="column" marginTop={1} marginBottom={1}>
					<Text dimColor>
						Seeds the prompt for the &quot;Launch instant Claude from Asana&quot; worktree action,
						rendered from the linked task before it opens in your editor.
					</Text>
					<Text dimColor>The available variables are documented as comments when you edit it.</Text>
				</Box>

				{templateMessage && (
					<Box marginBottom={1}>
						<Text color="green">{templateMessage}</Text>
					</Box>
				)}

				<Box flexDirection="column" marginBottom={1}>
					<Text>
						Current: {isCustomTemplate ? <Text color="cyan">custom</Text> : <Text dimColor>default</Text>}
					</Text>
					<Box flexDirection="column" borderStyle="single" paddingX={1}>
						{templatePreviewLines.map((line, index) => (
							<Text key={index}>{line || ' '}</Text>
						))}
					</Box>
				</Box>

				{!editorAvailable && (
					<Box marginBottom={1}>
						<Text color="yellow">No editor found. Set the $EDITOR environment variable to edit.</Text>
					</Box>
				)}
			</Box>

			<Box marginTop={1} flexDirection="column">
				<Text dimColor>
					Create a Personal Access Token at https://app.asana.com/0/my-apps and set it via{' '}
					<Text color="cyan">{ASANA_TOKEN_ENV_VAR}</Text>.
				</Text>
				<Text dimColor>
					Press <Text color="cyan">Enter</Text> or <Text color="cyan">Space</Text> to toggle
				</Text>
				{editorAvailable && (
					<Text dimColor>
						Press <Text color="cyan">e</Text> to edit template, <Text color="cyan">r</Text> to reset to
						default
					</Text>
				)}
				{canGoBack && (
					<Text dimColor>
						Press <Text color="cyan">ESC</Text> to go back
					</Text>
				)}
			</Box>
		</Box>
	);
}

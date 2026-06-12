import React, { useState } from 'react';

import { Box, Text, useInput } from 'ink';

import { useService } from '../di/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import { ASANA_PLUGIN_ID } from '../plugins/asana/index.js';
import { GITLAB_PLUGIN_ID } from '../plugins/gitlab/index.js';
import { AsanaPluginToken, GitLabPluginToken } from '../services/tokens.js';

interface PluginSettingsScreenProps {
	selectedPluginId?: string;
}

export function PluginSettingsScreen({ selectedPluginId }: PluginSettingsScreenProps) {
	const { navigate, replace, goBack, canGoBack } = useNavigation();
	const asanaPlugin = useService(AsanaPluginToken);
	const gitlabPlugin = useService(GitLabPluginToken);

	const plugins = [asanaPlugin, gitlabPlugin];

	// Restore the selection when returning from a plugin's settings screen
	const initialIndex = selectedPluginId
		? Math.max(
				0,
				plugins.findIndex((plugin) => plugin.metadata.id === selectedPluginId)
			)
		: 0;
	const [selectedIndex, setSelectedIndex] = useState(initialIndex);

	// Map each plugin to the screen that hosts its settings (including the on/off toggle)
	const settingsNavigators: Record<string, () => void> = {
		[GITLAB_PLUGIN_ID]: () => navigate('gitlabSettings', {}),
		[ASANA_PLUGIN_ID]: () => navigate('asanaSettings', {}),
	};

	// Get current enabled states
	const pluginStates = plugins.map((plugin) => ({
		plugin,
		enabled: plugin.isEnabled(),
	}));

	useInput((_input, key) => {
		if (key.escape && canGoBack) {
			goBack();
		} else if (key.upArrow) {
			setSelectedIndex((prev) => (prev > 0 ? prev - 1 : plugins.length - 1));
		} else if (key.downArrow) {
			setSelectedIndex((prev) => (prev < plugins.length - 1 ? prev + 1 : 0));
		} else if (key.return && plugins.length > 0) {
			// Open the selected plugin's settings (where it can be enabled/disabled).
			// Stamp the selection into our own params first so goBack() restores it.
			const selectedPlugin = plugins[selectedIndex];
			replace('pluginSettings', { selectedPluginId: selectedPlugin.metadata.id });
			settingsNavigators[selectedPlugin.metadata.id]?.();
		}
	});

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="yellow">
					Plugins
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text dimColor>Select a plugin to open its settings:</Text>
			</Box>

			{plugins.length === 0 ? (
				<Box marginTop={1}>
					<Text dimColor>No plugins available.</Text>
				</Box>
			) : (
				<Box flexDirection="column" marginTop={1}>
					{pluginStates.map(({ plugin, enabled }, index) => {
						const isSelected = index === selectedIndex;
						const { metadata } = plugin;

						return (
							<Box key={metadata.id} flexDirection="column" marginBottom={1}>
								<Box>
									<Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
										{isSelected ? '> ' : '  '}
									</Text>
									<Text color={enabled ? 'green' : 'gray'}>[{enabled ? 'x' : ' '}]</Text>
									<Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
										{' '}
										{metadata.name}
									</Text>
									<Text dimColor> v{metadata.version}</Text>
								</Box>
								{isSelected && (
									<Box marginLeft={6}>
										<Text dimColor>{metadata.description}</Text>
									</Box>
								)}
							</Box>
						);
					})}
				</Box>
			)}

			<Box marginTop={2} flexDirection="column">
				<Text dimColor>
					Use <Text color="cyan">arrows</Text> to select, <Text color="cyan">Enter</Text> to open
					settings
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

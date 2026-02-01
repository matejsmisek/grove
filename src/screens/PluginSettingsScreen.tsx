import React, { useState } from 'react';

import { Box, Text, useInput } from 'ink';

import { useService } from '../di/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import { PluginRegistryToken } from '../services/tokens.js';

export function PluginSettingsScreen() {
	const { goBack, canGoBack } = useNavigation();
	const pluginRegistry = useService(PluginRegistryToken);

	const plugins = pluginRegistry.getAll();
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [isToggling, setIsToggling] = useState(false);
	const [refreshKey, setRefreshKey] = useState(0);

	// Get current enabled states
	const pluginStates = plugins.map((plugin) => ({
		plugin,
		enabled: pluginRegistry.isEnabled(plugin.metadata.id),
	}));

	useInput(async (input, key) => {
		if (key.escape && canGoBack) {
			goBack();
		} else if (key.upArrow && !isToggling) {
			setSelectedIndex((prev) => (prev > 0 ? prev - 1 : plugins.length - 1));
		} else if (key.downArrow && !isToggling) {
			setSelectedIndex((prev) => (prev < plugins.length - 1 ? prev + 1 : 0));
		} else if ((key.return || input === ' ') && plugins.length > 0 && !isToggling) {
			// Toggle selected plugin
			const selectedPlugin = plugins[selectedIndex];
			const isEnabled = pluginRegistry.isEnabled(selectedPlugin.metadata.id);

			setIsToggling(true);
			try {
				if (isEnabled) {
					await pluginRegistry.disable(selectedPlugin.metadata.id);
				} else {
					await pluginRegistry.enable(selectedPlugin.metadata.id);
				}
				// Force re-render to reflect new state
				setRefreshKey((prev) => prev + 1);
			} finally {
				setIsToggling(false);
			}
		}
	});

	return (
		<Box flexDirection="column" padding={1} key={refreshKey}>
			<Box marginBottom={1}>
				<Text bold color="yellow">
					Plugins
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text dimColor>Enable or disable Grove plugins:</Text>
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
					Use <Text color="cyan">arrows</Text> to select, <Text color="cyan">Enter</Text> or{' '}
					<Text color="cyan">Space</Text> to toggle
				</Text>
				{canGoBack && (
					<Text dimColor>
						Press <Text color="cyan">ESC</Text> to go back
					</Text>
				)}
			</Box>

			{isToggling && (
				<Box marginTop={1}>
					<Text color="yellow">Saving...</Text>
				</Box>
			)}
		</Box>
	);
}

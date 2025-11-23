import React from 'react';

import { Box, Text, useInput } from 'ink';

import { useNavigation } from '../navigation/useNavigation.js';

interface SettingsScreenProps {
	section?: string;
}

export function SettingsScreen({ section }: SettingsScreenProps) {
	const { goBack, canGoBack } = useNavigation();

	useInput((_input, key) => {
		if (key.escape && canGoBack) {
			goBack();
		}
	});

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="yellow">
					⚙️ Settings
				</Text>
			</Box>

			{section && (
				<Box marginBottom={1}>
					<Text>
						Section: <Text color="cyan">{section}</Text>
					</Text>
				</Box>
			)}

			<Box flexDirection="column" marginTop={1}>
				<Text dimColor>Available Settings:</Text>
				<Box marginLeft={2} flexDirection="column" marginTop={1}>
					<Text>• AI Provider Configuration</Text>
					<Text>• Git Default Branch</Text>
					<Text>• Display Preferences</Text>
					<Text>• Keyboard Shortcuts</Text>
				</Box>
			</Box>

			{canGoBack && (
				<Box marginTop={2}>
					<Text dimColor>
						Press <Text color="cyan">ESC</Text> to go back
					</Text>
				</Box>
			)}
		</Box>
	);
}

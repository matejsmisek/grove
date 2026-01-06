import React, { useState } from 'react';

import { Box, Text, useInput } from 'ink';

import TextInput from 'ink-text-input';

import { useService } from '../di/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import { SettingsServiceToken } from '../services/tokens.js';

export function WorkingFolderScreen() {
	const { goBack, canGoBack } = useNavigation();
	const settingsService = useService(SettingsServiceToken);
	const [settings] = useState(() => settingsService.readSettings());
	const [value, setValue] = useState(settings.workingFolder);
	const [isSaved, setIsSaved] = useState(false);

	useInput((_input, key) => {
		if (key.escape && canGoBack) {
			goBack();
		}
	});

	const handleSubmit = () => {
		settingsService.updateSettings({ workingFolder: value });
		setIsSaved(true);
		// Show saved message briefly then go back
		setTimeout(() => {
			goBack();
		}, 500);
	};

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="yellow">
					📁 Working Folder
				</Text>
			</Box>

			<Box flexDirection="column" marginBottom={1}>
				<Text dimColor>This is where Grove will create and manage git worktrees.</Text>
			</Box>

			<Box flexDirection="column" marginTop={1}>
				<Box marginBottom={1}>
					<Text>
						Current: <Text color="cyan">{settings.workingFolder}</Text>
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text dimColor>Edit path:</Text>
				</Box>

				<Box borderStyle="single" borderColor="blue" paddingX={1} marginBottom={1}>
					<Text color="blue" bold>
						→{' '}
					</Text>
					<TextInput
						value={value}
						onChange={setValue}
						onSubmit={handleSubmit}
						placeholder="Enter working folder path..."
					/>
				</Box>

				{isSaved && (
					<Box marginTop={1}>
						<Text color="green">✓ Saved successfully!</Text>
					</Box>
				)}
			</Box>

			<Box marginTop={2} flexDirection="column">
				<Text dimColor>
					Press <Text color="cyan">Enter</Text> to save
				</Text>
				{canGoBack && (
					<Text dimColor>
						Press <Text color="cyan">ESC</Text> to cancel
					</Text>
				)}
			</Box>
		</Box>
	);
}

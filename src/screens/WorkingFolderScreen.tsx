import React, { useState } from 'react';

import { Box, Text, useInput } from 'ink';

import { DirenvWhitelistPrompt } from '../components/DirenvWhitelistPrompt.js';
import TextInput from '../components/GroveTextInput.js';
import { useService } from '../di/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import { SettingsServiceToken } from '../services/tokens.js';

export function WorkingFolderScreen() {
	const { goBack, canGoBack } = useNavigation();
	const settingsService = useService(SettingsServiceToken);
	const [settings] = useState(() => settingsService.readSettings());
	const [value, setValue] = useState(settings.workingFolder);
	const [isSaved, setIsSaved] = useState(false);
	// While the direnv prompt is shown, it owns keyboard input (incl. Escape).
	const [phase, setPhase] = useState<'editing' | 'direnv'>('editing');

	useInput(
		(_input, key) => {
			if (key.escape && canGoBack) {
				goBack();
			}
		},
		{ isActive: phase === 'editing' }
	);

	const handleSubmit = () => {
		settingsService.updateSettings({ workingFolder: value });
		setIsSaved(true);
		// Offer the new folder to direnv before leaving; the prompt returns
		// immediately (via onComplete) when direnv is unavailable or already trusts it.
		setPhase('direnv');
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

				{phase === 'editing' ? (
					<>
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
					</>
				) : (
					<>
						{isSaved && (
							<Box marginBottom={1}>
								<Text color="green">✓ Saved successfully!</Text>
							</Box>
						)}
						<DirenvWhitelistPrompt
							folder={value}
							previousFolder={settings.workingFolder}
							onComplete={goBack}
						/>
					</>
				)}
			</Box>

			{phase === 'editing' && (
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
			)}
		</Box>
	);
}

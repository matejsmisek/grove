import React, { useState } from 'react';

import { Box, Text, useInput } from 'ink';

import { useMouse } from '@ink-tools/ink-mouse';

import { useService } from '../di/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import { SettingsServiceToken } from '../services/tokens.js';

/**
 * Interface settings. Currently exposes the global "Mouse control" toggle,
 * which lets users click grove tiles to navigate. This is a global-only
 * setting (stored in ~/.grove/settings.json) and cannot be overridden per
 * workspace.
 */
export function InterfaceSettingsScreen() {
	const { goBack, canGoBack } = useNavigation();
	const settingsService = useService(SettingsServiceToken);
	const mouse = useMouse();

	const [mouseEnabled, setMouseEnabled] = useState(() => settingsService.getMouseControlEnabled());
	const [savedMessage, setSavedMessage] = useState<string | null>(null);

	const toggleMouseControl = () => {
		const next = !mouseEnabled;
		settingsService.setMouseControlEnabled(next);
		setMouseEnabled(next);

		// Apply immediately so the change takes effect without a restart.
		if (next) {
			mouse.enable();
		} else {
			mouse.disable();
		}

		setSavedMessage(next ? 'Mouse control enabled' : 'Mouse control disabled');
		setTimeout(() => setSavedMessage(null), 2000);
	};

	useInput((input, key) => {
		if (key.escape && canGoBack) {
			goBack();
		} else if (key.return || input === ' ') {
			toggleMouseControl();
		}
	});

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="yellow">
					🖱️ Interface
				</Text>
			</Box>

			<Box flexDirection="column" marginTop={1}>
				<Text dimColor>Configure how you interact with Grove:</Text>
				<Box marginLeft={2} marginTop={1}>
					<Text color="cyan" bold>
						❯{' '}
					</Text>
					<Text color={mouseEnabled ? 'green' : 'gray'}>[{mouseEnabled ? 'x' : ' '}]</Text>
					<Text> Mouse control</Text>
				</Box>
				<Box marginLeft={6} marginTop={0}>
					<Text dimColor>Click grove tiles to open them. Applies to all workspaces.</Text>
				</Box>
			</Box>

			{savedMessage && (
				<Box marginTop={1}>
					<Text color="green">{savedMessage}</Text>
				</Box>
			)}

			<Box marginTop={2} flexDirection="column">
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

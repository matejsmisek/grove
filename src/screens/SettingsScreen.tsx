import React, { useState } from 'react';

import { Box, Text, useInput } from 'ink';

import { useNavigation } from '../navigation/useNavigation.js';

interface SettingsScreenProps {
	section?: string;
}

type SettingOption = {
	label: string;
	action: () => void;
};

export function SettingsScreen({ section }: SettingsScreenProps) {
	const { navigate, goBack, canGoBack } = useNavigation();
	const [selectedIndex, setSelectedIndex] = useState(0);

	const options: SettingOption[] = [
		{
			label: 'Registered Repositories',
			action: () => navigate('repositories', {}),
		},
		{
			label: 'Working Folder',
			action: () => navigate('workingFolder', {}),
		},
		{
			label: 'AI Provider Configuration (coming soon)',
			action: () => {}, // Placeholder
		},
		{
			label: 'Display Preferences (coming soon)',
			action: () => {}, // Placeholder
		},
	];

	useInput((input, key) => {
		if (key.escape && canGoBack) {
			goBack();
		} else if (key.upArrow) {
			setSelectedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
		} else if (key.downArrow) {
			setSelectedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
		} else if (key.return) {
			options[selectedIndex].action();
		} else if (input >= '1' && input <= String(options.length)) {
			const index = parseInt(input) - 1;
			if (index >= 0 && index < options.length) {
				options[index].action();
			}
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
				<Text dimColor>Configure Grove:</Text>
				<Box marginLeft={2} flexDirection="column" marginTop={1}>
					{options.map((option, index) => {
						const isSelected = index === selectedIndex;
						return (
							<Box key={index}>
								<Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
									{isSelected ? '❯ ' : '  '}
									{index + 1}. {option.label}
								</Text>
							</Box>
						);
					})}
				</Box>
			</Box>

			<Box marginTop={2} flexDirection="column">
				<Text dimColor>
					Use <Text color="cyan">↑/↓</Text> arrows to select, <Text color="cyan">Enter</Text> to confirm
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

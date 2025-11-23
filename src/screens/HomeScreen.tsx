import React, { useState } from 'react';

import { Box, Text, useApp, useInput } from 'ink';

import { useNavigation } from '../navigation/useNavigation.js';

type MenuOption = {
	label: string;
	action: () => void;
};

export function HomeScreen() {
	const { navigate } = useNavigation();
	const { exit } = useApp();
	const [selectedIndex, setSelectedIndex] = useState(0);

	const options: MenuOption[] = [
		{
			label: 'Start Chat',
			action: () => navigate('chat', {}),
		},
		{
			label: 'Settings',
			action: () => navigate('settings', {}),
		},
		{
			label: 'Quit',
			action: () => exit(),
		},
	];

	useInput((input, key) => {
		if (key.upArrow) {
			setSelectedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
		} else if (key.downArrow) {
			setSelectedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
		} else if (key.return) {
			options[selectedIndex].action();
		} else if (input >= '1' && input <= '3') {
			const index = parseInt(input) - 1;
			if (index >= 0 && index < options.length) {
				options[index].action();
			}
		}
	});

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="green">
					🌳 Welcome to Grove
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text>AI-powered Git management at your fingertips.</Text>
			</Box>

			<Box flexDirection="column" marginTop={1}>
				<Text dimColor>Quick Actions:</Text>
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
				<Text dimColor>Navigation:</Text>
				<Box marginLeft={2} flexDirection="column">
					<Text dimColor>• Use ↑/↓ arrows to select, Enter to confirm</Text>
					<Text dimColor>• Or press 1-3 to navigate directly</Text>
				</Box>
			</Box>
		</Box>
	);
}

import React, { useState } from 'react';

import { Box, Text, useApp, useInput } from 'ink';

import { useNavigation } from '../navigation/useNavigation.js';
import { getAllGroves, initializeStorage } from '../storage/index.js';
import type { GroveReference } from '../storage/index.js';

type MenuOption = {
	label: string;
	action: () => void;
	type: 'grove' | 'action';
	grove?: GroveReference;
};

export function HomeScreen() {
	const { navigate } = useNavigation();
	const { exit } = useApp();
	const [selectedIndex, setSelectedIndex] = useState(0);

	// Initialize storage and get groves
	initializeStorage();
	const groves = getAllGroves();

	// Build menu options
	const options: MenuOption[] = [
		// Grove entries
		...groves.map(
			(grove): MenuOption => ({
				label: `📁 ${grove.name}`,
				action: () => {
					// TODO: Navigate to grove detail screen
					// For now, just show a placeholder
				},
				type: 'grove',
				grove,
			}),
		),
		// Action options
		{
			label: '+ Create New Grove',
			action: () => navigate('createGrove', {}),
			type: 'action',
		},
		{
			label: 'Settings',
			action: () => navigate('settings', {}),
			type: 'action',
		},
		{
			label: 'Quit',
			action: () => exit(),
			type: 'action',
		},
	];

	useInput((input, key) => {
		if (key.upArrow) {
			setSelectedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
		} else if (key.downArrow) {
			setSelectedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
		} else if (key.return) {
			options[selectedIndex].action();
		}
	});

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="green">
					🌳 Grove
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text>AI-powered Git worktree management</Text>
			</Box>

			{groves.length > 0 && (
				<Box flexDirection="column" marginTop={1} marginBottom={1}>
					<Text dimColor>Active Groves:</Text>
				</Box>
			)}

			{groves.length === 0 && (
				<Box marginTop={1} marginBottom={1}>
					<Text dimColor>No active groves. Create one to get started!</Text>
				</Box>
			)}

			<Box flexDirection="column">
				<Box marginLeft={2} flexDirection="column">
					{options.map((option, index) => {
						const isSelected = index === selectedIndex;
						const isGrove = option.type === 'grove';

						return (
							<Box key={index} marginBottom={isGrove && index === groves.length - 1 ? 1 : 0}>
								<Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
									{isSelected ? '❯ ' : '  '}
									{option.label}
									{isGrove && option.grove && (
										<Text dimColor> ({new Date(option.grove.updatedAt).toLocaleDateString()})</Text>
									)}
								</Text>
							</Box>
						);
					})}
				</Box>
			</Box>

			<Box marginTop={2} flexDirection="column">
				<Text dimColor>Navigation:</Text>
				<Box marginLeft={2} flexDirection="column">
					<Text dimColor>• Use ↑/↓ arrows to select</Text>
					<Text dimColor>• Press Enter to select</Text>
				</Box>
			</Box>
		</Box>
	);
}

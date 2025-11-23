import React, { useState } from 'react';

import { Box, Text, useApp, useInput } from 'ink';

import { useNavigation } from '../navigation/useNavigation.js';
import { getAllGroves, initializeStorage, readGroveMetadata } from '../storage/index.js';
import type { GroveReference } from '../storage/index.js';
import { formatTimeAgo } from '../utils/time.js';

type MenuOption = {
	label: string;
	action: () => void;
};

type GroveAction = {
	label: string;
	action: () => void;
};

export function HomeScreen() {
	const { navigate } = useNavigation();
	const { exit } = useApp();
	const [selectedGroveIndex, setSelectedGroveIndex] = useState(0);
	const [showMenu, setShowMenu] = useState(false);
	const [selectedMenuIndex, setSelectedMenuIndex] = useState(0);
	const [selectedGrove, setSelectedGrove] = useState<GroveReference | null>(null);
	const [selectedGroveActionIndex, setSelectedGroveActionIndex] = useState(0);

	// Initialize storage and get groves
	initializeStorage();
	const groves = getAllGroves();

	// Menu options
	const menuOptions: MenuOption[] = [
		{ label: 'Settings', action: () => navigate('settings', {}) },
		{ label: 'Quit', action: () => exit() },
	];

	// Grove action menu (when a grove is selected)
	const groveActions: GroveAction[] = selectedGrove
		? [
				{
					label: 'Open in Chat',
					action: () => {
						// TODO: Implement open in chat
						navigate('chat', {});
						setSelectedGrove(null);
					},
				},
				{
					label: 'Close Grove',
					action: () => {
						navigate('closeGrove', { groveId: selectedGrove.id });
						setSelectedGrove(null);
					},
				},
				{
					label: '← Go Back',
					action: () => {
						setSelectedGrove(null);
					},
				},
			]
		: [];

	useInput((input, key) => {
		if (selectedGrove) {
			// Grove action menu navigation
			if (key.upArrow) {
				setSelectedGroveActionIndex((prev) => (prev > 0 ? prev - 1 : groveActions.length - 1));
			} else if (key.downArrow) {
				setSelectedGroveActionIndex((prev) => (prev < groveActions.length - 1 ? prev + 1 : 0));
			} else if (key.return) {
				groveActions[selectedGroveActionIndex].action();
			} else if (key.escape) {
				setSelectedGrove(null);
			}
		} else if (showMenu) {
			// Menu navigation
			if (key.upArrow) {
				setSelectedMenuIndex((prev) => (prev > 0 ? prev - 1 : menuOptions.length - 1));
			} else if (key.downArrow) {
				setSelectedMenuIndex((prev) => (prev < menuOptions.length - 1 ? prev + 1 : 0));
			} else if (key.return) {
				menuOptions[selectedMenuIndex].action();
				setShowMenu(false);
			} else if (key.escape || input === 'm') {
				setShowMenu(false);
			}
		} else {
			// Main screen navigation
			if (groves.length > 0) {
				if (key.leftArrow) {
					setSelectedGroveIndex((prev) => (prev > 0 ? prev - 1 : groves.length - 1));
				} else if (key.rightArrow) {
					setSelectedGroveIndex((prev) => (prev < groves.length - 1 ? prev + 1 : 0));
				} else if (key.upArrow) {
					setSelectedGroveIndex((prev) => {
						const newIndex = prev - 4;
						return newIndex >= 0 ? newIndex : prev;
					});
				} else if (key.downArrow) {
					setSelectedGroveIndex((prev) => {
						const newIndex = prev + 4;
						return newIndex < groves.length ? newIndex : prev;
					});
				} else if (key.return) {
					// Show grove action menu for the selected grove
					setSelectedGrove(groves[selectedGroveIndex]);
					setSelectedGroveActionIndex(0);
				}
			}

			if (input === 'c' || input === '+') {
				navigate('createGrove', {});
			} else if (input === 'm') {
				setShowMenu(true);
				setSelectedMenuIndex(0);
			}
		}
	});

	return (
		<Box flexDirection="column" padding={1}>
			{/* Header */}
			<Box marginBottom={1}>
				<Text bold color="green">
					🌳 Grove
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text dimColor>AI-powered Git worktree management</Text>
			</Box>

			{/* Groves Grid */}
			{groves.length > 0 ? (
				<Box flexDirection="column" marginTop={1}>
					<Box marginBottom={1}>
						<Text bold>Your Groves</Text>
					</Box>

					{/* Display groves in a grid (4 columns) */}
					<Box flexDirection="column">
						{Array.from({ length: Math.ceil(groves.length / 4) }).map((_, rowIndex) => {
							const grove1 = groves[rowIndex * 4];
							const grove2 = groves[rowIndex * 4 + 1];
							const grove3 = groves[rowIndex * 4 + 2];
							const grove4 = groves[rowIndex * 4 + 3];

							return (
								<Box key={rowIndex} marginBottom={1}>
									{grove1 && <GrovePanel grove={grove1} isSelected={selectedGroveIndex === rowIndex * 4} />}
									{grove2 && (
										<Box marginLeft={1}>
											<GrovePanel grove={grove2} isSelected={selectedGroveIndex === rowIndex * 4 + 1} />
										</Box>
									)}
									{grove3 && (
										<Box marginLeft={1}>
											<GrovePanel grove={grove3} isSelected={selectedGroveIndex === rowIndex * 4 + 2} />
										</Box>
									)}
									{grove4 && (
										<Box marginLeft={1}>
											<GrovePanel grove={grove4} isSelected={selectedGroveIndex === rowIndex * 4 + 3} />
										</Box>
									)}
								</Box>
							);
						})}
					</Box>
				</Box>
			) : (
				<Box marginTop={1} marginBottom={1}>
					<Text dimColor>No active groves. Press 'c' to create one!</Text>
				</Box>
			)}

			{/* Help text */}
			<Box marginTop={1} flexDirection="column">
				<Text dimColor>
					{groves.length > 0 ? '↑↓←→ Navigate' : ''} {groves.length > 0 && '• '}
					<Text bold>c</Text> Create {groves.length > 0 && '• Enter Open'} • <Text bold>m</Text> Menu
				</Text>
			</Box>

			{/* Menu Modal */}
			{showMenu && (
				<Box
					position="absolute"
					borderStyle="round"
					borderColor="cyan"
					padding={1}
					flexDirection="column"
				>
					<Box marginBottom={1}>
						<Text bold>Menu</Text>
					</Box>

					{menuOptions.map((option, index) => (
						<Box key={index}>
							<Text color={selectedMenuIndex === index ? 'cyan' : undefined}>
								{selectedMenuIndex === index ? '❯ ' : '  '}
								{option.label}
							</Text>
						</Box>
					))}

					<Box marginTop={1}>
						<Text dimColor>Press ESC to close</Text>
					</Box>
				</Box>
			)}

			{/* Grove Actions Modal */}
			{selectedGrove && (
				<Box
					position="absolute"
					borderStyle="round"
					borderColor="cyan"
					padding={1}
					flexDirection="column"
				>
					<Box marginBottom={1}>
						<Text bold>Grove: {selectedGrove.name}</Text>
					</Box>

					{groveActions.map((action, index) => (
						<Box key={index}>
							<Text color={selectedGroveActionIndex === index ? 'cyan' : undefined}>
								{selectedGroveActionIndex === index ? '❯ ' : '  '}
								{action.label}
							</Text>
						</Box>
					))}

					<Box marginTop={1}>
						<Text dimColor>Press ESC to close</Text>
					</Box>
				</Box>
			)}
		</Box>
	);
}

// Grove panel component
function GrovePanel({ grove, isSelected }: { grove: GroveReference; isSelected: boolean }) {
	// Get grove metadata to count worktrees
	let worktreeCount = 0;
	try {
		const metadata = readGroveMetadata(grove.path);
		if (metadata) {
			worktreeCount = metadata.worktrees.length;
		}
	} catch {
		// If we can't read metadata, just show 0
	}

	return (
		<Box
			borderStyle="round"
			borderColor={isSelected ? 'cyan' : 'gray'}
			paddingX={1}
			paddingY={1}
			width={24}
			flexDirection="column"
		>
			{/* Grove name */}
			<Box>
				<Text bold color={isSelected ? 'cyan' : 'white'}>
					{grove.name}
				</Text>
			</Box>

			{/* Time ago */}
			<Box marginTop={1}>
				<Text dimColor>Created {formatTimeAgo(grove.createdAt)}</Text>
			</Box>

			{/* Worktree count */}
			<Box marginTop={1}>
				<Text color="green">
					{worktreeCount} worktree{worktreeCount !== 1 ? 's' : ''}
				</Text>
			</Box>
		</Box>
	);
}

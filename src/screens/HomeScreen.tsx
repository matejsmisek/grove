import React, { useState } from 'react';

import { Box, Text, useApp, useInput } from 'ink';

import { useNavigation } from '../navigation/useNavigation.js';
import { getAllGroves, initializeStorage, readGroveMetadata } from '../storage/index.js';
import type { GroveReference } from '../storage/index.js';
import { formatTimeAgo } from '../utils/time.js';

export function HomeScreen() {
	const { navigate } = useNavigation();
	const { exit } = useApp();
	const [selectedGroveIndex, setSelectedGroveIndex] = useState(0);
	const [showMenu, setShowMenu] = useState(false);
	const [selectedMenuIndex, setSelectedMenuIndex] = useState(0);

	// Initialize storage and get groves
	initializeStorage();
	const groves = getAllGroves();

	// Menu options
	const menuOptions = [
		{ label: 'Settings', action: () => navigate('settings', {}) },
		{ label: 'Quit', action: () => exit() },
	];

	useInput((input, key) => {
		if (showMenu) {
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
				if (key.leftArrow || key.upArrow) {
					setSelectedGroveIndex((prev) => (prev > 0 ? prev - 1 : groves.length - 1));
				} else if (key.rightArrow || key.downArrow) {
					setSelectedGroveIndex((prev) => (prev < groves.length - 1 ? prev + 1 : 0));
				} else if (key.return) {
					// TODO: Navigate to grove detail screen
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

					{/* Display groves in a grid (2 columns) */}
					<Box flexDirection="column">
						{Array.from({ length: Math.ceil(groves.length / 2) }).map((_, rowIndex) => {
							const grove1 = groves[rowIndex * 2];
							const grove2 = groves[rowIndex * 2 + 1];
							const index1 = rowIndex * 2;
							const index2 = rowIndex * 2 + 1;

							return (
								<Box key={rowIndex} marginBottom={1}>
									{grove1 && <GrovePanel grove={grove1} isSelected={selectedGroveIndex === index1} />}
									{grove2 && (
										<Box marginLeft={2}>
											<GrovePanel grove={grove2} isSelected={selectedGroveIndex === index2} />
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
			paddingX={2}
			paddingY={1}
			width={35}
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

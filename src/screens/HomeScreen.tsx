import React, { useState } from 'react';

import { Box, Text, useApp, useInput } from 'ink';

import { GroveGrid } from '../components/home/GroveGrid.js';
import type { MenuOption } from '../components/home/MenuModal.js';
import { MenuModal } from '../components/home/MenuModal.js';
import { useService } from '../di/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import { GrovesServiceToken } from '../services/tokens.js';

export function HomeScreen() {
	const { navigate } = useNavigation();
	const { exit } = useApp();
	const [selectedGroveIndex, setSelectedGroveIndex] = useState(0);
	const [showMenu, setShowMenu] = useState(false);
	const [selectedMenuIndex, setSelectedMenuIndex] = useState(0);

	// Get workspace-aware groves service
	const grovesService = useService(GrovesServiceToken);
	const groves = grovesService.getAllGroves();

	// Menu options
	const menuOptions: MenuOption[] = [
		{ label: 'Settings', action: () => navigate('settings', {}) },
		{ label: 'Quit', action: () => exit() },
	];

	// Total items in the grid = 1 (create button) + groves.length
	const totalItems = 1 + groves.length;

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
			// Main screen navigation (grid always has at least 1 item - the create button)
			if (key.leftArrow) {
				setSelectedGroveIndex((prev) => (prev > 0 ? prev - 1 : totalItems - 1));
			} else if (key.rightArrow) {
				setSelectedGroveIndex((prev) => (prev < totalItems - 1 ? prev + 1 : 0));
			} else if (key.upArrow) {
				setSelectedGroveIndex((prev) => {
					const newIndex = prev - 4;
					return newIndex >= 0 ? newIndex : prev;
				});
			} else if (key.downArrow) {
				setSelectedGroveIndex((prev) => {
					const newIndex = prev + 4;
					return newIndex < totalItems ? newIndex : prev;
				});
			} else if (key.return) {
				if (selectedGroveIndex === 0) {
					// First item is the "Create Grove" button
					navigate('createGrove', {});
				} else {
					// Navigate to grove detail screen (offset by 1 for create button)
					navigate('groveDetail', { groveId: groves[selectedGroveIndex - 1].id });
				}
			} else if (input === 'm') {
				setShowMenu(true);
				setSelectedMenuIndex(0);
			}
		}
	});

	return (
		<Box flexDirection="column" padding={1}>
			{/* Show Menu Modal */}
			{showMenu ? (
				<MenuModal
					title="Menu"
					options={menuOptions}
					selectedIndex={selectedMenuIndex}
					helpText="Press ESC or 'm' to close"
				/>
			) : (
				/* Show Main Screen */
				<>
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
					<Box flexDirection="column" marginTop={1}>
						<Box marginBottom={1}>
							<Text bold>Your Groves</Text>
						</Box>

						<GroveGrid groves={groves} selectedIndex={selectedGroveIndex} />
					</Box>

					{/* Help text */}
					<Box marginTop={1} flexDirection="column">
						<Text dimColor>
							↑↓←→ Navigate • Enter Select • <Text bold>m</Text> Menu
						</Text>
					</Box>
				</>
			)}
		</Box>
	);
}

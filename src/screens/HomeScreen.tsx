import React, { useState } from 'react';

import { Box, Text, useApp, useInput } from 'ink';

import type { GroveAction } from '../components/home/GroveActionsModal.js';
import { GroveActionsModal } from '../components/home/GroveActionsModal.js';
import { GroveGrid } from '../components/home/GroveGrid.js';
import type { MenuOption } from '../components/home/MenuModal.js';
import { MenuModal } from '../components/home/MenuModal.js';
import { useNavigation } from '../navigation/useNavigation.js';
import { getAllGroves, initializeStorage } from '../storage/index.js';
import type { GroveReference } from '../storage/index.js';

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
			{/* Show Menu Modal */}
			{showMenu ? (
				<MenuModal
					title="Menu"
					options={menuOptions}
					selectedIndex={selectedMenuIndex}
					helpText="Press ESC or 'm' to close"
				/>
			) : selectedGrove ? (
				/* Show Grove Actions Modal */
				<GroveActionsModal
					grove={selectedGrove}
					actions={groveActions}
					selectedIndex={selectedGroveActionIndex}
					helpText="Press ESC to close"
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
					{groves.length > 0 ? (
						<Box flexDirection="column" marginTop={1}>
							<Box marginBottom={1}>
								<Text bold>Your Groves</Text>
							</Box>

							<GroveGrid groves={groves} selectedIndex={selectedGroveIndex} />
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
				</>
			)}
		</Box>
	);
}

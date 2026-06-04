import React, { useState } from 'react';

import { Box, Text, useApp, useInput } from 'ink';

import { GroveGrid } from '../components/home/GroveGrid.js';
import type { MenuOption } from '../components/home/MenuModal.js';
import { MenuModal } from '../components/home/MenuModal.js';
import { useService } from '../di/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import { getContextDisplayName } from '../services/WorkspaceService.js';
import {
	GrovesServiceToken,
	SessionTrackingServiceToken,
	WorkspaceServiceToken,
} from '../services/tokens.js';

interface HomeScreenProps {
	/** Grove to pre-select on mount (e.g. when returning from its detail screen). */
	selectedGroveId?: string;
}

export function HomeScreen({ selectedGroveId }: HomeScreenProps) {
	const { navigate, replace, goBack, canGoBack } = useNavigation();
	const { exit } = useApp();

	// Get workspace-aware groves service
	const grovesService = useService(GrovesServiceToken);
	const groves = grovesService.getAllGroves();

	// Pre-select the requested grove (index is offset by 1 for the create button);
	// fall back to the create button when it's missing or none was requested.
	const [selectedGroveIndex, setSelectedGroveIndex] = useState(() => {
		if (!selectedGroveId) {
			return 0;
		}
		const index = groves.findIndex((grove) => grove.id === selectedGroveId);
		return index >= 0 ? index + 1 : 0;
	});
	const [showMenu, setShowMenu] = useState(false);
	const [selectedMenuIndex, setSelectedMenuIndex] = useState(0);
	// DISABLED: Session fetching temporarily disabled
	const [_isUpdatingSessions, _setIsUpdatingSessions] = useState(false);
	const [sessionRefreshTick, _setSessionRefreshTick] = useState(0);
	const [columnCount, setColumnCount] = useState(4); // Default to 4, will be updated by GroveGrid

	// Get session tracking service
	const sessionTrackingService = useService(SessionTrackingServiceToken);

	// Background session polling - updates every 10 seconds
	// DISABLED: Session fetching temporarily disabled
	// useEffect(() => {
	// 	let isMounted = true;
	//
	// 	async function updateSessions() {
	// 		setIsUpdatingSessions(true);
	// 		try {
	// 			const updateResult = await sessionTrackingService.updateAllSessions();
	// 			const cleanedUp = await sessionTrackingService.cleanupStale();
	//
	// 			// Only trigger re-render if something actually changed
	// 			const hasChanges =
	// 				updateResult.added > 0 ||
	// 				updateResult.updated > 0 ||
	// 				updateResult.removed > 0 ||
	// 				cleanedUp > 0;
	//
	// 			if (isMounted && hasChanges) {
	// 				// Trigger re-render to update session indicators
	// 				setSessionRefreshTick((tick) => tick + 1);
	// 			}
	// 		} catch {
	// 			// Silent fail - don't block UI
	// 		} finally {
	// 			if (isMounted) {
	// 				setIsUpdatingSessions(false);
	// 			}
	// 		}
	// 	}
	//
	// 	// Initial update
	// 	updateSessions();
	//
	// 	// Poll every 10 seconds
	// 	const interval = setInterval(updateSessions, 10000);
	//
	// 	return () => {
	// 		isMounted = false;
	// 		clearInterval(interval);
	// 	};
	// }, [sessionTrackingService]);

	// Get workspace context to display workspace name
	const workspaceService = useService(WorkspaceServiceToken);
	const workspaceContext = workspaceService.getCurrentContext();
	const workspaceName = getContextDisplayName(workspaceContext);

	// Menu options
	const menuOptions: MenuOption[] = [
		{ label: 'Background Tasks', action: () => navigate('activity', {}) },
		{ label: 'Settings', action: () => navigate('settings', {}) },
		{ label: 'Quit', action: () => exit() },
	];

	// Total items in the grid = 1 (create button) + groves.length
	const totalItems = 1 + groves.length;

	// Enter/activate a grid item (shared by Enter key and mouse click).
	const activateItem = (index: number) => {
		if (index === 0) {
			// First item is the "Create Grove" button
			navigate('createGrove', {});
			return;
		}
		// Navigate to grove detail screen (offset by 1 for create button).
		// Stamp the selection into our own params first so returning via
		// goBack() re-selects this grove instead of the first tile.
		const grove = groves[index - 1];
		if (!grove) {
			return;
		}
		replace('home', { selectedGroveId: grove.id });
		navigate('groveDetail', { groveId: grove.id });
	};

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
					const newIndex = prev - columnCount;
					return newIndex >= 0 ? newIndex : prev;
				});
			} else if (key.downArrow) {
				setSelectedGroveIndex((prev) => {
					const newIndex = prev + columnCount;
					return newIndex < totalItems ? newIndex : prev;
				});
			} else if (key.return) {
				activateItem(selectedGroveIndex);
			} else if (input === 'm') {
				setShowMenu(true);
				setSelectedMenuIndex(0);
			} else if (key.escape && canGoBack) {
				// When opened from the global switcher, Esc returns to it.
				goBack();
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
						{workspaceName && (
							<Text bold color="cyan">
								{' '}
								→ {workspaceName}
							</Text>
						)}
					</Box>

					<Box marginBottom={1}>
						<Text dimColor>AI-powered Git worktree management</Text>
					</Box>

					{/* Session update status */}
					{/* DISABLED: Session fetching temporarily disabled */}
					{/* {isUpdatingSessions && (
						<Box marginBottom={1}>
							<Text dimColor>Updating Claude sessions...</Text>
						</Box>
					)} */}

					{/* Groves Grid */}
					<Box flexDirection="column" marginTop={1}>
						<Box marginBottom={1}>
							<Text bold>Your Groves</Text>
						</Box>

						<GroveGrid
							groves={groves}
							selectedIndex={selectedGroveIndex}
							sessionTrackingService={sessionTrackingService}
							refreshTick={sessionRefreshTick}
							onColumnsChange={setColumnCount}
							onSelectItem={setSelectedGroveIndex}
							onActivateItem={activateItem}
						/>
					</Box>

					{/* Help text */}
					<Box marginTop={1} flexDirection="column">
						<Text dimColor>
							↑↓←→ Navigate • Enter/Click Select • <Text bold>m</Text> Menu
							{canGoBack && (
								<>
									{' '}
									• <Text bold>Esc</Text> Workspaces
								</>
							)}
						</Text>
					</Box>
				</>
			)}
		</Box>
	);
}

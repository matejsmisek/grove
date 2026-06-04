import React, { useEffect, useState } from 'react';

import { Box, Text, useApp, useInput } from 'ink';

import path from 'path';

import type { MenuOption } from '../components/home/MenuModal.js';
import { MenuModal } from '../components/home/MenuModal.js';
import { WorkspaceGrid } from '../components/home/WorkspaceGrid.js';
import { useService } from '../di/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import {
	SessionsServiceToken,
	SettingsServiceToken,
	WorkspaceServiceToken,
} from '../services/tokens.js';
import { readGrovesIndexAt } from '../storage/index.js';
import type { WorkspaceContext } from '../storage/types.js';

const WORKSPACE_GROVE_FOLDER = '.grove';

interface SwitcherLocation {
	type: 'workspace' | 'repo';
	name: string;
	path: string;
	groveCount: number;
}

/**
 * Global "home" shown when Grove is launched outside any workspace and outside a
 * git repository. It does NOT allow creating groves; instead it lists every
 * known workspace and repo (with a grove count) so the user can switch into one.
 * Selecting a tile switches the active context to that location and opens its
 * normal home screen (where creation is available).
 */
interface WorkspaceSwitcherScreenProps {
	/** Location to pre-select on mount (e.g. when returning from its home screen). */
	selectedLocationPath?: string;
}

export function WorkspaceSwitcherScreen({ selectedLocationPath }: WorkspaceSwitcherScreenProps) {
	const { navigate, replace } = useNavigation();
	const { exit } = useApp();
	const workspaceService = useService(WorkspaceServiceToken);
	const settingsService = useService(SettingsServiceToken);
	const sessionsService = useService(SessionsServiceToken);

	// Build the list of switchable locations once. A location is skipped when it
	// has no grove data (missing folder or zero groves) — this silently handles
	// repos/workspaces that were deleted or never produced a grove. Order is
	// stable (workspaces then repos, as stored); we intentionally do NOT reorder
	// by recent use so tiles stay in a predictable place.
	const [locations] = useState<SwitcherLocation[]>(() => {
		const result: SwitcherLocation[] = [];

		const add = (type: 'workspace' | 'repo', name: string, locPath: string) => {
			const groveFolder = path.join(locPath, WORKSPACE_GROVE_FOLDER);
			const groveCount = readGrovesIndexAt(groveFolder).length;
			if (groveCount > 0) {
				result.push({ type, name, path: locPath, groveCount });
			}
		};

		for (const ref of workspaceService.readGlobalWorkspaces().workspaces) {
			add(ref.type === 'repo' ? 'repo' : 'workspace', ref.name, ref.path);
		}

		return result;
	});

	// Pre-select the requested location; fall back to the first tile when it's
	// missing or none was requested.
	const [selectedIndex, setSelectedIndex] = useState(() => {
		if (!selectedLocationPath) {
			return 0;
		}
		const index = locations.findIndex((location) => location.path === selectedLocationPath);
		return index >= 0 ? index : 0;
	});
	const [columnCount, setColumnCount] = useState(4);
	const [showMenu, setShowMenu] = useState(false);
	const [selectedMenuIndex, setSelectedMenuIndex] = useState(0);

	const applyContext = (context: WorkspaceContext) => {
		workspaceService.setCurrentContext(context);
		settingsService.setContext(context);
		sessionsService.setSessionsPath(settingsService.getStorageConfig().sessionsPath);
	};

	// Ensure the active context is the global one whenever this screen is shown
	// (e.g. after switching into a workspace and navigating back).
	useEffect(() => {
		applyContext(workspaceService.getGlobalContext());
	}, []);

	const openLocation = (location: SwitcherLocation) => {
		// Build the target context from the tile type (no git/workspace re-detection,
		// which could fail and silently fall back to global), then open the normal
		// home screen for it.
		const context =
			location.type === 'repo'
				? workspaceService.buildRepoContext(location.path)
				: workspaceService.resolveContext(location.path);
		applyContext(context);
		// Stamp the selection into our own params first so returning via goBack()
		// re-selects this location instead of the first tile.
		replace('globalHome', { selectedLocationPath: location.path });
		navigate('home', {});
	};

	const menuOptions: MenuOption[] = [
		{ label: 'Background Tasks', action: () => navigate('activity', {}) },
		{ label: 'Settings', action: () => navigate('settings', {}) },
		{ label: 'Quit', action: () => exit() },
	];

	useInput((input, key) => {
		if (showMenu) {
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
			return;
		}

		if (input === 'm') {
			setShowMenu(true);
			setSelectedMenuIndex(0);
		} else if (input === 'q') {
			exit();
		} else if (locations.length > 0) {
			if (key.leftArrow) {
				setSelectedIndex((prev) => (prev > 0 ? prev - 1 : locations.length - 1));
			} else if (key.rightArrow) {
				setSelectedIndex((prev) => (prev < locations.length - 1 ? prev + 1 : 0));
			} else if (key.upArrow) {
				setSelectedIndex((prev) => {
					const next = prev - columnCount;
					return next >= 0 ? next : prev;
				});
			} else if (key.downArrow) {
				setSelectedIndex((prev) => {
					const next = prev + columnCount;
					return next < locations.length ? next : prev;
				});
			} else if (key.return) {
				openLocation(locations[selectedIndex]);
			}
		}
	});

	if (showMenu) {
		return (
			<Box flexDirection="column" padding={1}>
				<MenuModal
					title="Menu"
					options={menuOptions}
					selectedIndex={selectedMenuIndex}
					helpText="Press ESC or 'm' to close"
				/>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="green">
					🌳 Grove
				</Text>
				<Text dimColor> — all workspaces &amp; repos</Text>
			</Box>

			{locations.length === 0 ? (
				<Box flexDirection="column" marginTop={1}>
					<Text dimColor>No groves found in any workspace or repository yet.</Text>
					<Box marginTop={1} flexDirection="column">
						<Text dimColor>To get started:</Text>
						<Text dimColor>
							• <Text color="cyan">cd</Text> into a git repository and run <Text color="cyan">grove</Text>
						</Text>
						<Text dimColor>
							• or run <Text color="cyan">grove workspace init</Text> to create a workspace
						</Text>
					</Box>
				</Box>
			) : (
				<Box flexDirection="column" marginTop={1}>
					<Box marginBottom={1}>
						<Text dimColor>Select a workspace or repo to open:</Text>
					</Box>
					<WorkspaceGrid
						items={locations.map((location) => ({
							name: location.name,
							kind: location.type,
							path: location.path,
							groveCount: location.groveCount,
						}))}
						selectedIndex={selectedIndex}
						onColumnsChange={setColumnCount}
						onSelectItem={setSelectedIndex}
						onActivateItem={(index) => {
							const location = locations[index];
							if (location) {
								openLocation(location);
							}
						}}
					/>
				</Box>
			)}

			<Box marginTop={1} flexDirection="column">
				<Text dimColor>
					↑↓←→ Navigate • Enter/Click Open • <Text bold>m</Text> Menu • <Text bold>q</Text> Quit
				</Text>
			</Box>
		</Box>
	);
}

import React from 'react';

import { Box, Text } from 'ink';

import { ChatScreen } from '../screens/ChatScreen.js';
import { CreateGroveScreen } from '../screens/CreateGroveScreen.js';
import { HomeScreen } from '../screens/HomeScreen.js';
import { RepositoriesScreen } from '../screens/RepositoriesScreen.js';
import { SettingsScreen } from '../screens/SettingsScreen.js';
import { WorkingFolderScreen } from '../screens/WorkingFolderScreen.js';
import { useNavigation } from './useNavigation.js';

/**
 * Router component that renders the appropriate screen
 * based on the current navigation state
 */
export function Router() {
	const { current, history } = useNavigation();

	// Use history length as key to force component remount on navigation
	// This ensures selection state resets when navigating back
	const navigationKey = history.length;

	switch (current.screen) {
		case 'home':
			return <HomeScreen key={navigationKey} />;
		case 'chat':
			return <ChatScreen key={navigationKey} />;
		case 'createGrove':
			return <CreateGroveScreen key={navigationKey} />;
		case 'settings':
			// Type narrowing: we know params is { section?: string } here
			return (
				<SettingsScreen
					key={navigationKey}
					section={'section' in current.params ? current.params.section : undefined}
				/>
			);
		case 'workingFolder':
			return <WorkingFolderScreen key={navigationKey} />;
		case 'repositories':
			return <RepositoriesScreen key={navigationKey} />;
		default:
			return (
				<Box padding={1}>
					<Text color="red">404: Screen not found - {current.screen}</Text>
				</Box>
			);
	}
}

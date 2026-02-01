import React from 'react';

import { Box, Text } from 'ink';

import { AddWorktreeScreen } from '../screens/AddWorktreeScreen.js';
import { ChatScreen } from '../screens/ChatScreen.js';
import { ClaudeTerminalSettingsScreen } from '../screens/ClaudeTerminalSettingsScreen.js';
import { CloseGroveScreen } from '../screens/CloseGroveScreen.js';
import { CreateGroveScreen } from '../screens/CreateGroveScreen.js';
import { GroveDetailScreen } from '../screens/GroveDetailScreen.js';
import { HomeScreen } from '../screens/HomeScreen.js';
import { IDESettingsScreen } from '../screens/IDESettingsScreen.js';
import { LLMSettingsScreen } from '../screens/LLMSettingsScreen.js';
import { OpenClaudeScreen } from '../screens/OpenClaudeScreen.js';
import { OpenIDEScreen } from '../screens/OpenIDEScreen.js';
import { OpenTerminalScreen } from '../screens/OpenTerminalScreen.js';
import { PluginSettingsScreen } from '../screens/PluginSettingsScreen.js';
import { RepositoriesScreen } from '../screens/RepositoriesScreen.js';
import { ResumeClaudeScreen } from '../screens/ResumeClaudeScreen.js';
import { SettingsScreen } from '../screens/SettingsScreen.js';
import { WorkingFolderScreen } from '../screens/WorkingFolderScreen.js';
import { useNavigation } from './useNavigation.js';

/**
 * Router component that renders the appropriate screen
 * based on the current navigation state
 */
export function Router() {
	const { current } = useNavigation();

	switch (current.screen) {
		case 'home':
			return <HomeScreen />;
		case 'chat':
			return <ChatScreen />;
		case 'createGrove':
			return <CreateGroveScreen />;
		case 'groveDetail':
			// Type narrowing: we know params is { groveId: string } here
			return <GroveDetailScreen groveId={'groveId' in current.params ? current.params.groveId : ''} />;
		case 'closeGrove':
			// Type narrowing: we know params is { groveId: string } here
			return <CloseGroveScreen groveId={'groveId' in current.params ? current.params.groveId : ''} />;
		case 'addWorktree':
			// Type narrowing: we know params is { groveId: string } here
			return <AddWorktreeScreen groveId={'groveId' in current.params ? current.params.groveId : ''} />;
		case 'openTerminal':
			// Type narrowing: we know params is { groveId: string } here
			return (
				<OpenTerminalScreen groveId={'groveId' in current.params ? current.params.groveId : ''} />
			);
		case 'openIDE':
			// Type narrowing: we know params is { groveId: string } here
			return <OpenIDEScreen groveId={'groveId' in current.params ? current.params.groveId : ''} />;
		case 'openClaude':
			// Type narrowing: we know params is { groveId: string } here
			return <OpenClaudeScreen groveId={'groveId' in current.params ? current.params.groveId : ''} />;
		case 'resumeClaude':
			// Type narrowing: we know params is { groveId: string; worktreePath?: string } here
			return (
				<ResumeClaudeScreen
					groveId={'groveId' in current.params ? current.params.groveId : ''}
					worktreePath={'worktreePath' in current.params ? current.params.worktreePath : undefined}
				/>
			);
		case 'ideSettings':
			return <IDESettingsScreen />;
		case 'claudeTerminalSettings':
			return <ClaudeTerminalSettingsScreen />;
		case 'llmSettings':
			return <LLMSettingsScreen />;
		case 'settings':
			// Type narrowing: we know params is { section?: string } here
			return (
				<SettingsScreen section={'section' in current.params ? current.params.section : undefined} />
			);
		case 'workingFolder':
			return <WorkingFolderScreen />;
		case 'repositories':
			return <RepositoriesScreen />;
		case 'pluginSettings':
			return <PluginSettingsScreen />;
		default:
			return (
				<Box padding={1}>
					<Text color="red">404: Screen not found - {current.screen}</Text>
				</Box>
			);
	}
}

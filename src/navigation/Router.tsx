import React from 'react';

import { Box, Text } from 'ink';

import { ActivityScreen } from '../screens/ActivityScreen.js';
import { AddWorktreeScreen } from '../screens/AddWorktreeScreen.js';
import { ChatScreen } from '../screens/ChatScreen.js';
import { ClaudeTerminalSettingsScreen } from '../screens/ClaudeTerminalSettingsScreen.js';
import { CloseGroveScreen } from '../screens/CloseGroveScreen.js';
import { CloseMergedWorktreesScreen } from '../screens/CloseMergedWorktreesScreen.js';
import { CloseWorktreeScreen } from '../screens/CloseWorktreeScreen.js';
import { CreateGroveScreen } from '../screens/CreateGroveScreen.js';
import { GroveConfigEditorScreen } from '../screens/GroveConfigEditorScreen.js';
import { GroveDetailScreen } from '../screens/GroveDetailScreen.js';
import { HomeScreen } from '../screens/HomeScreen.js';
import { IDESettingsScreen } from '../screens/IDESettingsScreen.js';
import { InterfaceSettingsScreen } from '../screens/InterfaceSettingsScreen.js';
import { LLMSettingsScreen } from '../screens/LLMSettingsScreen.js';
import { OpenClaudeScreen } from '../screens/OpenClaudeScreen.js';
import { OpenIDEScreen } from '../screens/OpenIDEScreen.js';
import { OpenTerminalScreen } from '../screens/OpenTerminalScreen.js';
import { PluginSettingsScreen } from '../screens/PluginSettingsScreen.js';
import { RepositoriesScreen } from '../screens/RepositoriesScreen.js';
import { ResumeClaudeScreen } from '../screens/ResumeClaudeScreen.js';
import { SettingsScreen } from '../screens/SettingsScreen.js';
import { SetupWizardScreen } from '../screens/SetupWizardScreen.js';
import { WorkingFolderScreen } from '../screens/WorkingFolderScreen.js';
import { WorkspaceSwitcherScreen } from '../screens/WorkspaceSwitcherScreen.js';
import { useNavigation } from './useNavigation.js';

/**
 * Router component that renders the appropriate screen
 * based on the current navigation state
 */
export function Router() {
	const { current } = useNavigation();

	switch (current.screen) {
		case 'home':
			return (
				<HomeScreen
					selectedGroveId={
						'selectedGroveId' in current.params ? current.params.selectedGroveId : undefined
					}
				/>
			);
		case 'globalHome':
			return (
				<WorkspaceSwitcherScreen
					selectedLocationPath={
						'selectedLocationPath' in current.params ? current.params.selectedLocationPath : undefined
					}
				/>
			);
		case 'setupWizard':
			return <SetupWizardScreen />;
		case 'chat':
			return <ChatScreen />;
		case 'activity':
			return <ActivityScreen />;
		case 'createGrove':
			return <CreateGroveScreen />;
		case 'groveDetail':
			// Type narrowing: we know params is { groveId: string; focusWorktreeName?: string } here
			return (
				<GroveDetailScreen
					groveId={'groveId' in current.params ? current.params.groveId : ''}
					focusWorktreeName={
						'focusWorktreeName' in current.params ? current.params.focusWorktreeName : undefined
					}
				/>
			);
		case 'closeGrove':
			// Type narrowing: we know params is { groveId: string } here
			return <CloseGroveScreen groveId={'groveId' in current.params ? current.params.groveId : ''} />;
		case 'closeWorktree':
			// Type narrowing: we know params is { groveId: string; worktreePath: string } here
			return (
				<CloseWorktreeScreen
					groveId={'groveId' in current.params ? current.params.groveId : ''}
					worktreePath={'worktreePath' in current.params ? (current.params.worktreePath as string) : ''}
				/>
			);
		case 'closeMergedWorktrees':
			// Type narrowing: we know params is { groveId: string } here
			return (
				<CloseMergedWorktreesScreen
					groveId={'groveId' in current.params ? current.params.groveId : ''}
				/>
			);
		case 'addWorktree':
			// Type narrowing: we know params is { groveId: string } here
			return <AddWorktreeScreen groveId={'groveId' in current.params ? current.params.groveId : ''} />;
		case 'forkWorktree':
			// Type narrowing: we know params is { groveId: string; worktreePath: string } here
			return (
				<AddWorktreeScreen
					groveId={'groveId' in current.params ? current.params.groveId : ''}
					forkFromWorktreePath={
						'worktreePath' in current.params ? (current.params.worktreePath as string) : ''
					}
				/>
			);
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
		case 'interfaceSettings':
			return <InterfaceSettingsScreen />;
		case 'groveConfigEditor':
			return (
				<GroveConfigEditorScreen
					repositoryPath={'repositoryPath' in current.params ? current.params.repositoryPath : undefined}
				/>
			);
		default:
			return (
				<Box padding={1}>
					<Text color="red">404: Screen not found - {current.screen}</Text>
				</Box>
			);
	}
}

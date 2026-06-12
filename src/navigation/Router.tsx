import React from 'react';

import { Box, Text } from 'ink';

import { ActivityScreen } from '../screens/ActivityScreen.js';
import { AddWorktreeScreen } from '../screens/AddWorktreeScreen.js';
import { ArchivedSessionsScreen } from '../screens/ArchivedSessionsScreen.js';
import { AsanaSettingsScreen } from '../screens/AsanaSettingsScreen.js';
import { ChatScreen } from '../screens/ChatScreen.js';
import { ClaudeTerminalSettingsScreen } from '../screens/ClaudeTerminalSettingsScreen.js';
import { CloseGroveScreen } from '../screens/CloseGroveScreen.js';
import { CloseMergedWorktreesScreen } from '../screens/CloseMergedWorktreesScreen.js';
import { CloseWorktreeScreen } from '../screens/CloseWorktreeScreen.js';
import { CreateGroveScreen } from '../screens/CreateGroveScreen.js';
import { DirenvTrustScreen } from '../screens/DirenvTrustScreen.js';
import { GitLabSettingsScreen } from '../screens/GitLabSettingsScreen.js';
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
import { PromptTemplateSettingsScreen } from '../screens/PromptTemplateSettingsScreen.js';
import { RepositoriesScreen } from '../screens/RepositoriesScreen.js';
import { ResumeClaudeScreen } from '../screens/ResumeClaudeScreen.js';
import { SettingsScreen } from '../screens/SettingsScreen.js';
import { SetupWizardScreen } from '../screens/SetupWizardScreen.js';
import { WorkingFolderScreen } from '../screens/WorkingFolderScreen.js';
import { WorkspaceSwitcherScreen } from '../screens/WorkspaceSwitcherScreen.js';
import type { NavigationState } from './types.js';
import { useNavigation } from './useNavigation.js';

/**
 * Router component that renders the appropriate screen
 * based on the current navigation state
 */
export function Router() {
	const { current } = useNavigation();

	switch (current.screen) {
		case 'home':
			return <HomeScreen selectedGroveId={current.params.selectedGroveId} />;
		case 'globalHome':
			return <WorkspaceSwitcherScreen selectedLocationPath={current.params.selectedLocationPath} />;
		case 'setupWizard':
			return <SetupWizardScreen />;
		case 'direnvTrust':
			return <DirenvTrustScreen />;
		case 'chat':
			return <ChatScreen />;
		case 'activity':
			return <ActivityScreen />;
		case 'createGrove':
			return <CreateGroveScreen />;
		case 'groveDetail':
			return (
				<GroveDetailScreen
					groveId={current.params.groveId}
					focusWorktreeName={current.params.focusWorktreeName}
				/>
			);
		case 'closeGrove':
			return <CloseGroveScreen groveId={current.params.groveId} />;
		case 'closeWorktree':
			return (
				<CloseWorktreeScreen
					groveId={current.params.groveId}
					worktreePath={current.params.worktreePath}
				/>
			);
		case 'closeMergedWorktrees':
			return <CloseMergedWorktreesScreen groveId={current.params.groveId} />;
		case 'addWorktree':
			return <AddWorktreeScreen groveId={current.params.groveId} />;
		case 'forkWorktree':
			return (
				<AddWorktreeScreen
					groveId={current.params.groveId}
					forkFromWorktreePath={current.params.worktreePath}
				/>
			);
		case 'openTerminal':
			return <OpenTerminalScreen groveId={current.params.groveId} />;
		case 'openIDE':
			return <OpenIDEScreen groveId={current.params.groveId} />;
		case 'openClaude':
			return <OpenClaudeScreen groveId={current.params.groveId} />;
		case 'resumeClaude':
			return (
				<ResumeClaudeScreen
					groveId={current.params.groveId}
					worktreePath={current.params.worktreePath}
				/>
			);
		case 'archivedSessions':
			return (
				<ArchivedSessionsScreen
					groveId={current.params.groveId}
					worktreePath={current.params.worktreePath}
				/>
			);
		case 'ideSettings':
			return <IDESettingsScreen />;
		case 'claudeTerminalSettings':
			return <ClaudeTerminalSettingsScreen />;
		case 'promptTemplateSettings':
			return <PromptTemplateSettingsScreen />;
		case 'llmSettings':
			return <LLMSettingsScreen />;
		case 'settings':
			return <SettingsScreen section={current.params.section} />;
		case 'workingFolder':
			return <WorkingFolderScreen />;
		case 'repositories':
			return <RepositoriesScreen />;
		case 'pluginSettings':
			return <PluginSettingsScreen selectedPluginId={current.params.selectedPluginId} />;
		case 'gitlabSettings':
			return <GitLabSettingsScreen />;
		case 'asanaSettings':
			return <AsanaSettingsScreen />;
		case 'interfaceSettings':
			return <InterfaceSettingsScreen />;
		case 'groveConfigEditor':
			return <GroveConfigEditorScreen repositoryPath={current.params.repositoryPath} />;
		default:
			// `current` is `never` here because the switch is exhaustive over the
			// NavigationState union; read the screen name back for the 404 message.
			return (
				<Box padding={1}>
					<Text color="red">404: Screen not found - {(current as NavigationState).screen}</Text>
				</Box>
			);
	}
}

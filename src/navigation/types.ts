// Navigation route definitions with type-safe params
export type Routes = {
	home: { selectedGroveId?: string };
	globalHome: { selectedLocationPath?: string };
	setupWizard: Record<string, never>;
	direnvTrust: Record<string, never>;
	chat: Record<string, never>;
	activity: Record<string, never>;
	createGrove: Record<string, never>;
	groveDetail: { groveId: string; focusWorktreeName?: string };
	closeGrove: { groveId: string };
	closeWorktree: { groveId: string; worktreePath: string };
	closeMergedWorktrees: { groveId: string };
	addWorktree: { groveId: string };
	forkWorktree: { groveId: string; worktreePath: string };
	openTerminal: { groveId: string };
	openIDE: { groveId: string };
	openClaude: { groveId: string };
	resumeClaude: { groveId: string; worktreePath?: string };
	archivedSessions: { groveId: string; worktreePath: string };
	settings: { section?: string };
	workingFolder: Record<string, never>;
	repositories: Record<string, never>;
	ideSettings: Record<string, never>;
	claudeTerminalSettings: Record<string, never>;
	promptTemplateSettings: Record<string, never>;
	llmSettings: Record<string, never>;
	pluginSettings: { selectedPluginId?: string };
	gitlabSettings: Record<string, never>;
	asanaSettings: Record<string, never>;
	interfaceSettings: Record<string, never>;
	groveConfigEditor: { repositoryPath?: string };
};

// Navigation state for current screen and params.
// Discriminated union over Routes so that narrowing on `screen` narrows `params`.
export type NavigationState = {
	[K in keyof Routes]: { screen: K; params: Routes[K] };
}[keyof Routes];

// Parameterized helper retained for the generic navigate/replace signatures,
// where the screen key is only known via a type parameter.
export type NavigationStateFor<T extends keyof Routes = keyof Routes> = {
	screen: T;
	params: Routes[T];
};

// Navigation context type
export type NavigationContextType = {
	current: NavigationState;
	navigate: <T extends keyof Routes>(screen: T, params: Routes[T]) => void;
	replace: <T extends keyof Routes>(screen: T, params: Routes[T]) => void;
	goBack: () => void;
	canGoBack: boolean;
	history: NavigationState[];
};

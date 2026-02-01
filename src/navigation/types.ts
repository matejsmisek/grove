// Navigation route definitions with type-safe params
export type Routes = {
	home: Record<string, never>;
	chat: Record<string, never>;
	createGrove: Record<string, never>;
	groveDetail: { groveId: string };
	closeGrove: { groveId: string };
	addWorktree: { groveId: string };
	openTerminal: { groveId: string };
	openIDE: { groveId: string };
	openClaude: { groveId: string };
	resumeClaude: { groveId: string; worktreePath?: string };
	settings: { section?: string };
	workingFolder: Record<string, never>;
	repositories: Record<string, never>;
	ideSettings: Record<string, never>;
	claudeTerminalSettings: Record<string, never>;
	llmSettings: Record<string, never>;
};

// Navigation state for current screen and params
export type NavigationState<T extends keyof Routes = keyof Routes> = {
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

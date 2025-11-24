// Navigation route definitions with type-safe params
export type Routes = {
	home: Record<string, never>;
	chat: Record<string, never>;
	createGrove: Record<string, never>;
	closeGrove: { groveId: string };
	settings: { section?: string };
	workingFolder: Record<string, never>;
	repositories: Record<string, never>;
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
	goBack: () => void;
	canGoBack: boolean;
	history: NavigationState[];
};

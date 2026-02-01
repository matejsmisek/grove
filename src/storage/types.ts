/**
 * Terminal configuration for opening terminals
 */
export interface TerminalConfig {
	/** The terminal command to use (e.g., 'gnome-terminal', 'konsole') */
	command: string;
	/** Arguments to pass to the terminal, use {path} as placeholder for the directory */
	args: string[];
}

/**
 * Supported IDE types for "Open in IDE" feature
 * 'jetbrains-auto' will auto-detect the appropriate JetBrains IDE based on project files
 */
export type IDEType =
	| 'vscode'
	| 'phpstorm'
	| 'webstorm'
	| 'idea'
	| 'pycharm'
	| 'jetbrains-auto'
	| 'vim';

/**
 * Configuration for a specific IDE
 */
export interface IDEConfig {
	/** The IDE command to use (e.g., 'code', 'phpstorm') */
	command: string;
	/** Arguments to pass to the IDE, use {path} as placeholder for the directory */
	args: string[];
}

/**
 * Map of IDE types to their configurations
 */
export type IDEConfigs = Partial<Record<IDEType, IDEConfig>>;

/**
 * Supported terminal types for Claude sessions
 */
export type ClaudeTerminalType = 'konsole' | 'kitty';

/**
 * Template for Claude session/tabs file
 * Contains the file content with placeholders:
 * - ${WORKING_DIR}: Working directory path
 * - ${AGENT_COMMAND}: Agent command (e.g., 'claude' or 'claude --resume <id>')
 * - ${GROVE_NAME}: Full grove name
 * - ${GROVE_NAME_SHORT}: Shortened grove name (max 10 chars)
 */
export interface ClaudeSessionTemplate {
	/** Template content with placeholders */
	content: string;
}

/**
 * Map of Claude terminal types to their session templates
 */
export type ClaudeSessionTemplates = Partial<Record<ClaudeTerminalType, ClaudeSessionTemplate>>;

export interface Settings {
	/**
	 * The working folder path where worktrees are created.
	 * This is different from the .grove folder which stores Grove's data.
	 */
	workingFolder: string;
	/**
	 * Terminal configuration detected on first startup.
	 * If not set, terminal opening will not work.
	 */
	terminal?: TerminalConfig;
	/**
	 * Currently selected IDE type for "Open in IDE" feature.
	 * If not set, IDE opening will not work.
	 */
	selectedIDE?: IDEType;
	/**
	 * Custom IDE configurations.
	 * If not set for an IDE type, default configuration will be used.
	 */
	ideConfigs?: IDEConfigs;
	/**
	 * Currently selected terminal type for "Open in Claude" feature.
	 * If not set, Claude opening will auto-detect available terminal.
	 */
	selectedClaudeTerminal?: ClaudeTerminalType;
	/**
	 * Custom Claude session templates for different terminal types.
	 * Templates support placeholders:
	 * - ${WORKING_DIR}: Working directory path
	 * - ${AGENT_COMMAND}: Agent command (e.g., 'claude' or 'claude --resume <id>')
	 * - ${GROVE_NAME}: Full grove name
	 * - ${GROVE_NAME_SHORT}: Shortened grove name (max 10 chars)
	 * If not set for a terminal type, default template will be used.
	 */
	claudeSessionTemplates?: ClaudeSessionTemplates;
	/**
	 * OpenRouter API key for LLM features (grove name generation, etc.)
	 * Get your key at: https://openrouter.ai/keys
	 */
	openrouterApiKey?: string;
	/**
	 * LLM model to use for AI features
	 * Default: "anthropic/claude-3.5-haiku"
	 * Options: "anthropic/claude-3.5-sonnet", "openai/gpt-4o", etc.
	 */
	llmModel?: string;
	/**
	 * Site URL for OpenRouter tracking (optional)
	 * Only sent if explicitly configured - not sent by default
	 * Used for HTTP-Referer header
	 */
	llmSiteUrl?: string;
	/**
	 * App name for OpenRouter tracking (optional)
	 * Only sent if explicitly configured - not sent by default
	 * Used for X-Title header
	 */
	llmAppName?: string;
}

export interface StorageConfig {
	/**
	 * The path to the .grove folder (defaults to ~/.grove)
	 */
	groveFolder: string;

	/**
	 * The path to the settings.json file
	 */
	settingsPath: string;

	/**
	 * The path to the repositories.json file
	 */
	repositoriesPath: string;

	/**
	 * The path to the groves index file
	 */
	grovesIndexPath: string;

	/**
	 * The path to the recent selections file
	 */
	recentSelectionsPath: string;

	/**
	 * The path to the sessions file (AI agent session tracking)
	 */
	sessionsPath: string;
}

export interface Repository {
	/**
	 * Absolute path to the repository root
	 */
	path: string;

	/**
	 * Repository name (derived from folder name)
	 */
	name: string;

	/**
	 * When the repository was registered
	 */
	registeredAt: string;

	/**
	 * Whether this repository is a monorepo with multiple projects
	 * When true, grove creation will allow selecting specific project folders
	 */
	isMonorepo?: boolean;
}

export interface RepositoriesData {
	/**
	 * List of registered repositories
	 */
	repositories: Repository[];
}

/**
 * Represents a repository selection for grove creation
 * Used to pass repository + optional project path to GroveService
 */
export interface RepositorySelection {
	/** The repository being selected */
	repository: Repository;
	/**
	 * Project folder path relative to repository root (for monorepos)
	 * When undefined, the entire repository is selected
	 */
	projectPath?: string;
}

/**
 * Represents a worktree within a grove
 */
export interface Worktree {
	/** Name of the repository */
	repositoryName: string;
	/** Path to the repository root */
	repositoryPath: string;
	/** Path to the worktree directory */
	worktreePath: string;
	/** Branch name for this worktree */
	branch: string;
	/**
	 * Project folder path relative to repository root (for monorepos)
	 * When set, indicates this worktree is for a specific project within a monorepo
	 */
	projectPath?: string;
	/**
	 * Status of initActions execution (if any were configured)
	 */
	initActionsStatus?: InitActionsStatus;
}

/**
 * Status of initActions execution for a worktree
 */
export interface InitActionsStatus {
	/** Whether initActions were executed */
	executed: boolean;
	/** Whether all initActions succeeded */
	success: boolean;
	/** Timestamp when initActions were executed */
	executedAt: string;
	/** Log file name (stored in grove directory next to CONTEXT.md) */
	logFile: string;
	/** Number of actions that were configured */
	totalActions: number;
	/** Number of actions that succeeded */
	successfulActions: number;
	/** Error message if execution failed */
	errorMessage?: string;
}

/**
 * Reference to a grove stored in global groves index
 */
export interface GroveReference {
	/** Grove ID */
	id: string;
	/** Grove name */
	name: string;
	/** Path to the grove directory */
	path: string;
	/** Timestamp when the grove was created */
	createdAt: string;
	/** Timestamp when the grove was last updated */
	updatedAt: string;
}

/**
 * Global grove index stored in .grove/groves.json
 */
export interface GrovesIndex {
	/** List of grove references */
	groves: GroveReference[];
}

/**
 * Grove-specific metadata stored in {grove-folder}/grove.json
 */
export interface GroveMetadata {
	/** Grove ID */
	id: string;
	/** Grove name */
	name: string;
	/** Short identifier (5-char hash) used for worktree/branch naming */
	identifier?: string;
	/** List of worktrees in this grove */
	worktrees: Worktree[];
	/** Timestamp when the grove was created */
	createdAt: string;
	/** Timestamp when the grove was last updated */
	updatedAt: string;
}

/**
 * Represents a recently used repository/project selection
 * Stored in ~/.grove/recent.json
 */
export interface RecentSelection {
	/** Repository path */
	repositoryPath: string;
	/** Repository name */
	repositoryName: string;
	/**
	 * Project folder path for monorepos (undefined for whole repo)
	 */
	projectPath?: string;
	/** When this selection was last used */
	lastUsedAt: string;
}

/**
 * Container for recent selections
 */
export interface RecentSelectionsData {
	/** List of recent selections, ordered by most recent first */
	selections: RecentSelection[];
}

/**
 * IDE configuration for grove repo config
 * Can be either a reference to a global IDE (e.g., "@phpstorm") or a custom config
 */
export type GroveIDEConfig =
	| `@${IDEType}` // Reference to global IDE config (e.g., "@phpstorm", "@vscode")
	| IDEConfig; // Custom IDE config with command and args

/**
 * Grove repository configuration stored in .grove.json and .grove.local.json
 * within individual repositories
 */
export interface GroveRepoConfig {
	/**
	 * Branch name template for creating worktrees in this repository
	 * Must contain ${GROVE_NAME} placeholder which will be replaced with normalized grove name
	 * Example: "grove/${GROVE_NAME}" or "feature/${GROVE_NAME}-work"
	 */
	branchNameTemplate?: string;
	/**
	 * File patterns (glob) to copy from repository to worktrees when creating groves
	 * Example: ['.gitignore', '.env.example', '*.config.js']
	 */
	fileCopyPatterns?: string[];
	/**
	 * Actions to run after creating worktrees (not implemented yet)
	 */
	initActions?: string[];
	/**
	 * IDE configuration for this repository/project
	 * Can be either:
	 * - A reference to a global IDE: "@vscode", "@phpstorm", "@webstorm", "@idea", "@vim"
	 * - A custom IDE config: { command: "code", args: ["{path}"] }
	 * When set, this IDE will be used instead of the default IDE from settings
	 */
	ide?: GroveIDEConfig;
	/**
	 * Custom Claude session templates for different terminal types.
	 * Templates support placeholders:
	 * - ${WORKING_DIR}: Working directory path
	 * - ${AGENT_COMMAND}: Agent command (e.g., 'claude' or 'claude --resume <id>')
	 * - ${GROVE_NAME}: Full grove name
	 * - ${GROVE_NAME_SHORT}: Shortened grove name (max 10 chars)
	 * When set, these templates will be used instead of global templates from settings.
	 */
	claudeSessionTemplates?: ClaudeSessionTemplates;
}

/**
 * Workspace configuration stored in .grove.workspace.json
 * Defines a localized grove workspace with its own repositories and groves
 */
export interface WorkspaceConfig {
	/**
	 * Workspace name (for display and tracking)
	 */
	name: string;
	/**
	 * Version of the workspace config format
	 */
	version: string;
	/**
	 * Path to folder where groves are stored (relative to workspace root or absolute)
	 * Default: "./groves"
	 */
	grovesFolder: string;
}

/**
 * Reference to a workspace stored in global ~/.grove/workspaces.json
 * Used to track all available workspaces on the system
 */
export interface WorkspaceReference {
	/**
	 * Workspace name
	 */
	name: string;
	/**
	 * Absolute path to workspace root (where .grove.workspace.json is located)
	 */
	path: string;
	/**
	 * Timestamp when the workspace was last used/accessed
	 */
	lastUsedAt: string;
}

/**
 * Global workspace tracking stored in ~/.grove/workspaces.json
 */
export interface WorkspacesData {
	/**
	 * List of workspace references
	 */
	workspaces: WorkspaceReference[];
}

/**
 * Resolved workspace context
 * Represents either a workspace or global context
 */
export interface WorkspaceContext {
	/**
	 * Type of context: 'workspace' or 'global'
	 */
	type: 'workspace' | 'global';
	/**
	 * Workspace configuration (only when type is 'workspace')
	 */
	config?: WorkspaceConfig;
	/**
	 * Absolute path to workspace root (only when type is 'workspace')
	 */
	workspacePath?: string;
	/**
	 * Absolute path to .grove folder (workspace/.grove or ~/.grove)
	 */
	groveFolder: string;
	/**
	 * Absolute path to groves storage folder
	 * For workspace: resolved from workspace config's grovesFolder
	 * For global: from settings.workingFolder
	 */
	grovesFolder?: string;
}

/**
 * AI Agent Types
 * Supported AI coding assistants that can report session status to Grove
 */
export type AgentType = 'claude' | 'gemini' | 'codex' | 'custom';

/**
 * Session Status
 * Represents the current state of an AI agent session
 * - active: Agent is currently processing/working
 * - idle: Waiting for user input (session still running)
 * - attention: Needs user action (permission, input, etc.)
 * - closed: Session has been closed/terminated (SessionEnd fired)
 * - error: Session encountered an error
 */
export type SessionStatus = 'active' | 'idle' | 'attention' | 'closed' | 'error';

/**
 * Individual AI agent session
 * Tracks a single AI coding session within a workspace/grove
 */
export interface AgentSession {
	/** Unique session identifier (UUID or agent-specific ID) */
	sessionId: string;
	/** Which AI agent is running this session */
	agentType: AgentType;
	/** Which grove this session belongs to (null if not in a grove) */
	groveId: string | null;
	/** Absolute path where session is running */
	workspacePath: string;
	/** Specific worktree path if applicable */
	worktreePath: string | null;
	/** Current session status */
	status: SessionStatus;
	/** Last update timestamp (ISO format) */
	lastUpdate: string;
	/** Whether the process is currently running */
	isRunning: boolean;
	/** Additional agent-specific metadata */
	metadata?: {
		/** Git branch */
		branch?: string;
		/** Project name for display */
		projectName?: string;
		/** When session started (ISO timestamp) */
		startedAt?: string;
		/** Last user/agent activity (ISO timestamp) */
		lastActivity?: string;
		/** Agent-specific data */
		[key: string]: unknown;
	};
}

/**
 * Session index grouped by workspace for fast lookup
 * Provides multiple ways to query sessions efficiently
 */
export interface SessionsIndex {
	/** Sessions indexed by workspace path */
	byWorkspace: Record<string, AgentSession[]>;
	/** Sessions indexed by grove ID */
	byGrove: Record<string, AgentSession[]>;
	/** Sessions indexed by session ID */
	bySessionId: Record<string, AgentSession>;
	/** When the index was last cleaned up */
	lastCleanup: string;
}

/**
 * Sessions data file structure
 * Stored in ~/.grove/sessions.json
 */
export interface SessionsData {
	/** List of all tracked sessions */
	sessions: AgentSession[];
	/** Data format version for future migrations */
	version: string;
	/** When the file was last updated (ISO timestamp) */
	lastUpdated: string;
}

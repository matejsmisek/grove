# CLAUDE.md - AI Assistant Guide for Grove

This document provides comprehensive information about the Grove codebase for AI assistants working on this project.

## Project Overview

**Grove** is a Git management CLI application powered by AI, built with modern web technologies adapted for terminal interfaces. It provides an interactive, Claude-like chat interface for managing Git operations through natural language.

### Key Features

- **Interactive CLI interface** with navigation-based UI
- **Grove Management**: Create, manage, and close collections of git worktrees (called "groves")
- **Repository Tracking**: Register and track git repositories (including monorepo support)
- **Monorepo Support**: Select specific project folders within monorepos for grove creation
- **Persistent Storage**: JSON-based storage in `~/.grove` for settings, repositories, and groves
- **Git Worktree Operations**: Create, list, and manage git worktrees via GitService
- **Grove Repository Configuration**: Per-repo `.grove.json` for branch naming and file copying
- **Open in Terminal**: Launch terminal windows for grove worktrees
- **Open in IDE**: Launch IDEs (VS Code, PhpStorm, WebStorm, IntelliJ, PyCharm, Vim) for worktrees
- **JetBrains Auto-Detect**: Automatically select appropriate JetBrains IDE based on project files
- **Multi-Screen Navigation**: Home, Chat, Create Grove, Settings, Grove Detail, and more (10 screens)
- **Dependency Injection**: Testable architecture with DI container and service interfaces
- **Command-Line Interface**: Support for CLI commands like `grove --register`
- Built on React and Ink for terminal-based UI

### Project Metadata

- **Name**: grove
- **Version**: 0.0.1
- **License**: MIT
- **Node Version**: >=18.0.0
- **Type**: ES Module (ESM)

## Technology Stack

### Core Technologies

- **TypeScript** (v5.9.3) - Type-safe JavaScript with strict mode enabled
- **React** (v19.2.0) - UI library for component-based architecture
- **Ink** (v6.5.1) - React renderer for CLI applications
- **ink-text-input** (v6.0.0) - Text input component for Ink

### Development Tools

- **ESLint** (v9.39.1) - Code linting with typescript-eslint plugin
- **Prettier** (v3.6.2) - Code formatting with import sorting
- **Husky** (v9.1.7) - Git hooks management
- **lint-staged** (v16.2.7) - Run linters on staged files
- **TypeScript Compiler** - Builds and type-checks the codebase
- **tsx** - TypeScript execution for development

## Codebase Structure

```
grove/
├── src/                    # Source files (~7,300 lines total)
│   ├── commands/          # Command handlers
│   │   ├── index.ts       # Command exports
│   │   ├── register.ts    # Repository registration command
│   │   └── types.ts       # Command type definitions
│   ├── components/        # UI components
│   │   ├── home/          # Home screen components
│   │   │   ├── CreateGrovePanel.tsx  # Create grove button panel
│   │   │   ├── GroveActionsModal.tsx # Grove actions menu modal
│   │   │   ├── GroveGrid.tsx         # Grid layout for groves
│   │   │   ├── GrovePanel.tsx        # Individual grove display
│   │   │   └── MenuModal.tsx         # General menu modal
│   │   ├── types.ts       # Shared TypeScript interfaces
│   │   ├── App.tsx        # Main application component
│   │   ├── StatusBar.tsx  # Status bar component
│   │   ├── MessageList.tsx # Message list component
│   │   └── InputPrompt.tsx # Input prompt component
│   ├── di/                # Dependency injection system
│   │   ├── Container.ts   # DI container implementation
│   │   ├── ServiceContext.tsx # React integration (useService hook)
│   │   ├── types.ts       # ServiceToken, IContainer interfaces
│   │   └── index.ts       # DI exports
│   ├── git/              # Git utilities
│   │   ├── index.ts       # Git utility exports
│   │   └── utils.ts       # Git helper functions (isGitRepo, getGitRoot, getMonorepoProjects)
│   ├── navigation/        # Navigation system
│   │   ├── NavigationContext.tsx  # Navigation context provider
│   │   ├── Router.tsx     # Screen router component
│   │   ├── types.ts       # Navigation type definitions
│   │   └── useNavigation.ts # Navigation hook
│   ├── screens/           # Screen components (10 screens)
│   │   ├── HomeScreen.tsx        # Home/welcome screen with grove grid
│   │   ├── ChatScreen.tsx        # AI chat interface screen
│   │   ├── CreateGroveScreen.tsx # Grove creation with monorepo support
│   │   ├── GroveDetailScreen.tsx # Grove detail view with git status
│   │   ├── CloseGroveScreen.tsx  # Grove closing confirmation
│   │   ├── OpenTerminalScreen.tsx # Terminal launcher for worktrees
│   │   ├── OpenIDEScreen.tsx     # IDE launcher for worktrees
│   │   ├── IDESettingsScreen.tsx # IDE configuration screen
│   │   ├── SettingsScreen.tsx    # Settings management screen
│   │   ├── WorkingFolderScreen.tsx # Working folder configuration
│   │   └── RepositoriesScreen.tsx # Repository list screen
│   ├── services/          # Service layer (business logic)
│   │   ├── GitService.ts      # Git worktree operations
│   │   ├── GroveService.ts    # Grove lifecycle (create/close)
│   │   ├── ContextService.ts  # CONTEXT.md file management
│   │   ├── FileService.ts     # File operations with glob patterns
│   │   ├── TerminalService.ts # Terminal detection and launching
│   │   ├── IDEService.ts      # IDE detection and launching
│   │   ├── interfaces.ts      # Service interface definitions
│   │   ├── tokens.ts          # DI service tokens
│   │   ├── registration.ts    # Service registration for DI
│   │   ├── types.ts           # Service type definitions
│   │   └── index.ts           # Service exports
│   ├── storage/           # Persistent storage layer
│   │   ├── SettingsService.ts    # Settings service (DI-compatible)
│   │   ├── RepositoryService.ts  # Repository service (DI-compatible)
│   │   ├── GrovesService.ts      # Groves service (DI-compatible)
│   │   ├── GroveConfigService.ts # Grove repo config reader
│   │   ├── storage.ts         # Legacy settings storage functions
│   │   ├── repositories.ts    # Legacy repository functions
│   │   ├── groves.ts          # Legacy grove functions
│   │   ├── groveConfig.ts     # Grove config reading (legacy)
│   │   ├── recentSelections.ts # Recent project selections
│   │   ├── types.ts           # Storage type definitions
│   │   └── index.ts           # Storage exports
│   ├── utils/             # Utility functions
│   │   └── time.ts        # Time formatting utilities
│   └── index.tsx          # Entry point - CLI arg parsing and app bootstrap
├── .github/
│   └── workflows/
│       └── ci.yml         # GitHub Actions CI workflow
├── .husky/
│   └── pre-commit         # Pre-commit hook (runs lint-staged + typecheck)
├── dist/                   # Compiled output (ignored by git)
├── node_modules/          # Dependencies (ignored by git)
├── package.json           # Project metadata and scripts
├── package-lock.json      # Locked dependency versions
├── tsconfig.json          # TypeScript configuration
├── eslint.config.js       # ESLint configuration
├── .prettierrc            # Prettier configuration
├── .prettierignore        # Prettier ignore patterns
├── .lintstagedrc.json     # lint-staged configuration
├── .gitignore            # Git ignore patterns
├── CLAUDE.md             # AI assistant guide (this file)
└── README.md             # User-facing documentation
```

### Current Codebase Size

- **Total Lines**: ~7,300 lines across TypeScript and TSX files
- **Screens**: 10 screen components
- **Services**: 6 service classes with DI support
- **Modules**: 10 major modules (commands, components, di, git, navigation, screens, services, storage, utils, index)
- **Architecture**: Modular architecture with dependency injection for testability

## Key Files and Their Purposes

### Entry Point

#### src/index.tsx

**Purpose**: Application entry point, CLI argument parsing, and bootstrapping

**Key Responsibilities**:

- Initialize storage system (`initializeStorage()`)
- Parse command-line arguments (e.g., `--register`)
- Handle CLI commands before launching UI
- Render the main App component for interactive mode

**Features**:

- Shebang for CLI execution (`#!/usr/bin/env node`)
- Command-line flag handling (`grove --register`)
- Storage initialization on startup

### Storage Layer (`src/storage/`)

The storage layer provides persistent JSON-based storage in `~/.grove` for all Grove data.

#### src/storage/types.ts

**Purpose**: Type definitions for storage data structures

**Key Types**:

- `Settings` - User settings (workingFolder, terminal, selectedIDE, ideConfigs)
- `StorageConfig` - Storage paths configuration
- `Repository` - Registered repository metadata (including `isMonorepo` flag)
- `RepositoriesData` - Repository list container
- `RepositorySelection` - Repository + optional project path for monorepos
- `Worktree` - Worktree metadata (path, branch, repository, projectPath)
- `GroveReference` - Global grove index entry
- `GrovesIndex` - Global list of all groves
- `GroveMetadata` - Grove-specific data (worktrees, timestamps)
- `GroveRepoConfig` - Per-repo `.grove.json` configuration (branchNameTemplate, fileCopyPatterns)
- `RecentSelection` - Recently used repository/project selection
- `TerminalConfig` - Terminal command and arguments
- `IDEType` / `IDEConfig` - IDE configuration types

#### src/storage/storage.ts

**Purpose**: Settings management in `~/.grove/settings.json`

**Key Functions**:

- `getStorageConfig()` - Get storage paths (~/.grove/settings.json, etc.)
- `getDefaultSettings()` - Default settings (workingFolder: ~/grove-worktrees)
- `initializeStorage()` - Create .grove folder structure
- `readSettings()` / `writeSettings()` - Settings persistence
- `updateSettings()` - Partial settings updates

#### src/storage/repositories.ts

**Purpose**: Repository tracking in `~/.grove/repositories.json`

**Key Functions**:

- `readRepositories()` / `writeRepositories()` - Repository list persistence
- `addRepository()` - Register a new repository
- `removeRepository()` - Unregister a repository
- `isRepositoryRegistered()` - Check if repository exists
- `getAllRepositories()` - Get all registered repositories

#### src/storage/groves.ts

**Purpose**: Grove management (groves.json index + per-grove grove.json files) - Legacy functions

**Key Functions**:

- `readGrovesIndex()` / `writeGrovesIndex()` - Global grove list (~/.grove/groves.json)
- `readGroveMetadata()` / `writeGroveMetadata()` - Per-grove metadata (grove-folder/grove.json)
- `getAllGroves()` - Get all grove references
- `getGroveById()` - Find grove by ID
- `deleteGrove()` - Remove grove from index (optionally delete folder)

**Note**: Grove creation logic has been moved to `GroveService` for better testability.

#### src/storage/GroveConfigService.ts

**Purpose**: Read `.grove.json` and `.grove.local.json` from repositories for custom configuration

**Key Methods**:

- `readGroveRepoConfig()` - Read and merge .grove.json configs
- `readMergedConfig()` - Merge root and project-level configs (for monorepos)
- `getBranchNameForSelection()` - Get branch name with template substitution
- `applyBranchNameTemplate()` - Replace `${GROVE_NAME}` in templates

**Configuration Options** (in `.grove.json`):

- `branchNameTemplate` - Custom branch naming (e.g., `"grove/${GROVE_NAME}"`)
- `fileCopyPatterns` - Glob patterns for files to copy to worktrees
- `initActions` - Post-creation actions (not yet implemented)

#### src/storage/recentSelections.ts

**Purpose**: Track recently used repository/project selections for quick access

**Key Functions**:

- `addRecentSelections()` - Save selections after grove creation
- `getRecentSelections()` - Get recent selections (filtered to valid repos)
- `getRecentSelectionDisplayName()` - Format selection for display

### Git Layer (`src/git/`)

#### src/git/utils.ts

**Purpose**: Git repository validation, detection, and monorepo utilities

**Key Functions**:

- `isGitRepository()` - Check if directory is inside a git repo
- `isGitWorktree()` - Detect if directory is a worktree (not main repo)
- `getGitRoot()` - Get repository root path
- `verifyValidRepository()` - Validate repo is not a worktree (for registration)
- `getMonorepoProjects()` - List project folders in a monorepo (filters out common non-project dirs)

**Uses**: `execSync` from child_process for git command execution

### Services Layer (`src/services/`)

The services layer uses **dependency injection** for testability. Services implement interfaces defined in `interfaces.ts` and are registered via tokens in `tokens.ts`.

#### src/services/GitService.ts

**Purpose**: Git worktree operations via spawn

**Key Features**:

- Async git command execution using spawn
- Structured result objects with stdout/stderr/exitCode
- Comprehensive worktree management
- Git status queries for grove detail view

**Key Methods**:

- `addWorktree(repoPath, worktreePath, branch?, commitish?)` - Create new worktree
- `listWorktrees(repoPath, porcelain?)` - List all worktrees
- `parseWorktreeList()` - Parse porcelain output into structured data
- `removeWorktree(repoPath, worktreePath, force?)` - Delete worktree
- `pruneWorktrees(repoPath)` - Clean up stale worktree metadata
- `lockWorktree()` / `unlockWorktree()` - Lock management
- `moveWorktree(repoPath, worktreePath, newPath)` - Relocate worktree
- `hasUncommittedChanges(repoPath)` - Check for dirty working tree
- `hasUnpushedCommits(repoPath)` - Check for unpushed commits
- `getCurrentBranch(repoPath)` - Get current branch name
- `getFileChangeStats(repoPath)` - Get modified/added/deleted/untracked counts

**Types** (in `interfaces.ts`):

- `GitCommandResult` - Command execution result
- `WorktreeInfo` - Parsed worktree information
- `FileChangeStats` - File change counts

#### src/services/GroveService.ts

**Purpose**: Grove lifecycle operations (create and close)

**Key Features**:

- Orchestrates grove creation with multiple worktrees
- Handles monorepo project selections
- Copies files based on `.grove.json` patterns
- Cleans up worktrees when closing groves

**Key Methods**:

- `createGrove(name, selections)` - Create grove with worktrees for selected repos/projects
- `closeGrove(groveId)` - Remove worktrees and delete grove folder

**Dependencies** (via DI):

- `ISettingsService`, `IGrovesService`, `IGroveConfigService`
- `IGitService`, `IContextService`, `IFileService`

#### src/services/ContextService.ts

**Purpose**: CONTEXT.md file management for groves

**Key Methods**:

- `generateContent(data)` - Generate markdown content
- `createContextFile(grovePath, data)` - Create CONTEXT.md in grove folder
- `contextFileExists(grovePath)` - Check if file exists
- `readContextFile(grovePath)` - Read raw content

#### src/services/FileService.ts

**Purpose**: File operations with glob pattern matching

**Key Methods**:

- `matchPattern(sourceDir, pattern)` - Find files matching a glob pattern
- `matchPatterns(sourceDir, patterns)` - Match multiple patterns
- `copyFilesFromPatterns(sourceDir, destDir, patterns)` - Copy files matching patterns
- `copyFile(sourceDir, destDir, relativeFilePath)` - Copy single file preserving structure

**Dependencies**: Uses `minimatch` for glob pattern matching

#### src/services/TerminalService.ts

**Purpose**: Terminal detection and launching for worktrees

**Key Features**:

- Auto-detects available terminal emulators
- Supports gnome-terminal, konsole, xfce4-terminal, xterm
- Spawns terminal windows in specified directories

**Key Methods**:

- `detectTerminal()` - Find available terminal emulator
- `openTerminal(path, config)` - Open terminal in directory
- `getTerminalDisplayName(config)` - Get human-readable terminal name

#### src/services/IDEService.ts

**Purpose**: IDE detection, auto-detection, and launching for worktrees

**Key Features**:

- Supports VS Code, PhpStorm, WebStorm, IntelliJ IDEA, PyCharm, Vim
- Auto-detects installed IDEs
- **JetBrains Auto-Detect**: Automatically selects appropriate JetBrains IDE based on project files
- Configurable command and arguments per IDE

**JetBrains Auto-Detection Strategy**:

1. Config file detection (highest priority):
   - `composer.json` → PhpStorm
   - `requirements.txt`, `pyproject.toml`, `setup.py`, `Pipfile` → PyCharm
   - `pom.xml`, `build.gradle`, `build.gradle.kts` → IntelliJ IDEA
   - `package.json` → WebStorm
2. File extension counting (fallback): counts `.php`, `.py`, `.java`/`.kt`, `.js`/`.ts` files
3. Default: IntelliJ IDEA

**Key Methods**:

- `detectAvailableIDEs()` - Find installed IDEs (includes `jetbrains-auto` if any JetBrains IDE available)
- `detectJetBrainsIDE(projectPath)` - Detect best JetBrains IDE for a project
- `resolveIDEForPath(ideType, projectPath, customConfigs?)` - Resolve IDE type and config (handles auto-detection)
- `getDefaultIDEConfig(ideType)` - Get default IDE configuration
- `getEffectiveIDEConfig(ideType, customConfigs?)` - Get effective config with custom overrides
- `openIDEInPath(path, config)` - Open IDE in directory

**Types**:

- `IDEType` - Union type including `'jetbrains-auto'`
- `ResolvedIDEConfig` - Result of resolving jetbrains-auto to specific IDE

#### src/services/interfaces.ts

**Purpose**: Service interface definitions for dependency injection

**Key Interfaces**:

- `ISettingsService` - Settings management
- `IRepositoryService` - Repository registry
- `IGrovesService` - Grove index and metadata
- `IGroveConfigService` - Repository .grove.json configuration
- `IGitService` - Git worktree operations
- `IContextService` - CONTEXT.md management
- `IFileService` - File operations
- `IGroveService` - Grove lifecycle

#### src/services/tokens.ts

**Purpose**: DI service tokens for type-safe dependency resolution

**Tokens**:

- `SettingsServiceToken`, `RepositoryServiceToken`, `GrovesServiceToken`
- `GroveConfigServiceToken`, `GitServiceToken`, `ContextServiceToken`
- `FileServiceToken`, `GroveServiceToken`

### Commands Layer (`src/commands/`)

#### src/commands/register.ts

**Purpose**: Repository registration command handler

**Key Function**:

- `registerRepository(cwd?)` - Register current directory as repository
  - Verifies it's a valid git repository (not worktree)
  - Checks if already registered
  - Adds to repository list
  - Returns structured result

**Result Type**: `RegisterResult` - success flag, message, optional path

### Navigation Layer (`src/navigation/`)

#### src/navigation/types.ts

**Purpose**: Type-safe navigation definitions

**Key Types**:

- `Routes` - Map of screen names to their params
- `NavigationState` - Current screen and params
- `NavigationContextType` - Navigation context interface

**Screens**:

- `home` - Home screen (no params)
- `chat` - Chat screen (no params)
- `createGrove` - Grove creation (no params)
- `groveDetail` - Grove detail view (groveId param)
- `closeGrove` - Grove closing confirmation (groveId param)
- `openTerminal` - Terminal launcher (groveId param)
- `openIDE` - IDE launcher (groveId param)
- `settings` - Settings screen (optional section param)
- `workingFolder` - Working folder config (no params)
- `repositories` - Repository list (no params)
- `ideSettings` - IDE configuration (no params)

#### src/navigation/NavigationContext.tsx

**Purpose**: Navigation state management via React Context

**Provides**:

- Navigation state (current screen and params)
- Navigation history stack
- `navigate()` - Navigate to screen with params
- `goBack()` - Navigate to previous screen
- `canGoBack` - Check if history exists

#### src/navigation/useNavigation.ts

**Purpose**: Navigation hook for consuming navigation context

**Usage**: `const { navigate, goBack, current } = useNavigation()`

#### src/navigation/Router.tsx

**Purpose**: Route screen components based on navigation state

**Functionality**:

- Renders appropriate screen component based on `current.screen`
- Passes params to screens
- Centralized screen routing logic

### Dependency Injection Layer (`src/di/`)

The DI layer provides a lightweight dependency injection container for testable, loosely-coupled code.

#### src/di/Container.ts

**Purpose**: DI container implementation

**Key Features**:

- Type-safe service resolution via tokens
- Singleton and transient service lifetimes
- Factory-based service creation

**Key Functions**:

- `Container` class with `register()`, `registerSingleton()`, `registerTransient()`, `registerInstance()`
- `resolve<T>(token)` - Get service instance
- `getContainer()` / `setContainer()` / `resetContainer()` - Global container management

#### src/di/ServiceContext.tsx

**Purpose**: React integration for DI container

**Key Exports**:

- `ServiceProvider` - React context provider component
- `useService(token)` - Hook to resolve a service
- `useServices(...tokens)` - Hook to resolve multiple services
- `useContainer()` - Hook to access the container directly
- `useHasService(token)` - Check if service is registered

**Usage Pattern**:

```typescript
// In component
const gitService = useService(GitServiceToken);
const [settings, repos] = useServices(SettingsServiceToken, RepositoryServiceToken);
```

#### src/di/types.ts

**Purpose**: DI type definitions

**Key Types**:

- `ServiceToken<T>` - Branded token type for type-safe resolution
- `ServiceFactory<T>` - Factory function type
- `ServiceRegistration<T>` - Registration options
- `IContainer` / `IMutableContainer` - Container interfaces

### Components Layer (`src/components/`)

#### src/components/App.tsx

**Purpose**: Root application component

**Key Responsibilities**:

- Wraps app in `ServiceProvider` for dependency injection
- Wraps app in `NavigationProvider` for routing
- Renders StatusBar and Router
- Sets up main layout with flexbox column

#### src/components/StatusBar.tsx

**Purpose**: Application status bar

**Props**: `isProcessing: boolean`

**Features**:

- Grove branding
- Processing indicator (● active, ○ ready)
- Color-coded status (yellow/green)

#### src/components/MessageList.tsx

**Purpose**: Chat message history display

**Props**: `messages: Message[]`

**Features**:

- Role-based styling (user/assistant/system)
- Scrollable message list
- Line-by-line message rendering

#### src/components/InputPrompt.tsx

**Purpose**: Text input component

**Props**: `isProcessing`, `input`, `onInputChange`, `onSubmit`

**Features**:

- Disabled during processing
- Submit on Enter
- Placeholder text

#### src/components/types.ts

**Purpose**: Shared component types

**Exports**: `Message` interface (role, content)

### Home Components (`src/components/home/`)

Extracted components for the home screen panel layout:

- **`CreateGrovePanel.tsx`** - "Create Grove" button panel in grove grid
- **`GroveActionsModal.tsx`** - Actions menu for a selected grove (detail, terminal, IDE, close)
- **`GroveGrid.tsx`** - Grid layout for displaying groves
- **`GrovePanel.tsx`** - Individual grove card with name and timestamp
- **`MenuModal.tsx`** - General modal for menu overlays

### Screens Layer (`src/screens/`)

The screens layer contains the 10 main screen components that make up the Grove UI. Each screen is a full-page view that users navigate between.

**Screens**:

- `HomeScreen.tsx` - Home screen with grove grid and panel layout
- `ChatScreen.tsx` - AI chat interface (uses MessageList, InputPrompt)
- `CreateGroveScreen.tsx` - Grove creation wizard with monorepo project selection
- `GroveDetailScreen.tsx` - Grove detail view showing worktrees and git status
- `CloseGroveScreen.tsx` - Grove closing confirmation with worktree cleanup
- `OpenTerminalScreen.tsx` - Terminal launcher for grove worktrees
- `OpenIDEScreen.tsx` - IDE launcher for grove worktrees
- `IDESettingsScreen.tsx` - IDE configuration (select default IDE)
- `SettingsScreen.tsx` - Settings management hub
- `WorkingFolderScreen.tsx` - Working folder configuration
- `RepositoriesScreen.tsx` - Repository list and management (with monorepo toggle)

**Common Patterns**:

- Use `useNavigation()` hook for navigation
- Use `useService()` hook for dependency injection
- Full-screen Box layouts
- Consistent keyboard shortcuts
- Error handling and user feedback

### package.json

Defines project configuration, dependencies, and npm scripts.

### tsconfig.json

**Key Configuration**:

- Target: ES2022
- Module: ESNext with Bundler resolution
- Strict mode enabled (all strict flags on)
- JSX: react-jsx with React import source
- Source maps and declaration files enabled
- Root: ./src, Out: ./dist

### eslint.config.js

**Key Rules**:

- Based on recommended configs from @eslint/js and typescript-eslint
- Integrates with Prettier via `eslint-config-prettier` (disables conflicting rules)
- Unused vars allowed with `_` prefix (argsIgnorePattern, varsIgnorePattern)
- Explicit function return types: OFF
- Explicit module boundary types: OFF
- no-explicit-any: WARN (not error)

### .prettierrc

**Key Configuration**:

- Single quotes, semicolons, tabs (tabWidth: 1)
- 100 character line width
- ES5 trailing commas
- Import sorting via `@trivago/prettier-plugin-sort-imports`
- Import order: React → Ink → Third-party → @/ paths → Relative imports
- Automatic import separation and sorting

### .lintstagedrc.json

**Configuration**:

- TypeScript/JavaScript files: Run Prettier, then ESLint (both with auto-fix)
- JSON/Markdown/YAML files: Run Prettier only
- Only processes staged files for performance

## Development Workflows

### Setup

```bash
npm install
```

### Available Scripts

| Command                | Purpose                        | When to Use                                |
| ---------------------- | ------------------------------ | ------------------------------------------ |
| `npm run build`        | Compile TypeScript to dist/    | Before testing final build, before commits |
| `npm run dev`          | Watch mode compilation         | During active development                  |
| `npm run lint`         | Check for linting errors       | Before commits, in CI                      |
| `npm run lint:fix`     | Auto-fix linting issues        | When linting errors occur                  |
| `npm run format`       | Format all files with Prettier | After making changes                       |
| `npm run format:check` | Check if files are formatted   | To verify formatting without changes       |
| `npm run typecheck`    | Type-check without emitting    | Quick validation without build             |

### Development Cycle

1. Make changes to TypeScript files in `src/`
2. Run `npm run dev` for automatic compilation
3. Test the CLI: `node dist/index.js` or `npm link` + `grove`
4. **MANDATORY**: Run checks on changed files (see "Mandatory Quality Checks" below)
5. Fix any TypeScript or ESLint errors
6. Build final output with `npm run build`
7. Commit changes (pre-commit hook will automatically run checks)

### Mandatory Quality Checks After Making Changes

**CRITICAL**: AI assistants MUST run these checks after making any code changes:

1. **Run ESLint on changed files**:

   ```bash
   npx eslint path/to/changed/file.ts
   ```

   Or for multiple files:

   ```bash
   npx eslint src/components/App.tsx src/components/StatusBar.tsx
   ```

2. **Run TypeScript type check**:
   ```bash
   npm run typecheck
   ```

**Why This Is Mandatory**:

- Pre-commit hooks will block commits if checks fail
- CI will fail if code doesn't pass checks
- Ensures code quality before committing
- Catches errors early in the development process

**When to Run**:

- After editing any TypeScript/JavaScript file
- Before attempting to commit
- After adding or modifying imports
- After changing type definitions

**What the Checks Do**:

- **ESLint**: Catches code style issues, potential bugs, and anti-patterns
- **TypeScript**: Validates types, catches type errors, ensures type safety

**Note**: The pre-commit hook (managed by Husky) will automatically run:

- `lint-staged` (Prettier + ESLint on staged files with auto-fix)
- `npm run typecheck` (full TypeScript check)

However, AI assistants should run these checks manually during development to catch issues early.

## Code Conventions and Standards

### TypeScript Standards

- **Strict Mode**: All strict type checking enabled
- **Explicit Types**: Prefer explicit type annotations for clarity
- **Interfaces**: Use interfaces for object shapes (see `Message` interface)
- **Function Components**: Use arrow functions for React components
- **Hooks**: Follow React hooks rules (useState, useEffect, etc.)

### Naming Conventions

- **Components**: PascalCase (e.g., `App`, `StatusBar`)
- **Functions**: camelCase (e.g., `handleSubmit`, `setMessages`)
- **Interfaces**: PascalCase with descriptive names (e.g., `Message`)
- **Constants**: UPPER_SNAKE_CASE for true constants
- **Variables**: camelCase (e.g., `isProcessing`, `userMessage`)

### Code Style

- **Indentation**: Tabs (configured in Prettier)
- **Quotes**: Single quotes for strings
- **Semicolons**: Required (enforced by TypeScript and Prettier)
- **Line Length**: 100 characters (enforced by Prettier)
- **Trailing Commas**: ES5 style (enforced by Prettier)
- **Arrow Functions**: Always use parentheses around params (enforced by Prettier)
- **Unused Variables**: Prefix with `_` if intentionally unused
- **Import Order**: Automatically sorted by Prettier plugin (React → Ink → Third-party → Local)

**Note**: Code formatting is automatically handled by Prettier. Don't worry about manual formatting - the pre-commit hook will format code automatically.

### React/Ink Patterns

- **State Management**: Use `useState` for component state
- **Layout**: Use Ink's `Box` component for flexbox-like layouts
- **Styling**: Inline props (borderStyle, borderColor, paddingX, etc.)
- **Colors**: Use Ink's color props (cyan, blue, green, yellow, gray)
- **Text Formatting**: Use `Text` component with color and bold props

### Component Structure Pattern

```typescript
function ComponentName() {
  // 1. State declarations
  const [state, setState] = useState(initialValue);

  // 2. Event handlers
  const handleEvent = (value: string) => {
    // handler logic
  };

  // 3. Return JSX
  return (
    <Box>
      {/* component structure */}
    </Box>
  );
}
```

## Git Workflow

### Branch Strategy

- **Feature Branches**: Created with prefix `claude/` for AI assistant work
- **Branch Naming**: Format: `claude/claude-md-{identifier}-{sessionId}`
- **Main Branch**: Not explicitly set in current repo state

### Commit Standards

- Use descriptive commit messages
- Reference PR numbers in merge commits (see: #1, #2)
- Group related changes together
- Keep commits atomic and focused
- **NEVER amend commits** - Always create new commits instead of using `git commit --amend`
  - This ensures a complete and accurate history of all changes
  - Amending commits can cause issues with collaboration and CI/CD pipelines
  - If you need to fix or update a previous commit, create a new commit with the changes

### Recent Development History

1. **Initial commit** (0eb29ef) - Repository setup
2. **PR #1** (8e9b4b3) - TypeScript and ESLint environment
3. **PR #2** (638421f) - Claude-like Ink UI implementation
4. **Component Refactoring** (b186b3f) - Modular component structure with separate files
5. **PR #7** (d3d45ea) - Add persistent storage with JSON settings
6. **PR #8** (767ad37) - Add GitService for git worktree operations
7. **PR #9** (a0c86fd) - Add repository tracking to Grove storage
8. **PR #10** (ce8a45f) - Update commit guidelines to prohibit amending commits
9. **PR #11** (cbd3121) - Introduce grove core tracking system
10. **PR #13** (32b889f) - Add grove repository configuration support (.grove.json)
11. **PR #14** (345fbd2) - Redesign home screen with panel layout
12. **PR #15** (d93cd84) - Add function to close a grove
13. **PR #16** (c38dd50) - Refactor HomeScreen by extracting components
14. **PR #17** (e9f1fd9) - Add copyFiles setting for grove creation
15. **PR #18** (cfce720) - Refactor grove create function out of storage (GroveService)
16. **PR #19** (b850012) - Organize TypeScript interfaces and types
17. **PR #20** (f3a0472) - Add dependency injection for better testability
18. **PR #21** (867850c) - Add monorepo support with project folders
19. **PR #22** (55489da) - Add Open in Terminal option
20. **PR #23** (99d2c20) - Enhance grove detail screen with contextual information
21. **PR #24** (560dcab) - Add Create Grove button as first item in grove grid
22. **PR #25** (b4a8f34) - Add monorepo grove.json support for project-level config
23. **PR #26** (c2d98d4) - Add Open in IDE feature for worktrees

## Testing and Quality Assurance

### Current State

- **No test framework** installed yet
- **No test files** present
- **Type checking** via TypeScript compiler
- **Linting** via ESLint
- **Code formatting** via Prettier
- **Pre-commit hooks** via Husky and lint-staged
- **CI/CD** via GitHub Actions

### Quality Checks Before Committing

**Manual Checks (Run During Development)**:

1. `npx eslint <changed-files>` - Check changed files for linting errors
2. `npm run typecheck` - Ensure no TypeScript errors
3. `npm run build` - Ensure successful compilation
4. Manual testing of the CLI application

**Automatic Checks (Run on Commit)**:

The pre-commit hook automatically runs:

1. `lint-staged` - Prettier formatting + ESLint with auto-fix on staged files
2. `npm run typecheck` - Full TypeScript type check

**CI Checks (Run on Push/PR)**:

1. `npm run lint` - Full ESLint check
2. `npm run typecheck` - Full TypeScript type check
3. `npm run build` - Build verification

**Note**: Commits will be blocked if any automatic checks fail. Fix errors before committing.

## Common Development Tasks

### Adding a New Feature

1. Create a feature branch (or use assigned Claude branch)
2. Identify if new files are needed or modifications to existing files
3. Follow React/Ink patterns for UI components
4. Update types/interfaces as needed
5. Test the feature in the CLI
6. **MANDATORY: Run ESLint on changed files** - `npx eslint <changed-files>`
7. **MANDATORY: Run typecheck** - `npm run typecheck`
8. Fix any errors found by ESLint or TypeScript
9. Commit changes (pre-commit hook will auto-format and run checks)
10. Push changes

### Modifying Different Parts of Grove

**UI Components**:

- **Status Bar**: Edit `src/components/StatusBar.tsx`
- **Message List/Response Area**: Edit `src/components/MessageList.tsx`
- **Input Prompt**: Edit `src/components/InputPrompt.tsx`
- **Message Types**: Edit `src/components/types.ts`
- **Main App Layout**: Edit `src/components/App.tsx`
- **Home Components**: Edit files in `src/components/home/`

**Screens**:

- **Home Screen**: Edit `src/screens/HomeScreen.tsx`
- **Chat Screen**: Edit `src/screens/ChatScreen.tsx`
- **Create Grove**: Edit `src/screens/CreateGroveScreen.tsx`
- **Grove Detail**: Edit `src/screens/GroveDetailScreen.tsx`
- **Close Grove**: Edit `src/screens/CloseGroveScreen.tsx`
- **Open Terminal**: Edit `src/screens/OpenTerminalScreen.tsx`
- **Open IDE**: Edit `src/screens/OpenIDEScreen.tsx`
- **IDE Settings**: Edit `src/screens/IDESettingsScreen.tsx`
- **Settings**: Edit `src/screens/SettingsScreen.tsx`
- **Working Folder**: Edit `src/screens/WorkingFolderScreen.tsx`
- **Repositories**: Edit `src/screens/RepositoriesScreen.tsx`

**Services** (business logic):

- **Git Operations**: Edit `src/services/GitService.ts`
- **Grove Lifecycle**: Edit `src/services/GroveService.ts`
- **Context Files**: Edit `src/services/ContextService.ts`
- **File Operations**: Edit `src/services/FileService.ts`
- **Terminal Launcher**: Edit `src/services/TerminalService.ts`
- **IDE Launcher**: Edit `src/services/IDEService.ts`
- **Service Interfaces**: Edit `src/services/interfaces.ts`
- **DI Tokens**: Edit `src/services/tokens.ts`
- **Service Registration**: Edit `src/services/registration.ts`

**Storage & Data**:

- **Settings Service**: Edit `src/storage/SettingsService.ts`
- **Repository Service**: Edit `src/storage/RepositoryService.ts`
- **Groves Service**: Edit `src/storage/GrovesService.ts`
- **Grove Config**: Edit `src/storage/GroveConfigService.ts`
- **Recent Selections**: Edit `src/storage/recentSelections.ts`
- **Storage Types**: Edit `src/storage/types.ts`
- **Legacy Functions**: Edit `src/storage/storage.ts`, `repositories.ts`, `groves.ts`

**Dependency Injection**:

- **DI Container**: Edit `src/di/Container.ts`
- **React Integration**: Edit `src/di/ServiceContext.tsx`
- **DI Types**: Edit `src/di/types.ts`

**Git Utilities**:

- **Git Utils**: Edit `src/git/utils.ts`

**Navigation**:

- **Navigation Context**: Edit `src/navigation/NavigationContext.tsx`
- **Router**: Edit `src/navigation/Router.tsx`
- **Navigation Types**: Edit `src/navigation/types.ts`

**Commands & CLI**:

- **Repository Registration**: Edit `src/commands/register.ts`
- **CLI Entry Point**: Edit `src/index.tsx`

**Utilities**:

- **Time Formatting**: Edit `src/utils/time.ts`

### Adding Dependencies

```bash
# Production dependency
npm install <package-name>

# Development dependency
npm install -D <package-name>
```

Always update package.json and commit package-lock.json.

### Code Organization Guidelines

Current organization follows a **modular, feature-based architecture with dependency injection**:

**Established Patterns**:

- **DI Layer** (`src/di/`) - Dependency injection container and React integration
- **Storage Layer** (`src/storage/`) - Persistence logic with DI-compatible service classes
- **Services Layer** (`src/services/`) - Business logic services (GitService, GroveService, etc.)
- **Commands Layer** (`src/commands/`) - CLI command handlers
- **Git Layer** (`src/git/`) - Git utility functions
- **Navigation Layer** (`src/navigation/`) - Screen routing and history
- **Screens Layer** (`src/screens/`) - Full-page screen components
- **Components Layer** (`src/components/`) - Reusable UI components with subdirectories
- **Utils Layer** (`src/utils/`) - General utility functions
- **Entry Point** (`src/index.tsx`) - CLI arg parsing and app bootstrap

**Architecture Principles**:

- **Dependency Injection**: Services use constructor injection for testability
- **Interface Segregation**: Services implement interfaces defined in `interfaces.ts`
- **Separation of Concerns**: Each layer has a specific responsibility
- **Type Safety**: Each module exports its types from a `types.ts` file or inline
- **Encapsulation**: Storage, git operations, and services are abstracted behind clean APIs
- **Modularity**: Each file/module has a single, focused purpose
- **Export Structure**: Use `index.ts` files to export public APIs from modules

**When Adding New Features**:

- **New Storage Service**: Create class in `src/storage/`, implement interface in `interfaces.ts`, register in `registration.ts`
- **New Business Service**: Create class in `src/services/`, implement interface, create token, register in container
- **New Screen**: Add to `src/screens/` and update Router + navigation types
- **New Command**: Add to `src/commands/` and update CLI parsing in index.tsx
- **Utility Functions**: Add to `src/utils/` or appropriate module
- **New Component**: Add to `src/components/` or appropriate subdirectory

## Important Notes for AI Assistants

### Project Context

- **Development Stage**: Active development (v0.0.1) with mature feature set
- **Git Integration**: ✅ Full GitService with worktree operations and status queries
- **Storage System**: ✅ Complete JSON-based persistence with DI-compatible services
- **Repository Tracking**: ✅ Register repositories with monorepo support
- **Grove Management**: ✅ Create, view details, and close groves with worktrees
- **Grove Configuration**: ✅ Per-repo `.grove.json` for branch naming and file copying
- **Monorepo Support**: ✅ Select specific project folders within monorepos
- **External Tools**: ✅ Open worktrees in terminal or IDE (VS Code, JetBrains with auto-detect, PyCharm, Vim)
- **Navigation**: ✅ 10-screen UI with type-safe routing
- **Dependency Injection**: ✅ DI container for testable architecture
- **AI Integration**: ⚠️ Chat screen exists but AI/LLM integration not yet connected
- **Architecture**: Mature modular structure with 10 distinct layers (~7,300 lines)

### Development Priorities

1. Maintaining type safety (strict TypeScript)
2. Following established patterns (React/Ink conventions)
3. Keeping code clean and linted
4. Building toward AI-powered Git operations

### When Making Changes

- **Always read** existing code before modifying
- **Preserve** the existing UI structure and patterns
- **Follow** the established naming conventions
- **Test** changes by running the compiled CLI
- **MANDATORY: Run ESLint on changed files** - `npx eslint <changed-files>`
- **MANDATORY: Run typecheck after changes** - `npm run typecheck`
- **Maintain** the modular component structure (one component per file)
- **Format code** with Prettier (automatic via pre-commit hook, or run `npm run format`)

**IMPORTANT**: These checks are not optional. The pre-commit hook will prevent commits if checks fail, and CI will fail if code doesn't pass validation.

### Code Style Preferences

- Use **tabs** for indentation (matching existing code)
- Use **single quotes** for strings
- Use **explicit types** for function parameters and return values
- Use **interfaces** for complex object types
- **Avoid** `any` types when possible (ESLint warns about them)

### Helpful Commands

```bash
# Build and test
npm run build && node dist/index.js

# Watch mode for active development
npm run dev

# MANDATORY: Check types after making changes
npm run typecheck

# MANDATORY: Check specific files with ESLint
npx eslint src/components/App.tsx src/components/StatusBar.tsx

# Fix linting issues automatically
npm run lint:fix

# Format all files with Prettier
npm run format

# Check if files are formatted
npm run format:check

# Run all checks (what pre-commit hook does)
npx lint-staged && npm run typecheck

# Install as global command for testing
npm link
grove
```

### Current Limitations to Be Aware Of

1. **No AI/LLM Integration**: Chat screen UI exists but not connected to actual LLM
2. **Limited CLI Commands**: Only `--register` flag implemented
3. **No Testing Framework**: No unit tests or integration tests yet (but DI enables easy mocking)
4. **No Git Operations in Chat**: Chat doesn't execute git commands yet
5. **Init Actions Not Implemented**: `.grove.json` `initActions` field is parsed but not executed

### Implemented Features (Recently Added)

✅ **Persistent Storage System** - JSON-based storage in ~/.grove with DI-compatible services
✅ **Repository Tracking** - Register and list repositories with monorepo flag
✅ **Monorepo Support** - Mark repos as monorepos, select specific project folders
✅ **Grove Creation** - Create collections of worktrees with project selection
✅ **Grove Detail View** - View grove worktrees with git status (uncommitted/unpushed)
✅ **Grove Closing** - Clean up worktrees and delete grove folders
✅ **Grove Configuration** - Per-repo `.grove.json` for custom branch names and file copying
✅ **Project-Level Config** - Monorepo projects can have their own `.grove.json`
✅ **File Copying** - Copy files matching glob patterns to worktrees during creation
✅ **Git Worktree Operations** - Full GitService with add/list/remove/prune/status
✅ **Open in Terminal** - Launch terminal windows for worktrees
✅ **Open in IDE** - Launch VS Code, JetBrains IDEs, PyCharm, or Vim for worktrees
✅ **JetBrains Auto-Detect** - Automatically select IDE based on project files (composer.json, package.json, etc.)
✅ **IDE Settings** - Configure default IDE and custom commands
✅ **Navigation System** - Type-safe 10-screen routing with history
✅ **Dependency Injection** - DI container with React hooks for testability
✅ **Recent Selections** - Track recently used repo/project selections
✅ **Settings Management** - Configure working folder, terminal, IDE
✅ **CLI Commands** - `grove --register` for repository registration

### Future Expansion Areas

**High Priority**:

- AI/LLM integration for chat functionality (Anthropic Claude API)
- Connect chat to git operations (natural language git commands)
- Execute `initActions` from `.grove.json` after grove creation
- More CLI commands (list repos, list groves, etc.)

**Medium Priority**:

- Testing framework (Jest or Vitest) - DI architecture enables easy testing
- Command history in chat
- Git operations beyond worktrees (commit, push, pull, etc.)
- Batch operations on multiple worktrees

**Low Priority**:

- Logging and debugging utilities
- Configuration file support (global ~/.grove/config.json)
- Plugin/extension system
- Custom themes for terminal UI

## Architecture Decisions

### Why Ink + React?

- Familiar React patterns for UI development
- Component-based architecture in the terminal
- Rich ecosystem of Ink components
- Declarative UI updates
- Easy state management with React hooks

### Why TypeScript?

- Type safety prevents runtime errors
- Better IDE support and autocomplete
- Self-documenting code with types
- Easier refactoring as project grows

### Why ESM (ES Modules)?

- Modern JavaScript standard
- Better tree-shaking for smaller bundles
- Native browser and Node.js support
- Future-proof architecture

### Why JSON-Based Storage?

- **Simplicity**: Plain JSON files are easy to read, debug, and manually edit
- **No Dependencies**: No database engine required
- **Portability**: Files can be backed up, synced, or version controlled
- **Human-Readable**: Users can inspect ~/.grove/settings.json directly
- **Appropriate Scale**: Perfect for personal tool with limited data

**Storage Structure**:

- `~/.grove/settings.json` - User settings (workingFolder, terminal, selectedIDE, ideConfigs)
- `~/.grove/repositories.json` - List of registered repositories (with isMonorepo flag)
- `~/.grove/groves.json` - Global grove index
- `~/.grove/recent.json` - Recent repository/project selections
- `<grove-folder>/grove.json` - Per-grove metadata (worktrees list)
- `<grove-folder>/CONTEXT.md` - Human-readable grove description
- `<repo>/.grove.json` - Per-repository configuration (branchNameTemplate, fileCopyPatterns)
- `<repo>/.grove.local.json` - Local config overrides (gitignored)
- `<repo>/<project>/.grove.json` - Project-level config for monorepos

### Why Service Layer Pattern?

**GitService Benefits**:

- **Abstraction**: Hides git command complexity behind clean API
- **Testability**: Easy to mock for testing
- **Error Handling**: Centralized error handling for git operations
- **Type Safety**: Structured return types (GitCommandResult, WorktreeInfo)
- **Reusability**: Same service used across multiple screens/features

**Pattern**: Each service class encapsulates related operations and receives dependencies via constructor

### Why Dependency Injection?

The DI pattern was introduced to improve testability and maintainability:

- **Testability**: Services can be mocked by registering test implementations
- **Loose Coupling**: Components depend on interfaces, not implementations
- **Configuration Flexibility**: Different service implementations for different environments
- **Explicit Dependencies**: Constructor parameters make dependencies clear
- **Lifecycle Control**: Singleton vs transient service lifetimes

**Implementation**:

- Custom lightweight DI container (no external library)
- React integration via `useService()` hook
- Service tokens for type-safe resolution
- Factory-based registration for lazy instantiation

### Why Navigation Context?

- **Type Safety**: Routes type-checked at compile time
- **Centralized State**: Single source of truth for current screen
- **History Management**: Built-in back navigation support
- **Params Support**: Type-safe screen parameters
- **Testability**: Navigation can be mocked for testing

**Alternative Considered**: Direct screen imports - rejected because it loses history and params

## Getting Help

### Resources

- **Ink Documentation**: https://github.com/vadimdemedes/ink
- **React Documentation**: https://react.dev
- **TypeScript Documentation**: https://www.typescriptlang.org/docs/

### Project-Specific Questions

Refer to:

- README.md for user-facing information
- This file (CLAUDE.md) for development guidance
- Source code comments and type definitions
- Commit history for context on decisions

---

**Last Updated**: 2026-01-05
**Document Version**: 3.1.0
**Codebase State**: Active development (v0.0.1) with mature feature set
**Lines of Code**: ~7,500 lines
**Key Milestones**: Storage ✅ | Git Operations ✅ | Navigation ✅ | Repository Tracking ✅ | Grove Management ✅ | Monorepo Support ✅ | DI Container ✅ | External Tool Integration ✅ | JetBrains Auto-Detect ✅

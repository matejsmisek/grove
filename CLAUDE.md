# CLAUDE.md - AI Assistant Guide for Grove

This document provides comprehensive information about the Grove codebase for AI assistants working on this project.

## Project Overview

**Grove** is a Git management CLI application powered by AI, built with modern web technologies adapted for terminal interfaces. It provides an interactive, Claude-like chat interface for managing Git operations through natural language.

### Key Features

- **Interactive CLI interface** with navigation-based UI
- **Grove Management**: Create and manage collections of git worktrees (called "groves")
- **Repository Tracking**: Register and track git repositories
- **Persistent Storage**: JSON-based storage in `~/.grove` for settings, repositories, and groves
- **Git Worktree Operations**: Create, list, and manage git worktrees via GitService
- **Multi-Screen Navigation**: Home, Chat, Create Grove, Settings, Working Folder, Repositories screens
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
├── src/                    # Source files (~2075 lines total)
│   ├── commands/          # Command handlers
│   │   ├── index.ts       # Command exports
│   │   └── register.ts    # Repository registration command
│   ├── components/        # UI components
│   │   ├── types.ts       # Shared TypeScript interfaces
│   │   ├── App.tsx        # Main application component
│   │   ├── StatusBar.tsx  # Status bar component
│   │   ├── MessageList.tsx # Message list component
│   │   └── InputPrompt.tsx # Input prompt component
│   ├── git/              # Git utilities
│   │   ├── index.ts       # Git utility exports
│   │   └── utils.ts       # Git helper functions (isGitRepo, getGitRoot, etc.)
│   ├── navigation/        # Navigation system
│   │   ├── NavigationContext.tsx  # Navigation context provider
│   │   ├── Router.tsx     # Screen router component
│   │   ├── types.ts       # Navigation type definitions
│   │   └── useNavigation.ts # Navigation hook
│   ├── screens/           # Screen components (6 screens)
│   │   ├── HomeScreen.tsx        # Home/welcome screen
│   │   ├── ChatScreen.tsx        # AI chat interface screen
│   │   ├── CreateGroveScreen.tsx # Grove creation screen
│   │   ├── SettingsScreen.tsx    # Settings management screen
│   │   ├── WorkingFolderScreen.tsx # Working folder configuration
│   │   └── RepositoriesScreen.tsx # Repository list screen
│   ├── services/          # Service layer
│   │   └── GitService.ts  # Git worktree operations service
│   ├── storage/           # Persistent storage layer
│   │   ├── index.ts       # Storage exports
│   │   ├── storage.ts     # Settings storage (settings.json)
│   │   ├── repositories.ts # Repository tracking (repositories.json)
│   │   ├── groves.ts      # Grove management (groves.json, grove.json)
│   │   └── types.ts       # Storage type definitions
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

- **Total Lines**: ~2,075 lines across TypeScript and TSX files
- **Screens**: 6 screen components
- **Modules**: 8 major modules (commands, components, git, navigation, screens, services, storage, index)
- **Architecture**: Modular, feature-based organization with clear separation of concerns

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
- `Settings` - User settings (workingFolder path)
- `StorageConfig` - Storage paths configuration
- `Repository` - Registered repository metadata
- `RepositoriesData` - Repository list container
- `Worktree` - Worktree metadata (path, branch, repository)
- `GroveReference` - Global grove index entry
- `GrovesIndex` - Global list of all groves
- `GroveMetadata` - Grove-specific data (worktrees, timestamps)

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

**Purpose**: Grove management (groves.json index + per-grove grove.json files)

**Key Functions**:
- `readGrovesIndex()` / `writeGrovesIndex()` - Global grove list (~/.grove/groves.json)
- `createGrove()` - Create new grove with worktrees and CONTEXT.md
- `readGroveMetadata()` / `writeGroveMetadata()` - Per-grove metadata (grove-folder/grove.json)
- `addWorktreeToGrove()` - Add worktree to existing grove
- `getAllGroves()` - Get all grove references
- `getGroveById()` - Find grove by ID
- `deleteGrove()` - Remove grove from index (optionally delete folder)

**Features**:
- Creates CONTEXT.md for each grove with description and repo list
- Generates unique grove IDs using crypto.randomBytes
- Automatically creates worktrees for all selected repositories
- Updates timestamps (createdAt, updatedAt)

### Git Layer (`src/git/`)

#### src/git/utils.ts

**Purpose**: Git repository validation and detection utilities

**Key Functions**:
- `isGitRepository()` - Check if directory is inside a git repo
- `isGitWorktree()` - Detect if directory is a worktree (not main repo)
- `getGitRoot()` - Get repository root path
- `verifyValidRepository()` - Validate repo is not a worktree (for registration)

**Uses**: `execSync` from child_process for git command execution

### Services Layer (`src/services/`)

#### src/services/GitService.ts

**Purpose**: Git worktree operations via spawn

**Key Features**:
- Async git command execution using spawn
- Structured result objects with stdout/stderr/exitCode
- Comprehensive worktree management

**Key Methods**:
- `addWorktree(path, branch?, commitish?)` - Create new worktree
- `listWorktrees(porcelain?)` - List all worktrees
- `parseWorktreeList()` - Parse porcelain output into structured data
- `removeWorktree(path, force?)` - Delete worktree
- `pruneWorktrees()` - Clean up stale worktree metadata
- `lockWorktree()` / `unlockWorktree()` - Lock management
- `moveWorktree(worktree, newPath)` - Relocate worktree

**Types**:
- `GitCommandResult` - Command execution result
- `WorktreeInfo` - Parsed worktree information

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
- `settings` - Settings screen (optional section param)
- `workingFolder` - Working folder config (no params)
- `repositories` - Repository list (no params)

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

### Components Layer (`src/components/`)

#### src/components/App.tsx

**Purpose**: Root application component

**Key Responsibilities**:
- Wraps app in NavigationProvider
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

### Screens Layer (`src/screens/`)

The screens layer contains the 6 main screen components that make up the Grove UI. Each screen is a full-page view that users navigate between.

**Screens**:
- `HomeScreen.tsx` - Welcome/landing screen
- `ChatScreen.tsx` - AI chat interface (uses MessageList, InputPrompt)
- `CreateGroveScreen.tsx` - Grove creation wizard
- `SettingsScreen.tsx` - Settings management
- `WorkingFolderScreen.tsx` - Working folder configuration
- `RepositoriesScreen.tsx` - Repository list and management

**Common Patterns**:
- Use `useNavigation()` hook for navigation
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

**Screens**:
- **Home Screen**: Edit `src/screens/HomeScreen.tsx`
- **Chat Screen**: Edit `src/screens/ChatScreen.tsx`
- **Create Grove**: Edit `src/screens/CreateGroveScreen.tsx`
- **Settings**: Edit `src/screens/SettingsScreen.tsx`
- **Working Folder**: Edit `src/screens/WorkingFolderScreen.tsx`
- **Repositories**: Edit `src/screens/RepositoriesScreen.tsx`

**Storage & Data**:
- **Settings**: Edit `src/storage/storage.ts`
- **Repository Tracking**: Edit `src/storage/repositories.ts`
- **Grove Management**: Edit `src/storage/groves.ts`
- **Storage Types**: Edit `src/storage/types.ts`

**Git Operations**:
- **Git Service**: Edit `src/services/GitService.ts`
- **Git Utilities**: Edit `src/git/utils.ts`

**Navigation**:
- **Navigation Context**: Edit `src/navigation/NavigationContext.tsx`
- **Router**: Edit `src/navigation/Router.tsx`
- **Navigation Types**: Edit `src/navigation/types.ts`

**Commands & CLI**:
- **Repository Registration**: Edit `src/commands/register.ts`
- **CLI Entry Point**: Edit `src/index.tsx`

### Adding Dependencies

```bash
# Production dependency
npm install <package-name>

# Development dependency
npm install -D <package-name>
```

Always update package.json and commit package-lock.json.

### Code Organization Guidelines

Current organization follows a **modular, feature-based architecture**:

**Established Patterns**:
- **Storage Layer** (`src/storage/`) - All persistence logic (settings, repos, groves)
- **Services Layer** (`src/services/`) - Business logic (GitService)
- **Commands Layer** (`src/commands/`) - CLI command handlers
- **Git Layer** (`src/git/`) - Git utility functions
- **Navigation Layer** (`src/navigation/`) - Screen routing and history
- **Screens Layer** (`src/screens/`) - Full-page screen components
- **Components Layer** (`src/components/`) - Reusable UI components
- **Entry Point** (`src/index.tsx`) - CLI arg parsing and app bootstrap

**Architecture Principles**:
- **Separation of Concerns**: Each layer has a specific responsibility
- **Type Safety**: Each module exports its types from a `types.ts` file or inline
- **Encapsulation**: Storage, git operations, and services are abstracted behind clean APIs
- **Modularity**: Each file/module has a single, focused purpose
- **Export Structure**: Use `index.ts` files to export public APIs from modules

**When Adding New Features**:
- **New Storage**: Add to `src/storage/` (create new file + update index.ts)
- **New Service**: Add to `src/services/`
- **New Screen**: Add to `src/screens/` and update Router
- **New Command**: Add to `src/commands/` and update CLI parsing in index.tsx
- **Utility Functions**: Add to appropriate module or create new under `src/`

## Important Notes for AI Assistants

### Project Context

- **Development Stage**: Active development (v0.0.1) with core features implemented
- **Git Integration**: ✅ Fully implemented via GitService (worktree operations)
- **Storage System**: ✅ Complete JSON-based persistence in ~/.grove
- **Repository Tracking**: ✅ Register and manage git repositories
- **Grove Management**: ✅ Create and track collections of worktrees
- **Navigation**: ✅ Multi-screen UI with type-safe routing
- **AI Integration**: ⚠️ Chat screen exists but AI/LLM integration not yet connected
- **Architecture**: Mature modular structure with 8 distinct layers (~2,075 lines)

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
3. **No Testing Framework**: No unit tests or integration tests yet
4. **Basic Error Handling**: Error handling exists but could be more comprehensive
5. **No Worktree Cleanup**: No UI for removing worktrees or cleaning up groves
6. **No Git Operations in Chat**: Chat doesn't execute git commands yet

### Implemented Features (Recently Added)

✅ **Persistent Storage System** - JSON-based storage in ~/.grove
✅ **Repository Tracking** - Register and list repositories
✅ **Grove Creation** - Create collections of worktrees
✅ **Git Worktree Operations** - Full GitService with add/list/remove/prune
✅ **Navigation System** - Type-safe multi-screen routing
✅ **Settings Management** - Configure working folder
✅ **CLI Commands** - `grove --register` for repository registration

### Future Expansion Areas

**High Priority**:
- AI/LLM integration for chat functionality (Anthropic Claude API)
- Connect chat to git operations (natural language git commands)
- Grove deletion and worktree cleanup UI
- More CLI commands (list repos, list groves, etc.)

**Medium Priority**:
- Testing framework (Jest or Vitest)
- Enhanced error handling and validation
- Command history in chat
- Grove status display (show git status for all worktrees)
- Git operations beyond worktrees (commit, push, pull, etc.)

**Low Priority**:
- Logging and debugging utilities
- Advanced state management (if needed)
- Configuration file support (beyond settings.json)
- Plugin/extension system

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
- `~/.grove/settings.json` - User settings (working folder path)
- `~/.grove/repositories.json` - List of registered repositories
- `~/.grove/groves.json` - Global grove index
- `<grove-folder>/grove.json` - Per-grove metadata (worktrees list)
- `<grove-folder>/CONTEXT.md` - Human-readable grove description

### Why Service Layer Pattern?

**GitService Benefits**:
- **Abstraction**: Hides git command complexity behind clean API
- **Testability**: Easy to mock for testing
- **Error Handling**: Centralized error handling for git operations
- **Type Safety**: Structured return types (GitCommandResult, WorktreeInfo)
- **Reusability**: Same service used across multiple screens/features

**Pattern**: Each service class encapsulates related operations and maintains state (like cwd)

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

**Last Updated**: 2025-11-23
**Document Version**: 2.0.0
**Codebase State**: Active development (v0.0.1) with core features implemented
**Lines of Code**: ~2,075 lines
**Key Milestones**: Storage ✅ | Git Operations ✅ | Navigation ✅ | Repository Tracking ✅ | Grove Management ✅

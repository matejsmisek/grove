# CLAUDE.md - AI Assistant Guide for Grove

This document provides essential information about the Grove codebase for AI assistants working on this project.

## What is Grove?

**Grove** is a Git management CLI application that helps developers work with multiple git worktrees simultaneously. It provides an interactive terminal UI for creating and managing collections of worktrees (called "groves") across different repositories.

### Core Concept

A **grove** is a collection of git worktrees from one or more repositories, organized together for a specific task or feature. Grove makes it easy to:

- Create multiple worktrees from different repos/branches at once
- Track and manage them as a logical unit
- Open them in your terminal, IDE, or Claude CLI
- Clean them up when done

### Key Features

- **Grove Management**: Create, view, and close collections of git worktrees
- **Monorepo Support**: Select specific project folders within monorepos for grove creation
- **Repository Tracking**: Register and manage git repositories
- **Git Worktree Operations**: Full git worktree lifecycle management
- **External Tool Integration**: Open worktrees in terminal, IDE (VS Code, JetBrains, PyCharm, Vim), or Claude CLI
- **Grove Configuration**: Per-repo `.grove.json` for custom branch naming, file patterns, IDE selection, and init actions
- **InitActions**: Execute bash commands automatically after worktree creation
- **Interactive UI**: ~30-screen terminal interface built with React and Ink
- **Persistent Storage**: JSON-based storage in `~/.grove` for all data

### Technology Stack

- **TypeScript** (v5.9.3) - Strict mode, type-safe
- **React** (v19.2.0) + **Ink** (v6.5.1) - Terminal UI framework
- **Vitest** (v4.0.16) - Testing with in-memory filesystem mocking
- **ESLint** + **Prettier** - Code quality and formatting
- **Husky** + **lint-staged** - Pre-commit hooks
- **Node.js** >=18.0.0, ES Modules

## Architecture Overview

### Layered Architecture

Grove follows a modular, dependency-injection-based architecture with clear separation of concerns:

1. **DI Layer** (`src/di/`) - Lightweight dependency injection container with React integration
2. **Storage Layer** (`src/storage/`) - JSON persistence for settings, repositories, groves
3. **Services Layer** (`src/services/`) - Business logic (GitService, GroveService, etc.)
4. **Git Layer** (`src/git/`) - Git repository utilities and validation
5. **Navigation Layer** (`src/navigation/`) - Type-safe screen routing with history
6. **Screens Layer** (`src/screens/`) - ~30 full-page UI screens (see `src/navigation/types.ts`)
7. **Components Layer** (`src/components/`) - Reusable UI components, including the home dashboard (`src/components/home/`)
8. **Commands Layer** (`src/commands/`) - CLI command handlers and argument parsing
9. **Utils Layer** (`src/utils/`) - General utility functions
10. **Plugins Layer** (`src/plugins/`) - Optional integrations (GitLab, Asana) sharing a `BasePlugin`
11. **Hooks Layer** (`src/hooks/`) - Reusable React hooks (task tracking, merge-request status, etc.)
12. **Agents Layer** (`src/agents/`) - Agent adapter registry for Claude (and future) CLI sessions

### Key Architectural Patterns

- **Dependency Injection**: Services use constructor injection for testability
- **Interface Segregation**: Services implement interfaces defined in `interfaces.ts`
- **Service Tokens**: Type-safe service resolution via branded tokens
- **React Context**: Navigation and DI integrated via React Context
- **Testing Strategy**: In-memory filesystem mocking with `memfs` for fast, isolated tests

### Storage Structure

All data is stored as JSON in `~/.grove/`:

**Global Storage** (`~/.grove/`, or the path in the `GROVE_GLOBAL_DIR` env var when set):

- `settings.json` - User settings (working folder, terminal, IDE preferences, session templates)
- `repositories.json` - Registered repositories with monorepo flags
- `groves.json` - Index of all groves
- `recent.json` - Recently used repository/project selections

**Per-Grove Storage** (`<grove-folder>/`):

- `grove.json` - Grove metadata (worktrees, initActions status, timestamps)
- `CONTEXT.md` - Human-readable grove description
- `grove-init-{worktreeName}.log` - InitActions execution logs

**Repository Configuration** (checked into repos):

- `<repo>/.grove.json` - Repository-level config (branch templates, file patterns, IDE, initActions)
- `<repo>/.grove.local.json` - Local overrides (gitignored)
- `<repo>/<project>/.grove.json` - Project-level config for monorepos

### Settings Inheritance

Settings resolve through layers, each overriding the one before it:

```
Global  →  Workspace / Repo  →  .grove.json  →  .grove.local.json
```

- **Global** (`~/.grove/settings.json`) is the base layer.
- **Workspace / Repo** (`<context>/.grove/settings.json`) inherits from global by default. A
  workspace/repo only needs to store the keys it overrides; any missing key falls through to the
  global value. This is handled in `SettingsService.readSettings()` by merging the context file
  over the global file. Writes via `updateSettings()` only persist the changed keys, so the
  context file stays sparse and inheritance remains live.
- **`.grove.json` / `.grove.local.json`** are a separate repo-level config (`GroveRepoConfig`)
  consumed during grove creation and tool launching; for overlapping fields (e.g. `ide`,
  `claudeSessionTemplates`) their consumers check these files before falling back to settings.
- **Terminal**: `selectedTerminal` (a `TerminalId`) is the single default terminal for both
  "Open terminal" and "Open/Attach Claude", inherited from global like `selectedIDE`. Per-terminal
  overrides live in `terminalConfigs[id]` (`claudeSessionTemplate` for file-based terminals;
  `customCommand`/`customArgs` for the `custom` id). Legacy `terminal` / `selectedClaudeTerminal` /
  `claudeSessionTemplates` settings are auto-migrated to this shape on read by
  `SettingsService.migrateTerminalSettings()` and then removed.
- `mouseControlEnabled` is the one exception: it is always read from and written to the global
  file and cannot be overridden per-workspace.
- `workingFolder` is context-specific (each workspace/repo has its own) and is not inherited from
  global.

### Configuration: `.grove.json`

Repositories can include a `.grove.json` file to customize grove creation:

```json
{
	"branchNameTemplate": "grove/${GROVE_NAME}",
	"fileCopyPatterns": [".env.example", "config/*.json"],
	"ide": "@phpstorm",
	"initActions": ["npm install", "cp .env.example .env"],
	"promptTemplate": "Working on this task:\n\n{prompt}\n\nFollow the repo conventions.",
	"claudeSessionTemplates": {
		"konsole": "title: Claude ;; workdir: ${WORKING_DIR} ;; command: ${AGENT_COMMAND}",
		"kitty": "layout tall\ncd ${WORKING_DIR}\nlaunch --title \"claude\" ${AGENT_COMMAND}"
	}
}
```

`claudeSessionTemplates` is keyed by `TerminalId`; only file-based terminals with an editable
template (currently `konsole`/`kitty`) consume it.

**InitActions**: Execute sequentially in worktree directory after creation. Stop on first failure. Output logged to `grove-init-{worktreeName}.log`.

**promptTemplate**: Used by the **Instant Claude** worktree action. The template opens in `$EDITOR`, then the edited text is dispatched as a background Claude session via `claude --bg --name <name> "<prompt>"`; the session's short ID is saved on the worktree so the action flips to **Attach to Running Claude** (`claude attach <id>`). The literal `{prompt}` placeholder marks where the editor caret is placed and is removed before launch. Resolution priority: project `.grove.json` > repo `.grove.json` / `.grove.local.json` > global/workspace settings (`promptTemplate`). The plain **Open in Claude** action ignores this template and launches Claude via the session template only.

**Template Variables**:

- `${WORKING_DIR}`: Replaced with the working directory path
- `${AGENT_COMMAND}`: Replaced with the agent launch command. When opening a new session, this is `claude`. When resuming a session, this is `claude --resume <session_id>`.

## direnv Integration

Some repositories rely on [direnv](https://direnv.net/) to load their environment
from an `.envrc` (which may live in a parent directory, not the worktree itself).
Grove wraps the commands it launches with `direnv exec <dir> …` so they inherit the
same environment an interactive shell would load. Helpers live in
`src/utils/direnv.ts`:

- `isDirenvAvailable()` — memoized `which direnv` check.
- `getDirenvDirStatus(dir)` / `dirNeedsDirenv(dir)` — runs `direnv status` with
  `cwd = dir` and parses the text output (`Found RC path` / `Found RC allowed`).
  Detection is delegated to direnv itself (rather than hand-walking the tree) so
  Grove never diverges from what `direnv exec` actually resolves, including parent
  `.envrc` files and the user's whitelist config. The text parser is used because
  `direnv status --json` only exists in direnv ≥ 2.33.
- `wrapSpawnWithDirenv(dir, command, args)` — argv form for `spawn`/`spawnSync`
  (handles paths with spaces); used for background sessions (`claude --bg`) and
  InitActions (`bash -c`).
- `prefixCommandWithDirenv(dir, command)` — string form for the file-based
  session templates (konsole/kitty), where `${AGENT_COMMAND}` is substituted into
  a file the terminal parses.

## Terminal Support

Terminal launching (both "Open terminal" and "Open/Attach Claude") is driven by a
**terminal adapter registry** in `src/terminals/`:

- `types.ts` — `TerminalAdapter` interface. Each adapter has `openTerminal(path)`
  (plain launch) and `launchClaude(ctx)` (Claude session), plus capability flags:
  `multiTab` (opens multiple tabs) and `editableTemplate` (exposes a hand-editable
  session template, file-based — only konsole/kitty).
- `adapters.ts` — `ALL_TERMINAL_ADAPTERS`, in preference order. Multi-tab: konsole
  & kitty (session files), gnome-terminal (`--tab`), iTerm2 (AppleScript). Everything
  else (alacritty, ghostty, wezterm, xterm, Terminal.app, Windows Terminal, cmd, …)
  is best-effort single-window. `custom` is a user-supplied command escape hatch.
- `registry.ts` — `getAdapter`, `adaptersForPlatform`, `detectAvailableTerminalIds`
  (platform + `commandExists`, or `isAvailable()` override for app-based terminals),
  `getTerminalDisplayName`, and `commandToTerminalId` (legacy-settings migration).

Consumers: `TerminalService` (module functions, registry-backed: `detectAvailableTerminals`,
`resolveTerminalId`, `openTerminalInPath`), `SessionLauncherService` (resolves
`selectedTerminal`, delegates the spawn to `adapter.launchClaude`), and
`SessionTemplateService` (default template from `adapter.defaultTemplate`, custom from
`terminalConfigs[id].claudeSessionTemplate`). The unified settings UI is
`TerminalSettingsScreen` (route `terminalSettings`).

- `getDirenvAllowWarning(dir)` — returns a user-facing warning when an
  `.envrc`/`.env` is found but **not allowed** (so its environment won't load).
  A whitelisted path reports `allowed = true`, so this never warns for paths under
  the user's `whitelist.prefix`. The warning is surfaced in Claude session launch
  result messages and streamed into the InitActions log.

Wrapping is always safe: when direnv isn't installed or the directory has no
`.envrc`, the original command runs unchanged; when an `.envrc` is found but not
yet allowed (and not whitelisted), `direnv exec` warns and runs the command
without the environment rather than failing — and Grove surfaces a "run
`direnv allow`" hint to the user.

### Whitelisting the groves folder

To avoid a per-worktree `direnv allow`, Grove can add the groves folder to direnv's
`[whitelist].prefix` so every worktree created beneath it is trusted automatically.
Helpers live in `src/utils/direnvWhitelist.ts`:

- `getDirenvConfigPath()` — `$XDG_CONFIG_HOME/direnv/direnv.toml`, else
  `~/.config/direnv/direnv.toml`.
- `readDirenvWhitelistPrefixes()` / `isPathInDirenvWhitelist(dir)` — read the current
  prefixes and test whether a directory is already covered (exact match or a parent
  prefix).
- `addDirenvWhitelistPrefix(add, remove?)` — rewrites only the `[whitelist].prefix`
  array (preserving comments, other sections, and `exact` entries), optionally
  dropping a previous prefix when the groves folder changes. Creates the config file
  when missing; idempotent on a path that is already present.

- `shouldOfferDirenvWhitelist(folder, alreadyPromptedFolder?)` — gate used at
  startup: true only when direnv is installed, `folder` is non-empty and not
  already whitelisted, and it differs from `alreadyPromptedFolder`.

The `DirenvWhitelistPrompt` component (`src/components/`) offers this during the
**setup wizard** (after choosing the groves folder) and in the **Working Folder**
settings screen (after saving a new path). It renders nothing and resolves
immediately when direnv is not installed or the folder is already whitelisted.

In **repo/workspace mode** the setup wizard never runs and the groves folder is
derived from the context, so the trust check happens at startup instead: when
`shouldOfferDirenvWhitelist` returns true, `index.tsx` routes the initial screen to
`DirenvTrustScreen` (a one-time gate before `home`). That screen records the folder
it asked about in `Settings.direnvWhitelistPromptedFolder` (per-context) so a
decline is not re-prompted on the next launch — accepting whitelists the folder,
which suppresses the prompt on its own.

## Claude Session Tracking

Grove tracks Claude sessions by merging two sources:

1. **`claude agents --json`** (live) — the authoritative source for a session's
   **status** (`idle` / `busy` / `waiting` / …) and liveness. Polled every 2 minutes
   by the UI via `ClaudeSessionService.listTrackedSessions()`. Status is rendered
   as-is (see `AgentSessionIndicator`); Grove derives no status of its own.
2. **`~/.grove/sessions.json`** (registry) — written by Claude **hooks**
   (`SessionStart` / `Stop` / `Notification` / `SessionEnd`, handled in
   `src/commands/sessions.ts` → `SessionsService`). Its role is mainly to record
   that a session **exists** and persist its archived state.

**Reconciliation** (`reconcileSessions` in `src/utils/claudeAgents.ts`, called from
`listTrackedSessions`) merges them on each refresh:

- A live session missing from the registry is added (so Grove knows it exists even
  if the hook never fired).
- A registry session **no longer reported by `--json`** is considered **archived**.
- Archived sessions are kept in `sessions.json` but **hidden from the UI** (a future
  feature may surface them).

**Archiving from a grove** (`ClaudeSessionService.archiveSession`) runs
`claude rm <id>` to drop the session from Claude's agent list, then flags it
`archived` in the registry so it disappears from Grove immediately. Per-worktree
launch tracking still lives on the `Worktree` (`bgSessionId` / `bgSessionName`,
used to match and attach background sessions).

## Development Workflow

### Essential Commands

| Command                 | Purpose                        |
| ----------------------- | ------------------------------ |
| `npm install`           | Install dependencies           |
| `npm run build`         | Compile TypeScript to dist/    |
| `npm run dev`           | Watch mode compilation         |
| `npm test`              | Run all tests                  |
| `npm run test:watch`    | Run tests in watch mode        |
| `npm run test:ui`       | Open interactive test UI       |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run typecheck`     | Type-check without building    |
| `npm run lint`          | Check for linting errors       |
| `npm run lint:fix`      | Auto-fix linting issues        |
| `npm run format`        | Format all files with Prettier |

### Mandatory Quality Checks

**CRITICAL**: After making ANY code changes, you MUST run these checks:

```bash
# 1. Run ESLint on changed files
npx eslint path/to/changed/file.ts

# 2. Run TypeScript type check
npm run typecheck

# 3. Run tests (ESPECIALLY for service/storage changes)
npm test
```

**Why This Is Mandatory**:

- Pre-commit hooks will **block commits** if checks fail
- CI will **fail** if code doesn't pass validation
- Ensures code quality and prevents breaking changes

**What Gets Checked**:

- **ESLint**: Code style, potential bugs, anti-patterns
- **TypeScript**: Type errors, type safety violations
- **Tests**: Functionality, regressions, edge cases

### Pre-commit Hook

The pre-commit hook (Husky) automatically runs:

1. `lint-staged` - Prettier formatting + ESLint auto-fix on staged files
2. `npm run typecheck` - Full TypeScript check

Commits are **blocked** if any check fails.

## Testing

### Testing Strategy

Grove uses **Vitest** with **memfs** (in-memory filesystem) for fast, isolated unit tests.

**Test Coverage**:

- ✅ All storage services (Settings, Repository, Groves, GroveConfig)
- ✅ Core services (Context, File)
- ⚠️ UI components and screens (not yet covered)

**Coverage Target**: >80% for services and storage layers

### Running Tests

```bash
# Run all tests once
npm test

# Watch mode (auto-rerun on changes)
npm run test:watch

# Interactive web UI
npm run test:ui

# With coverage report
npm run test:coverage
```

### Writing Tests for Services

**CRITICAL**: When adding or modifying service/storage code, you MUST write tests.

**Test File Location**:

- `src/services/MyService.ts` → `src/services/__tests__/MyService.test.ts`
- `src/storage/MyStorage.ts` → `src/storage/__tests__/MyStorage.test.ts`

**Test Structure**:

```typescript
import { Volume } from 'memfs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockFs } from '../../__tests__/helpers.js';

let vol: Volume;

vi.mock('fs', () => ({
	/* mock filesystem */
}));

describe('ServiceName', () => {
	beforeEach(() => {
		const mockFs = createMockFs();
		vol = mockFs.vol;
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('methodName', () => {
		it('should handle normal case', () => {
			// Arrange, Act, Assert
		});

		it('should handle edge case', () => {});
		it('should handle error case', () => {});
	});
});
```

**Test Coverage Requirements**:

- Test happy paths (normal operation)
- Test edge cases (empty inputs, missing files, etc.)
- Test error handling (invalid JSON, missing directories, etc.)
- Test all public methods

**Test Helpers** (`src/__tests__/helpers.ts`):

- `createMockFs()` - Create in-memory filesystem
- `setupMockHomeDir(vol, homeDir)` - Setup mock home directory
- `createMockGitRepo(vol, basePath)` - Create mock git repository
- `createFile(vol, filePath, content)` - Create file
- `readFile(vol, filePath)` - Read file
- `fileExists(vol, filePath)` - Check existence
- `createMockGroveConfig(vol, repoPath, config)` - Create .grove.json

## Code Conventions

### TypeScript Standards

- **Strict Mode**: All strict type checking enabled
- **Explicit Types**: Prefer explicit type annotations
- **Interfaces**: Use interfaces for object shapes
- **No `any`**: Avoid `any` types (ESLint warns)

### Naming Conventions

- **Components**: PascalCase (e.g., `App`, `StatusBar`)
- **Functions**: camelCase (e.g., `handleSubmit`, `createGrove`)
- **Interfaces**: PascalCase (e.g., `Message`, `GroveMetadata`)
- **Constants**: UPPER_SNAKE_CASE
- **Variables**: camelCase

### Code Style

- **Indentation**: Tabs (enforced by Prettier)
- **Quotes**: Single quotes
- **Semicolons**: Required
- **Line Length**: 100 characters
- **Import Order**: React → Ink → Third-party → Local (auto-sorted by Prettier)

**Note**: Prettier handles formatting automatically via pre-commit hook.

### React/Ink Patterns

- Use `useState` for component state
- Use Ink's `Box` component for layouts
- Use `Text` component with color/bold props
- Use `useNavigation()` for screen navigation
- Use `useService()` for dependency injection

### Component Structure

```typescript
function ComponentName() {
  // 1. Hooks and state
  const [state, setState] = useState(initialValue);
  const service = useService(ServiceToken);

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

### Commit Standards

- Use descriptive commit messages
- Group related changes together
- Keep commits atomic and focused
- **NEVER use `git commit --amend`** - Always create new commits
  - Amending can break collaboration and CI/CD
  - If you need to fix a commit, create a new commit instead

### Branch Strategy

- Feature branches use `claude/` prefix for AI assistant work
- Format: `claude/<feature-name>-<sessionId>`

## Working with Grove

### Development Cycle

1. Make changes to TypeScript files in `src/`
2. Run `npm run dev` for automatic compilation
3. Test the CLI: `node dist/index.js` or `npm link` + `grove`
4. **Run mandatory checks** (ESLint, typecheck, tests)
5. Fix any errors
6. Commit changes (pre-commit hook runs automatically)
7. Push changes

### Adding a New Feature

1. Identify which layer(s) need changes (services, screens, components, etc.)
2. Follow established patterns for that layer
3. Update types/interfaces as needed
4. **Write tests** if modifying services or storage
5. Run mandatory quality checks
6. Commit and push

### Adding a New Service

1. Create class in `src/services/` or `src/storage/`
2. Define interface in `interfaces.ts`
3. Create service token in `tokens.ts`
4. Register in DI container (`registration.ts`)
5. **Write comprehensive tests** in `__tests__/`
6. Use `useService(YourServiceToken)` in components

### Adding Dependencies

```bash
# Production dependency
npm install <package-name>

# Development dependency
npm install -D <package-name>
```

Always commit both `package.json` and `package-lock.json`.

## Important Notes for AI Assistants

### Project Status

- **Version**: 1.0.0, active development
- **Architecture**: Mature modular structure (~26,000 lines of source, ~35,000 with tests)
- **Testing**: Comprehensive service/storage coverage with Vitest
- **Git Integration**: ✅ Full worktree operations
- **Grove Management**: ✅ Complete lifecycle (create, view, close)
- **Monorepo Support**: ✅ Project-level configuration
- **External Tools**: ✅ Terminal, IDE, Claude CLI integration
- **AI Integration**: ⚠️ Chat UI exists but LLM not yet connected

### Development Priorities

1. Maintain type safety (strict TypeScript)
2. Follow established patterns
3. Write tests for service/storage changes
4. Keep code clean and linted
5. Build toward AI-powered Git operations

### When Making Changes

- **Always read** existing code before modifying
- **Preserve** existing UI structure and patterns
- **Follow** naming conventions
- **Test** changes by running the CLI
- **Run mandatory checks** (ESLint, typecheck, tests)
- **Write tests** for new services
- **Format code** with Prettier (automatic via hook)

**IMPORTANT**: Quality checks are NOT optional. Pre-commit hooks and CI will block commits/PRs if checks fail.

### Exploring the Codebase

To understand specific parts of Grove:

- Use `Glob` to find files by pattern (e.g., `**/*Service.ts`)
- Use `Grep` to search for code patterns
- Read files to understand implementation details
- Check `types.ts` files for data structure definitions
- Look at `__tests__/` for usage examples

### Quick Reference

**Key Service Files**:

- `src/services/GitService.ts` - Git worktree operations
- `src/services/GroveService.ts` - Grove lifecycle (create/close)
- `src/storage/SettingsService.ts` - User settings management
- `src/storage/GrovesService.ts` - Grove index and metadata
- `src/storage/GroveConfigService.ts` - .grove.json configuration

**Key Type Files**:

- `src/storage/types.ts` - Storage data structures
- `src/services/interfaces.ts` - Service interfaces
- `src/navigation/types.ts` - Screen routing types

**Entry Point**: `src/index.tsx` - CLI parsing and app bootstrap

### Current Limitations

1. **No AI/LLM Integration**: Chat screen exists but not connected to LLM
2. **Limited CLI Commands**: Only `--register` flag implemented
3. **Partial Test Coverage**: UI components not yet tested
4. **No Git Operations in Chat**: Chat doesn't execute git commands yet

### Future Expansion

**High Priority**:

- AI/LLM integration for chat (Anthropic Claude API)
- Connect chat to git operations (natural language commands)
- More CLI commands (list repos, list groves, etc.)

**Medium Priority**:

- Expand test coverage to UI components
- Git operations beyond worktrees (commit, push, pull)
- Command history in chat

## Getting Help

### Resources

- **Ink Documentation**: https://github.com/vadimdemedes/ink
- **React Documentation**: https://react.dev
- **TypeScript Documentation**: https://www.typescriptlang.org/docs/

### Project Documentation

- `README.md` - User-facing documentation
- `CLAUDE.md` - This file, AI assistant guide
- Source code comments and type definitions
- Git commit history for context

---

**Last Updated**: 2026-06-12
**Document Version**: 4.1.0
**Codebase State**: Active development with mature feature set and testing framework
**Lines of Code**: ~26,000 lines of source (~35,000 with tests)

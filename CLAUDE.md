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
- **Interactive UI**: 12-screen terminal interface built with React and Ink
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
6. **Screens Layer** (`src/screens/`) - 12 full-page UI screens
7. **Components Layer** (`src/components/`) - Reusable UI components
8. **Commands Layer** (`src/commands/`) - CLI command handlers
9. **Utils Layer** (`src/utils/`) - General utility functions

### Key Architectural Patterns

- **Dependency Injection**: Services use constructor injection for testability
- **Interface Segregation**: Services implement interfaces defined in `interfaces.ts`
- **Service Tokens**: Type-safe service resolution via branded tokens
- **React Context**: Navigation and DI integrated via React Context
- **Testing Strategy**: In-memory filesystem mocking with `memfs` for fast, isolated tests

### Storage Structure

All data is stored as JSON in `~/.grove/`:

**Global Storage** (`~/.grove/`):

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

### Configuration: `.grove.json`

Repositories can include a `.grove.json` file to customize grove creation:

```json
{
	"branchNameTemplate": "grove/${GROVE_NAME}",
	"fileCopyPatterns": [".env.example", "config/*.json"],
	"ide": "@phpstorm",
	"initActions": ["npm install", "cp .env.example .env"],
	"claudeSessionTemplates": {
		"konsole": "title: Claude ;; workdir: ${WORKING_DIR} ;; command: ${AGENT}",
		"kitty": "layout tall\ncd ${WORKING_DIR}\nlaunch --title \"claude\" ${AGENT}"
	}
}
```

**InitActions**: Execute sequentially in worktree directory after creation. Stop on first failure. Output logged to `grove-init-{worktreeName}.log`.

**Template Variables**:

- `${WORKING_DIR}`: Replaced with the working directory path
- `${AGENT}`: Replaced with the agent launch command. When opening a new session, this is `claude`. When resuming a session, this is `claude --resume <session_id>`.

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
- **Architecture**: Mature modular structure (~8,200 lines)
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

**Last Updated**: 2026-01-07
**Document Version**: 4.0.0
**Codebase State**: Active development with mature feature set and testing framework
**Lines of Code**: ~8,200 lines

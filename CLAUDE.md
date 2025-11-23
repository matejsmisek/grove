# CLAUDE.md - AI Assistant Guide for Grove

This document provides comprehensive information about the Grove codebase for AI assistants working on this project.

## Project Overview

**Grove** is a Git management CLI application powered by AI, built with modern web technologies adapted for terminal interfaces. It provides an interactive, Claude-like chat interface for managing Git operations through natural language.

### Key Features

- Interactive CLI interface with real-time chat
- Status bar showing processing state
- Message history with role-based styling (user/assistant/system)
- Text input for natural language commands
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
- **TypeScript Compiler** - Builds and type-checks the codebase
- **tsx** - TypeScript execution for development

## Codebase Structure

```
grove/
├── src/                    # Source files
│   ├── components/        # UI components
│   │   ├── types.ts       # Shared TypeScript interfaces
│   │   ├── App.tsx        # Main application component
│   │   ├── StatusBar.tsx  # Status bar component
│   │   ├── MessageList.tsx # Message list component
│   │   └── InputPrompt.tsx # Input prompt component
│   └── index.tsx          # Entry point - bootstraps and renders App
├── dist/                   # Compiled output (ignored by git)
├── node_modules/          # Dependencies (ignored by git)
├── package.json           # Project metadata and scripts
├── package-lock.json      # Locked dependency versions
├── tsconfig.json          # TypeScript configuration
├── eslint.config.js       # ESLint configuration
├── .gitignore            # Git ignore patterns
├── CLAUDE.md             # AI assistant guide (this file)
└── README.md             # User-facing documentation
```

### Current File Count

The project now has a modular component structure:

- **src/index.tsx** - Application entry point (6 lines)
- **src/components/App.tsx** - Main application component (54 lines)
- **src/components/types.ts** - Shared TypeScript interfaces (4 lines)
- **src/components/StatusBar.tsx** - Status bar component (20 lines)
- **src/components/MessageList.tsx** - Message list component (42 lines)
- **src/components/InputPrompt.tsx** - Input prompt component (36 lines)

## Key Files and Their Purposes

### src/index.tsx

**Purpose**: Application entry point and bootstrapping

**Key Responsibilities**:

- Import and render the main App component
- Minimal bootstrapping code only
- Provides the shebang for CLI execution

### src/components/App.tsx

**Purpose**: Main application component and state management

**Key Responsibilities**:

- **State Management**: Manages all application state:
  - Message state (conversation history)
  - Input state (current user input)
  - Processing state (async operation indicator)
- **Event Handlers**: Submit handler for processing user input
- **Component Composition**: Renders the modular UI components (StatusBar, MessageList, InputPrompt)

**Current Limitations**:

- AI integration is placeholder-only (setTimeout mock response)
- No actual Git operations implemented yet
- No persistence of conversation history

### src/components/types.ts

**Purpose**: Shared TypeScript type definitions

**Exports**:

- **Message Interface**: Defines message structure with role (user/assistant/system) and content

### src/components/StatusBar.tsx

**Purpose**: Display application status and processing indicator

**Props**:

- `isProcessing: boolean` - Controls the status indicator and text

**Features**:

- Shows "Grove" branding
- Processing state indicator (● for active, ○ for ready)
- Color-coded status (yellow during processing, green when ready)

### src/components/MessageList.tsx

**Purpose**: Render conversation message history

**Props**:

- `messages: Message[]` - Array of messages to display

**Features**:

- Role-based message styling (blue for user, green for assistant, cyan for system)
- Scrollable message history
- Formatted message display with role labels

### src/components/InputPrompt.tsx

**Purpose**: Handle user text input

**Props**:

- `isProcessing: boolean` - Disables input during processing
- `input: string` - Current input value
- `onInputChange: (value: string) => void` - Input change handler
- `onSubmit: (value: string) => void` - Submit handler

**Features**:

- Text input with placeholder
- Disabled state during processing
- Submit on Enter key

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
- Unused vars allowed with `_` prefix (argsIgnorePattern, varsIgnorePattern)
- Explicit function return types: OFF
- Explicit module boundary types: OFF
- no-explicit-any: WARN (not error)

## Development Workflows

### Setup

```bash
npm install
```

### Available Scripts

| Command             | Purpose                     | When to Use                                |
| ------------------- | --------------------------- | ------------------------------------------ |
| `npm run build`     | Compile TypeScript to dist/ | Before testing final build, before commits |
| `npm run dev`       | Watch mode compilation      | During active development                  |
| `npm run lint`      | Check for linting errors    | Before commits, in CI                      |
| `npm run lint:fix`  | Auto-fix linting issues     | When linting errors occur                  |
| `npm run typecheck` | Type-check without emitting | Quick validation without build             |

### Development Cycle

1. Make changes to TypeScript files in `src/`
2. Run `npm run dev` for automatic compilation
3. Test the CLI: `node dist/index.js` or `npm link` + `grove`
4. Run `npm run lint` to check for issues
5. Fix any TypeScript or ESLint errors
6. Build final output with `npm run build`

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

- **Indentation**: Tabs (as seen in index.tsx)
- **Quotes**: Single quotes for strings
- **Semicolons**: Required (enforced by TypeScript)
- **Line Length**: No strict limit but keep reasonable
- **Unused Variables**: Prefix with `_` if intentionally unused

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

### Recent Development History

1. **Initial commit** (0eb29ef) - Repository setup
2. **PR #1** (8e9b4b3) - TypeScript and ESLint environment
3. **PR #2** (638421f) - Claude-like Ink UI implementation
4. **Component Refactoring** (b186b3f) - Modular component structure with separate files

## Testing and Quality Assurance

### Current State

- **No test framework** installed yet
- **No test files** present
- **Type checking** via TypeScript compiler
- **Linting** via ESLint

### Quality Checks Before Committing

1. `npm run typecheck` - Ensure no TypeScript errors
2. `npm run lint` - Ensure no linting errors
3. `npm run build` - Ensure successful compilation
4. Manual testing of the CLI application

## Common Development Tasks

### Adding a New Feature

1. Create a feature branch (or use assigned Claude branch)
2. Identify if new files are needed or modifications to index.tsx
3. Follow React/Ink patterns for UI components
4. Update types/interfaces as needed
5. Test the feature in the CLI
6. Run quality checks (typecheck, lint, build)
7. Commit and push changes

### Modifying the UI

- **Status Bar**: Edit `src/components/StatusBar.tsx`
- **Message List/Response Area**: Edit `src/components/MessageList.tsx`
- **Input Prompt**: Edit `src/components/InputPrompt.tsx`
- **Message Types**: Edit `src/components/types.ts`
- **Main App/State Management**: Edit `src/components/App.tsx`
- **Application Bootstrap**: Edit `src/index.tsx` (rarely needed)

### Adding Dependencies

```bash
# Production dependency
npm install <package-name>

# Development dependency
npm install -D <package-name>
```

Always update package.json and commit package-lock.json.

### Code Organization Guidelines

Current organization (as of component refactoring):

- **Components**: Separated into individual files under `src/components/`
- **Types**: Shared types in `src/components/types.ts`
- **Main App**: `src/components/App.tsx` manages state and composition
- **Entry Point**: `src/index.tsx` contains minimal bootstrapping code

As the project continues to grow:

- Create utility functions in `src/utils/`
- Add additional types to `src/components/types.ts` or create separate type files
- Consider creating feature-specific folders under `src/` (e.g., `src/git/`, `src/ai/`)
- Keep index.tsx minimal (just bootstrapping)
- Keep App.tsx focused on top-level state and component composition

## Important Notes for AI Assistants

### Project Context

- **Early Stage**: Project is in initial development (v0.0.1)
- **Placeholder AI**: Current AI responses are mocked with setTimeout
- **No Git Integration**: Despite being a Git management tool, no Git operations implemented yet
- **Modular Architecture**: UI components split into separate files for better maintainability

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
- **Run** typecheck and lint before committing
- **Maintain** the modular component structure (one component per file)

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

# Check types without building
npm run typecheck

# Fix linting issues automatically
npm run lint:fix

# Install as global command for testing
npm link
grove
```

### Current Limitations to Be Aware Of

1. No actual AI/LLM integration (placeholder responses)
2. No Git command execution (core feature not implemented)
3. No error handling for user inputs
4. No command history or persistence
5. No configuration file support
6. No testing framework or tests

### Future Expansion Areas

- AI/LLM integration (OpenAI, Anthropic, or similar)
- Git command execution via child processes
- Command parsing and intent recognition
- Error handling and validation
- Configuration management
- Testing framework (Jest, Vitest, or similar)
- Advanced state management (if needed beyond useState)
- Logging and debugging utilities
- Command history and persistence

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
**Document Version**: 1.0.0
**Codebase State**: Early development (v0.0.1)

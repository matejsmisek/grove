# Grove

A CLI app using Ink and React to manage Git.

## Development

### Prerequisites

- Node.js >= 18.0.0
- npm

### Setup

```bash
npm install
```

### Scripts

- `npm run build` - Build the TypeScript project
- `npm run dev` - Build in watch mode
- `npm run lint` - Lint the codebase
- `npm run lint:fix` - Lint and auto-fix issues
- `npm run typecheck` - Type check without emitting files

### Project Structure

```
grove/
├── src/           # Source files
│   └── index.ts   # Entry point
├── dist/          # Compiled output
├── eslint.config.js  # ESLint configuration
├── tsconfig.json  # TypeScript configuration
└── package.json   # Project metadata
```

## Technology Stack

- **TypeScript** - Type-safe JavaScript
- **React** - UI library
- **Ink** - React for CLI applications
- **ESLint** - Code linting with typescript-eslint

## Configuration

### Repository Configuration (`.grove.json`)

You can configure Grove behavior per-repository by creating a `.grove.json` file in your repository root. For local overrides that shouldn't be committed, use `.grove.local.json`.

For monorepos, you can also place `.grove.json` files in project subdirectories to override root-level settings for specific projects.

#### Configuration Options

```json
{
	"branchNameTemplate": "grove/${GROVE_NAME}",
	"fileCopyPatterns": [".env.example", "*.config.js"],
	"ide": "@webstorm"
}
```

| Option               | Type                 | Description                                                         |
| -------------------- | -------------------- | ------------------------------------------------------------------- |
| `branchNameTemplate` | `string`             | Template for worktree branch names. Must contain `${GROVE_NAME}`.   |
| `fileCopyPatterns`   | `string[]`           | Glob patterns for files to copy to worktrees during grove creation. |
| `ide`                | `string` or `object` | IDE to use when opening this project (see below).                   |
| `initActions`        | `string[]`           | Commands to run after grove creation (not yet implemented).         |

#### IDE Configuration

The `ide` option allows you to specify which IDE should be used when opening worktrees for this repository/project, overriding the global default.

**Reference a global IDE** (uses your configured settings):

```json
{
	"ide": "@vscode"
}
```

Available IDE references:

- `@vscode` - Visual Studio Code
- `@phpstorm` - PhpStorm
- `@webstorm` - WebStorm
- `@idea` - IntelliJ IDEA
- `@pycharm` - PyCharm
- `@jetbrains-auto` - Auto-detect JetBrains IDE based on project files
- `@vim` - Vim/Neovim

**Custom IDE command**:

```json
{
	"ide": {
		"command": "code-insiders",
		"args": ["{path}"]
	}
}
```

The `{path}` placeholder will be replaced with the worktree path.

#### Monorepo Example

For a monorepo with different projects requiring different IDEs:

**Root `.grove.json`**:

```json
{
	"branchNameTemplate": "feature/${GROVE_NAME}",
	"ide": "@vscode"
}
```

**`packages/api/.grove.json`** (Python backend):

```json
{
	"ide": "@pycharm"
}
```

**`packages/web/.grove.json`** (React frontend):

```json
{
	"ide": "@webstorm"
}
```

Project-level settings override root settings, so the API package will open in PyCharm while the web package opens in WebStorm.

# Grove

**AI-powered Git worktree management CLI with an interactive terminal UI**

Grove is a modern command-line tool that makes managing Git worktrees effortless. Built with React and Ink, it provides an intuitive, interactive interface for creating and managing collections of worktrees (called "groves"), with support for monorepos, custom configurations, and seamless IDE integration.

## Features

- **Interactive Terminal UI** - Navigate with keyboard shortcuts in a beautiful CLI interface
- **Grove Management** - Create and manage collections of git worktrees across multiple repositories
- **Monorepo Support** - Select specific project folders within monorepos for grove creation
- **AI Agent Session Tracking** - Monitor active Claude Code sessions across your groves with live animated indicators
- **Smart IDE Integration** - Auto-detect and launch the right IDE (VS Code, JetBrains IDEs, Vim) for each project
- **JetBrains Auto-Detection** - Automatically selects the appropriate JetBrains IDE based on project files
- **Custom Configuration** - Per-repository `.grove.json` for branch naming, file copying, IDE preferences, init actions, and Claude session templates
- **Init Actions** - Automatically run bash commands (install dependencies, build, etc.) after worktree creation with live log streaming
- **Claude Integration** - Launch Claude CLI sessions with configurable terminal selection (Konsole, Kitty)
- **Claude Terminal Selection** - Choose your preferred terminal and customize session templates
- **Session Templates** - Customize Claude session files globally or per-repository with `${WORKING_DIR}` placeholder
- **Terminal Launcher** - Open terminal windows directly in your grove worktrees
- **Git Status Tracking** - See uncommitted changes and unpushed commits at a glance

## Installation

Install Grove globally via npm:

```bash
npm install -g grove
```

## Usage

### Quick Start

1. **Launch Grove**:

   ```bash
   grove
   ```

2. **Register a repository**:

   ```bash
   cd /path/to/your/repo
   grove --register
   ```

3. **Create a grove** - Use the interactive UI to create a new grove with worktrees for your registered repositories

### Commands

- `grove` - Launch the interactive UI
- `grove --register` - Register the current directory as a repository
- `grove --setup-hooks --agent <agent>` - Configure AI agent hooks for session tracking (e.g., `--agent claude`)
- `grove --verify-hooks --agent <agent>` - Verify which hooks are configured for an AI agent

### Interactive UI Navigation

Once in the interactive UI:

- **Arrow keys** - Navigate between items
- **Enter** - Select/confirm
- **Escape** - Go back/cancel
- **Tab** - Switch focus between panels
- **q** - Quit (when applicable)

### Workflow Example

1. Register your repositories:

   ```bash
   cd ~/projects/my-app
   grove --register

   cd ~/projects/my-api
   grove --register
   ```

2. Launch Grove and create a new grove for a feature:

   ```bash
   grove
   # Select "Create Grove"
   # Name it "feature-auth"
   # Select repositories/projects to include
   ```

3. Grove creates worktrees in `~/grove-worktrees/feature-auth/`:

   ```
   ~/grove-worktrees/feature-auth/
   ├── my-app/     (worktree on branch feature-auth)
   └── my-api/     (worktree on branch feature-auth)
   ```

4. Open in your IDE, terminal, or Claude for development

5. When done, close the grove to clean up worktrees

## AI Agent Session Tracking

Grove can monitor active AI agent sessions (like Claude Code) running in your groves and display their status with live animated indicators.

### Setup

Configure Grove to track Claude Code sessions:

```bash
grove --setup-hooks --agent claude
```

This automatically adds hooks to `~/.claude/settings.json` that notify Grove when:

- A Claude session starts
- Claude finishes responding (becomes idle)
- Claude needs your attention (permissions, timeouts)
- A session ends

**What gets configured:**

- Creates a backup of your Claude settings (`~/.claude/settings.json.backup`)
- Adds non-invasive hooks that run silently in the background
- Only adds hooks if they don't already exist (safe to run multiple times)

### Verification

Check if hooks are properly configured:

```bash
grove --verify-hooks --agent claude
```

This shows which hooks are active and which are missing.

### How It Works

1. **Automatic Detection** - When you open Grove's home screen, it automatically scans for active Claude sessions
2. **Session Mapping** - Sessions are mapped to their corresponding groves based on working directory
3. **Live Indicators** - Each grove displays session counts with animated indicators:
   - `✻ 2` - Active sessions (animated loader with Grove-style frames: `·` `✻` `✽` `✶` `✳` `✢`)
   - `· 1` - Idle sessions (waiting for input)
   - `⚠ 1` - Sessions needing attention
4. **Background Updates** - Status updates happen in the background without blocking the UI

### Session Status Indicators

| Indicator | Status             | Description                                   |
| --------- | ------------------ | --------------------------------------------- |
| `✻ 2`     | Active (animated)  | Claude is actively processing or working      |
| `· 1`     | Idle               | Claude finished responding, waiting for input |
| `⚠ 1`    | Needs Attention    | Claude needs user action (permission, etc.)   |
| (none)    | No active sessions | No Claude sessions running in this grove      |

### Data Storage

Session data is stored in `~/.grove/sessions.json` and includes:

- Session ID and agent type (claude, gemini, codex, etc.)
- Grove and workspace mappings
- Current status and running state
- Metadata (branch, timestamps, etc.)

Sessions are automatically cleaned up after 60 minutes of inactivity.

### Privacy & Performance

- **Non-invasive** - Hooks run silently and don't interfere with Claude's operation
- **Lightweight** - Session detection happens in the background
- **Local-only** - All data stored locally in `~/.grove/`
- **Minimal overhead** - No impact on Claude Code performance

### Future Agent Support

Grove's session tracking is designed to be extensible. Future support planned for:

- **Gemini Code** - Google's AI coding assistant
- **Codex** - OpenAI's coding assistant
- **Custom agents** - Extensible adapter system for any AI agent

## Configuration

### Repository Configuration (`.grove.json`)

You can configure Grove behavior per-repository by creating a `.grove.json` file in your repository root. For local overrides that shouldn't be committed, use `.grove.local.json`.

For monorepos, you can also place `.grove.json` files in project subdirectories to override root-level settings for specific projects.

#### Configuration Options

```json
{
	"branchNameTemplate": "grove/${GROVE_NAME}",
	"fileCopyPatterns": [".env.example", "*.config.js"],
	"ide": "@webstorm",
	"initActions": ["npm install", "npm run build"],
	"claudeSessionTemplates": {
		"konsole": {
			"content": "title: Claude ;; workdir: ${WORKING_DIR} ;; command: claude\n"
		}
	}
}
```

| Option                   | Type                 | Description                                                                                  |
| ------------------------ | -------------------- | -------------------------------------------------------------------------------------------- |
| `branchNameTemplate`     | `string`             | Template for worktree branch names. Must contain `${GROVE_NAME}`.                            |
| `fileCopyPatterns`       | `string[]`           | Glob patterns for files to copy to worktrees during grove creation.                          |
| `ide`                    | `string` or `object` | IDE to use when opening this project (see below).                                            |
| `initActions`            | `string[]`           | Bash commands to execute after worktree creation. Runs sequentially, stops on first failure. |
| `claudeSessionTemplates` | `object`             | Custom session templates for Claude terminals with `${WORKING_DIR}` placeholder.             |

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

#### Claude Session Templates

The `claudeSessionTemplates` option allows you to customize the session/tabs files used when opening Claude in a terminal. Templates use the `${WORKING_DIR}` placeholder which gets replaced with the worktree path.

**Template Priority** (highest to lowest):

1. Project-level `.grove.json` (for monorepos)
2. Repository-level `.grove.json`
3. Global settings (`~/.grove/settings.json` via Settings → Claude Terminal Settings)
4. Built-in defaults

**Example templates**:

```json
{
	"claudeSessionTemplates": {
		"konsole": {
			"content": "title: Claude ;; workdir: ${WORKING_DIR} ;; command: claude\ntitle: Tests ;; workdir: ${WORKING_DIR} ;; command: npm test\n"
		},
		"kitty": {
			"content": "layout tall\ncd ${WORKING_DIR}\nlayout tall:bias=65;full_size=1\nlaunch --title \"claude\" claude\nlaunch --title \"tests\" npm test\n"
		}
	}
}
```

This example creates a Konsole session with two tabs (Claude and Tests) or a Kitty session with the same layout.

**Accessing Global Settings:**

- Navigate to **Settings → Claude Terminal Settings**
- Select your preferred terminal (Konsole or Kitty)
- Press `c` to configure templates
- Templates configured here apply globally unless overridden by repository configs

#### Init Actions

The `initActions` option allows you to automatically run bash commands after a worktree is created. This is useful for:

- Installing dependencies (`npm install`, `composer install`, etc.)
- Building the project (`npm run build`, `make`, etc.)
- Setting up development environments
- Running database migrations
- Any other setup tasks

**Key Features**:

- Commands execute sequentially in order
- Execution stops on first failure (non-zero exit code)
- Live progress displayed during grove creation
- Full logs saved to `{grove-folder}/grove-init-{worktree}.log`
- Logs viewable from Grove Detail screen via "View Init Log" action
- For monorepos, commands run in the project directory

**Example**:

```json
{
	"initActions": [
		"echo 'Setting up project...'",
		"npm install --silent",
		"npm run build",
		"echo 'Setup complete!'"
	]
}
```

**Log Output**:

During grove creation, you'll see live output:

```
Creating worktree for my-app...
[my-app] Starting initActions (4 commands)...
[my-app] Running: echo 'Setting up project...'
[my-app] Setting up project...
[my-app] ✓ Command completed successfully
[my-app] Running: npm install --silent
[my-app] added 340 packages...
[my-app] ✓ Command completed successfully
[my-app] Running: npm run build
[my-app] > build
[my-app] ✓ Command completed successfully
[my-app] ✓ SUCCESS: 4/4 actions completed
```

Full logs are saved to the grove directory for later review.

#### Monorepo Example

For a monorepo with different projects requiring different IDEs and init actions:

**Root `.grove.json`**:

```json
{
	"branchNameTemplate": "feature/${GROVE_NAME}",
	"ide": "@vscode",
	"fileCopyPatterns": [".env.example"]
}
```

**`packages/api/.grove.json`** (Python backend):

```json
{
	"ide": "@pycharm",
	"initActions": [
		"python -m venv venv",
		"source venv/bin/activate",
		"pip install -r requirements.txt"
	]
}
```

**`packages/web/.grove.json`** (React frontend):

```json
{
	"ide": "@webstorm",
	"initActions": ["npm install", "npm run build"]
}
```

Project-level settings override root settings, so:

- The API package will open in PyCharm and run Python setup commands
- The web package will open in WebStorm and run npm commands
- Both inherit the branch template from root
- InitActions run in their respective project directories

## Requirements

- **Node.js** >= 18.0.0
- **Git** >= 2.5.0 (for worktree support)
- **Supported Operating Systems**: Linux, macOS
- **Optional**: IDEs (VS Code, JetBrains IDEs, Vim) for IDE integration
- **Optional**: Konsole or Kitty terminal for Claude integration
- **Optional**: Claude Code for AI session tracking

## Development

Want to contribute to Grove? Here's how to set up your development environment:

### Prerequisites

- Node.js >= 18.0.0
- npm

### Setup

```bash
# Clone the repository
git clone https://github.com/matejsmisek/grove.git
cd grove

# Install dependencies
npm install

# Build the project
npm run build

# Link for local testing
npm link
```

### Available Scripts

- `npm run build` - Build the TypeScript project
- `npm run dev` - Build in watch mode for development
- `npm run lint` - Check for linting errors
- `npm run lint:fix` - Auto-fix linting issues
- `npm run format` - Format code with Prettier
- `npm run typecheck` - Type-check without emitting files

### Technology Stack

- **TypeScript** - Type-safe JavaScript with strict mode
- **React** - UI component library
- **Ink** - React renderer for CLI applications
- **ESLint** - Code linting with typescript-eslint
- **Prettier** - Code formatting

### Project Structure

The project follows a modular architecture with dependency injection:

- `src/components/` - React UI components
- `src/screens/` - Full-page screen components
- `src/services/` - Business logic services
- `src/storage/` - Persistence layer
- `src/navigation/` - Routing system
- `src/di/` - Dependency injection container

For detailed documentation, see [CLAUDE.md](https://github.com/matejsmisek/grove/blob/main/CLAUDE.md).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Guidelines

- Follow the existing code style (enforced by ESLint and Prettier)
- Run `npm run typecheck` before committing
- Write clear commit messages
- Update documentation as needed

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [Ink](https://github.com/vadimdemedes/ink) - React for CLI apps
- Inspired by modern Git workflows and the need for better worktree management

## Support

- **Issues**: [GitHub Issues](https://github.com/matejsmisek/grove/issues)
- **Documentation**: See [CLAUDE.md](https://github.com/matejsmisek/grove/blob/main/CLAUDE.md) for comprehensive development documentation

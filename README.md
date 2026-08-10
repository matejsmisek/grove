# HyperGrove

**Yet another git worktree management CLI with an interactive terminal UI**

## What it solves

Creating worktree with git for claude is easy, but its also easy to get lost in them.
Especially if run several parallel worktrees at the same time. Switching folders, tracking claude sessions,
opening IDE in the right worktree folders. All that can get complicated real fast.

Hypergrove takes it to the next level. The main principle is that you create "groves" which is a group of
several worktrees. You can add more worktrees into the grove later, close already completed one and see
all the work in one place. Think of a grove as "user story" task representation and each worktree the actual
dev implementation. Some stories need just one task, some need dozen. All of that is grouped into one grove.

### Unique features

- Shortcuts to open terminal or IDE in the worktree folder
- Start and track Claude sessions per worktree in the UI
- Monorepo support to open IDE right in the repository subfolder
- Setup config file in your project repository to tell grove what files to copy to worktree (like gitignored files) or what bash actions to run after creation (npm install)
- Create terminal template to tell grove exactly how you want your terminal or claude window to launch
  - Tabs, terminal windows with npm run dev, claude parameters, all that set within the template

## Installation

Install Grove globally via npm:

```bash
npm install -g hypergrove
```

## Usage

### Quick Start

**Launch Grove**:

```bash
cd your-repository
grove
```

Each grove will then be creating within your repo under .grove folder

### Adopting Existing Worktrees

Worktrees created outside Grove (e.g. with plain `git worktree add`) can be adopted into a grove so they show up in the UI like any other worktree:

```bash
grove adopt-worktree <grove-id> <path-to-worktree> [name]
```

The worktree stays where it is on disk and keeps its branch — only grove metadata is written. Its repository must be registered, and the name defaults to the worktree's folder name. Find grove ids with `grove list`.

Note: once adopted, the worktree is managed like any other — closing it (or its grove) removes the worktree from disk.

### Grove Claude Code skill

Grove ships a Claude Code **skill** (bundled as a plugin) that teaches Claude to
orchestrate groves — create worktrees and launch parallel agents. Install it once:

```bash
grove skill install      # register + install the plugin at user scope (all repos)
```

The first-run setup wizard also offers to install it. Other actions:

```bash
grove skill status       # show installed vs. bundled skill version
grove skill update       # sync the installed skill to the bundled version
grove skill uninstall    # remove the plugin and its marketplace
```

The skill is versioned with Grove itself: when you `npm install -g hypergrove@latest`,
Grove syncs the installed skill on next launch (restart Claude Code to apply). This
requires the [Claude Code](https://claude.ai/code) CLI to be installed.

### Interactive UI Navigation

Once in the interactive UI:

- **Arrow keys** - Navigate between items
- **Enter** - Select/confirm
- **Escape** - Go back/cancel

Or use your mouse to click on panels and items

## Configuration

### Environment Variables

| Variable           | Description                                                                                                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GROVE_GLOBAL_DIR` | Overrides the folder used to store global Grove settings (default: `~/.grove`). The directory is created on startup if it doesn't exist; Grove exits with an error if it can't be. |

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

- **Issues**: [GitHub Issues](https://github.com/matejsmisek/hypergrove/issues)

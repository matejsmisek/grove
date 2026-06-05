#!/usr/bin/env node
import React from 'react';

import { render } from 'ink';

import {
	addWorktree,
	createGrove,
	formatGrovesText,
	groveStatus,
	handleSessionHook,
	initWorkspace,
	listGroves,
	openClaude,
	registerRepository,
	setupAgentHooks,
	verifyAgentHooks,
} from './commands/index.js';
import { App } from './components/App.js';
import { FatalConfigError } from './components/FatalConfigError.js';
import { getContainer } from './di/index.js';
import { detectMonorepo } from './git/index.js';
import {
	RepositoryServiceToken,
	SessionsServiceToken,
	WorkspaceService,
	WorkspaceServiceToken,
	detectTerminal,
	initializeServices,
} from './services/index.js';
import { AgentType, SettingsService } from './storage/index.js';
import {
	GROVE_GLOBAL_DIR_ENV,
	GlobalGroveDirError,
	ensureGlobalGroveFolder,
	ensureGroveGitExcluded,
} from './utils/index.js';

// Resolve and create the global Grove directory (honoring GROVE_GLOBAL_DIR)
// before any storage is touched. If it can't be used, show a full-screen error
// and exit instead of failing later with a cryptic message.
try {
	ensureGlobalGroveFolder();
} catch (error) {
	if (error instanceof GlobalGroveDirError) {
		console.clear();
		const { waitUntilExit } = render(
			<FatalConfigError
				title="Invalid Grove configuration"
				message={error.message}
				hints={[
					`Set ${GROVE_GLOBAL_DIR_ENV} to a writable directory, or unset it to use the default ~/.grove.`,
					'Make sure the path is a directory (not a file) and that you have permission to create it.',
				]}
			/>
		);
		await waitUntilExit();
		process.exit(1);
	}
	throw error;
}

// Discover workspace context
const workspaceService = new WorkspaceService();
const workspaceContext = workspaceService.resolveContext(process.cwd());

// Create workspace-aware settings service
const settingsService = new SettingsService(workspaceContext);

// Detect a first run (no settings.json yet) before storage is initialized,
// since initializeStorage() creates a default settings file. Used to launch
// the interactive setup wizard. The setup wizard only configures the global
// working folder, so it is only relevant in global mode - workspace and
// repo-scoped modes derive their groves folder from the context.
const isFirstRun = workspaceContext.type === 'global' && !settingsService.hasSettingsFile();

// Initialize storage before rendering the app
// If in a workspace, this will initialize the workspace's .grove folder
// If global, this will initialize ~/.grove
settingsService.initializeStorage();

// Initialize DI services with workspace context FIRST
// This must happen before any commands are executed
initializeServices(undefined, workspaceContext);

// Set the workspace context in the DI container's WorkspaceService
// so it can be accessed by components
const container = getContainer();
const workspaceServiceFromDI = container.resolve(WorkspaceServiceToken);
workspaceServiceFromDI.setCurrentContext(workspaceContext);

// In repo-scoped mode the current git repository is operated on implicitly:
// keep Grove's data dir out of version control and auto-provide the repo so
// the user never has to register it.
if (workspaceContext.type === 'repo' && workspaceContext.repoPath) {
	ensureGroveGitExcluded(workspaceContext.repoPath);
	const repositoryService = container.resolve(RepositoryServiceToken);
	if (!repositoryService.isRepositoryRegistered(workspaceContext.repoPath)) {
		const isMonorepo = await detectMonorepo(workspaceContext.repoPath);
		repositoryService.addRepository(workspaceContext.repoPath, { isMonorepo });
	}
}

// Register the launched location (workspace or repo) in the central index,
// keyed by a stable id stored in the location's own marker. This ensures it is
// discoverable from the global switcher, generates+migrates an id when missing,
// and dedupes the central record when the same location is launched from a new
// path (a move).
if (workspaceContext.type === 'workspace' || workspaceContext.type === 'repo') {
	workspaceServiceFromDI.registerLocation(workspaceContext);
}

// Detect terminal on startup if not already configured.
// On a first run the setup wizard handles terminal selection, so skip it here.
const settings = settingsService.readSettings();
if (!isFirstRun && !settings.terminal) {
	const terminalConfig = await detectTerminal(settings.selectedClaudeTerminal);
	if (terminalConfig) {
		settingsService.updateSettings({ terminal: terminalConfig });
	}
}

// Parse command-line arguments
const args = process.argv.slice(2);

// Handle --help / -h flag
if (args.includes('--help') || args.includes('-h')) {
	const version = '1.0.0';
	console.log(`Grove v${version} - Git worktree management CLI`);
	console.log('');
	console.log('Usage: grove [command] [options]');
	console.log('');
	console.log('Commands:');
	console.log('  (no command)                                  Open interactive UI');
	console.log('  create <name> <repository>                    Create a new grove with a worktree');
	console.log(
		'  create <name> --empty                         Create an empty grove without worktrees'
	);
	console.log('  add-worktree <grove-id> <name> <repository>   Add a worktree to an existing grove');
	console.log(
		'  add-worktree <grove-id> <name> --fork <wt-id> [repo]  Fork a worktree (same repo, branch off its branch)'
	);
	console.log('  claude [grove-id]                             Open Claude CLI for a grove');
	console.log('  list [--json]                                 List all groves and their worktrees');
	console.log(
		'  status [--json]                               Show grove/worktree info for the current directory'
	);
	console.log(
		'  workspace init                                Initialize a workspace in the current directory'
	);
	console.log('  session-hook [--agent-type <type>]             Handle session lifecycle hooks');
	console.log('');
	console.log('Options:');
	console.log(
		'  --register                                    Register current directory as a repository'
	);
	console.log(
		'  --setup-hooks [--agent <type>]                 Set up agent hooks (default: claude)'
	);
	console.log('  --verify-hooks [--agent <type>]                Verify agent hooks are configured');
	console.log('  -h, --help                                    Show this help message');
	console.log('');
	console.log('Repository format: reponame or reponame.projectfolder');
	console.log('');
	console.log('Run grove without arguments to launch the interactive terminal UI.');
	process.exit(0);
}

// Handle workspace commands
if (args[0] === 'workspace' && args[1] === 'init') {
	(async () => {
		const result = await initWorkspace();

		if (result.success) {
			console.log('✓', result.message);
			if (result.workspacePath) {
				console.log('  Workspace path:', result.workspacePath);
			}
			if (result.grovesFolder) {
				console.log('  Groves folder:', result.grovesFolder);
			}
			process.exit(0);
		} else {
			console.error('✗', result.message);
			process.exit(1);
		}
	})();
} else if (args[0] === 'create') {
	// Handle create command: grove create <name> [repository]
	// Name can have spaces - all args between 'create' and last non-repo arg are joined as the name
	// If --empty flag is present, creates grove without worktrees
	// Last argument is the repository (unless --empty is used)
	(async () => {
		const createArgs = args.slice(1);
		const isEmpty = createArgs.includes('--empty');
		const filteredArgs = createArgs.filter((a) => a !== '--empty');

		if (filteredArgs.length < 1) {
			console.error('✗ Usage: grove create <name> [repository]');
			console.error('  grove create <name> --empty');
			console.error('  repository format: reponame or reponame.projectfolder');
			process.exit(1);
		}

		let name: string;
		let repository: string | undefined;

		if (isEmpty) {
			// All remaining args form the name
			name = filteredArgs.join(' ');
		} else if (filteredArgs.length < 2) {
			console.error('✗ Usage: grove create <name> <repository>');
			console.error('  grove create <name> --empty');
			console.error('  repository format: reponame or reponame.projectfolder');
			process.exit(1);
		} else {
			repository = filteredArgs[filteredArgs.length - 1];
			name = filteredArgs.slice(0, -1).join(' ');
		}

		const result = await createGrove(name, repository);

		if (result.success) {
			console.log('✓', result.message);
			if (result.grovePath) {
				console.log('  Path:', result.grovePath);
			}
			if (result.groveId) {
				console.log('  ID:', result.groveId);
			}
			process.exit(0);
		} else {
			console.error('✗', result.message);
			process.exit(1);
		}
	})();
} else if (args[0] === 'add-worktree') {
	// Handle add-worktree command:
	//   grove add-worktree <grove-id> <name> <repository>
	//   grove add-worktree <grove-id> <name> --fork <worktree-id>
	// Adds a worktree to an existing grove. With --fork, the new worktree uses the same
	// repository/project as the named worktree and branches off its branch.
	(async () => {
		const addArgs = args.slice(1);

		// Extract the optional --fork <worktree-id> flag.
		const forkIndex = addArgs.indexOf('--fork');
		let forkFromWorktreeId: string | undefined;
		let positional = addArgs;
		if (forkIndex !== -1) {
			forkFromWorktreeId = addArgs[forkIndex + 1];
			if (!forkFromWorktreeId) {
				console.error('✗ --fork requires a worktree id');
				process.exit(1);
			}
			positional = addArgs.filter((_, i) => i !== forkIndex && i !== forkIndex + 1);
		}

		const groveId = positional[0];

		let result;
		if (forkFromWorktreeId) {
			// Fork mode: repository is optional. When at least a name and a repository are present
			// (>= 2 tokens after the grove id), the last token is treated as the repository; it must
			// resolve to the source worktree's repository (a different project is allowed for
			// monorepos). With only a name, the source worktree's repository/project are reused.
			const rest = positional.slice(1);
			let worktreeName: string;
			let repository: string | undefined;
			if (rest.length >= 2) {
				repository = rest[rest.length - 1];
				worktreeName = rest.slice(0, -1).join(' ');
			} else {
				worktreeName = rest.join(' ');
			}

			if (!groveId || !worktreeName) {
				console.error(
					'✗ Usage: grove add-worktree <grove-id> <name> --fork <worktree-id> [repository]'
				);
				process.exit(1);
			}
			result = await addWorktree(groveId, worktreeName, repository, forkFromWorktreeId);
		} else {
			if (positional.length < 3) {
				console.error('✗ Usage: grove add-worktree <grove-id> <name> <repository>');
				console.error('  grove add-worktree <grove-id> <name> --fork <worktree-id>');
				console.error('  repository format: reponame or reponame.projectfolder');
				process.exit(1);
			}

			const repository = positional[positional.length - 1];
			const worktreeName = positional.slice(1, -1).join(' ');
			result = await addWorktree(groveId, worktreeName, repository);
		}

		if (result.success) {
			console.log('✓', result.message);
			if (result.worktreeId) {
				console.log('  ID:', result.worktreeId);
			}
			if (result.worktreeName) {
				console.log('  Name:', result.worktreeName);
			}
			if (result.worktreePath) {
				console.log('  Folder:', result.worktreePath);
			}
			process.exit(0);
		} else {
			console.error('✗', result.message);
			process.exit(1);
		}
	})();
} else if (args[0] === 'claude') {
	// Handle claude command: grove claude [grove-id]
	const groveId = args[1]; // Optional grove ID
	const result = openClaude(groveId);

	if (result.success) {
		console.log('✓', result.message);
		process.exit(0);
	} else {
		console.error('✗', result.message);
		process.exit(1);
	}
} else if (args[0] === 'list') {
	// Handle list command: grove list [--json]
	const jsonOutput = args.includes('--json');
	const result = listGroves();

	if (result.success) {
		if (jsonOutput) {
			console.log(JSON.stringify(result.groves, null, 2));
		} else {
			console.log(formatGrovesText(result));
		}
		process.exit(0);
	} else {
		console.error('✗', result.message);
		process.exit(1);
	}
} else if (args[0] === 'status') {
	// Handle status command: grove status [--json]
	// Detects the grove worktree containing the current directory and prints
	// the grove ID, worktree ID, and repository (repo.project for monorepos).
	const jsonOutput = args.includes('--json');
	const result = groveStatus();

	if (jsonOutput) {
		console.log(JSON.stringify(result, null, 2));
		process.exit(result.success ? 0 : 1);
	}

	if (result.success) {
		if (result.groveId) {
			console.log('Grove ID:  ', result.groveId);
		}
		if (result.worktreeId) {
			console.log('Worktree:  ', result.worktreeId);
		}
		if (result.repository) {
			console.log('Repository:', result.repository);
		}
		process.exit(0);
	} else {
		console.error('✗', result.message);
		process.exit(1);
	}
} else if (args.includes('--register')) {
	// Handle --register flag
	const result = await registerRepository();

	if (result.success) {
		console.log('✓', result.message);
		if (result.path) {
			console.log('  Path:', result.path);
		}
		process.exit(0);
	} else {
		console.error('✗', result.message);
		process.exit(1);
	}
} else if (args.includes('session-hook')) {
	// Handle unified session-hook command (reads JSON from stdin)
	(async () => {
		const agentType = (getArgValue('--agent-type') || 'claude') as AgentType;
		const sessionsService = container.resolve(SessionsServiceToken);
		const result = await handleSessionHook(sessionsService, agentType);

		if (result.success) {
			// Silent success for hooks - don't clutter output
			process.exit(0);
		} else {
			console.error('✗', result.message);
			process.exit(1);
		}
	})();
} else if (args.includes('--setup-hooks')) {
	// Handle setup-hooks command
	(async () => {
		const agentType = (getArgValue('--agent') || 'claude') as AgentType;
		const result = await setupAgentHooks(agentType);

		if (result.success) {
			console.log('✓', result.message);
			if (result.details && result.details.length > 0) {
				result.details.forEach((detail) => console.log('  ', detail));
			}
			process.exit(0);
		} else {
			console.error('✗', result.message);
			if (result.details && result.details.length > 0) {
				result.details.forEach((detail) => console.error('  ', detail));
			}
			process.exit(1);
		}
	})();
} else if (args.includes('--verify-hooks')) {
	// Handle verify-hooks command
	(async () => {
		const agentType = (getArgValue('--agent') || 'claude') as AgentType;
		const result = await verifyAgentHooks(agentType);

		console.log(`Agent: ${agentType}`);
		console.log(`Configured: ${result.configured ? 'Yes' : 'No'}`);
		if (result.hooks.length > 0) {
			console.log(`Active hooks: ${result.hooks.join(', ')}`);
		}
		if (result.missing.length > 0) {
			console.log(`Missing hooks: ${result.missing.join(', ')}`);
		}

		process.exit(result.configured ? 0 : 1);
	})();
} else {
	// Clear terminal to give app full height
	console.clear();
	// Choose the initial screen:
	// - global (no workspace, no git repo): the workspace/repo switcher
	// - first run in a context that needs setup: the setup wizard
	// - otherwise: the normal home screen for the current context
	const initialScreen =
		workspaceContext.type === 'global' ? 'globalHome' : isFirstRun ? 'setupWizard' : 'home';
	// Start the interactive UI
	render(<App initialScreen={initialScreen} />);
}

/**
 * Helper function to get argument value
 */
function getArgValue(flag: string): string {
	const index = args.indexOf(flag);
	if (index === -1 || index === args.length - 1) {
		console.error(`Missing value for ${flag}`);
		process.exit(1);
	}
	return args[index + 1];
}

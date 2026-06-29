#!/usr/bin/env node
import React from 'react';

import { render } from 'ink';

import {
	addWorktree,
	checkForUpdate,
	createGrove,
	formatGrovesText,
	groveStatus,
	handleSessionHook,
	initWorkspace,
	listGroves,
	openClaude,
	openClaudeFromAsana,
	parseArgs,
	registerRepository,
	setupAgentHooks,
	verifyAgentHooks,
} from './commands/index.js';
import { App } from './components/App.js';
import { FatalConfigError } from './components/FatalConfigError.js';
import { getContainer } from './di/index.js';
import { detectMonorepo } from './git/index.js';
import type { Routes } from './navigation/types.js';
import {
	RepositoryServiceToken,
	SessionsServiceToken,
	UpdateServiceToken,
	WorkspaceService,
	WorkspaceServiceToken,
	detectAvailableTerminals,
	initializeServices,
} from './services/index.js';
import { AgentType, SettingsService } from './storage/index.js';
import { shouldOfferDirenvWhitelist } from './utils/direnvWhitelist.js';
import {
	GROVE_GLOBAL_DIR_ENV,
	GlobalGroveDirError,
	ensureGlobalGroveFolder,
	ensureGroveGitExcluded,
	getAppVersion,
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
if (!isFirstRun && !settings.selectedTerminal) {
	const [detected] = await detectAvailableTerminals();
	if (detected) {
		settingsService.updateSettings({ selectedTerminal: detected });
	}
}

// Parse command-line arguments into a command, then dispatch.
const command = parseArgs(process.argv.slice(2));

if (command.cmd === 'help') {
	const version = getAppVersion();
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
	console.log(
		'  add-worktree <grove-id> --asana <url> <repository>    Add a worktree named from an Asana task'
	);
	console.log('  claude [grove-id]                             Open Claude CLI for a grove');
	console.log(
		'  claude-asana [worktree-id] [--asana <url>]    Launch background Claude from an Asana task (no editor)'
	);
	console.log('  list [--json]                                 List all groves and their worktrees');
	console.log(
		'  update                                        Check for a newer version and print the update command'
	);
	console.log(
		'  status [--json]                               Show grove/worktree info for the current directory'
	);
	console.log(
		'  workspace init                                Initialize a workspace in the current directory'
	);
	console.log(
		'  workspace add-repository [path]               Register a repository (default: current directory)'
	);
	console.log('  session-hook [--agent-type <type>]             Handle session lifecycle hooks');
	console.log('');
	console.log('Options:');
	console.log(
		'  --setup-hooks [--agent <type>]                 Set up agent hooks (default: claude)'
	);
	console.log('  --verify-hooks [--agent <type>]                Verify agent hooks are configured');
	console.log('  -h, --help                                    Show this help message');
	console.log('  -v, --version                                 Show the installed version');
	console.log('');
	console.log('Repository format: reponame or reponame.projectfolder');
	console.log('');
	console.log('Run grove without arguments to launch the interactive terminal UI.');
	process.exit(0);
} else if (command.cmd === 'version') {
	console.log(getAppVersion());
	process.exit(0);
} else if (command.cmd === 'update') {
	const updateService = container.resolve(UpdateServiceToken);
	const result = await checkForUpdate(updateService);
	result.lines.forEach((line) => console.log(line));
	process.exit(result.success ? 0 : 1);
} else if (command.cmd === 'error') {
	command.lines.forEach((line) => console.error(line));
	process.exit(1);
} else if (command.cmd === 'workspace-init') {
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
} else if (command.cmd === 'create') {
	const result = await createGrove(command.name, command.repository);

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
} else if (command.cmd === 'add-worktree') {
	const result = await addWorktree(
		command.groveId,
		command.name,
		command.repository,
		command.forkFromWorktreeId,
		command.asanaUrl
	);

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
} else if (command.cmd === 'claude') {
	const result = await openClaude(command.groveId);

	if (result.success) {
		console.log('✓', result.message);
		process.exit(0);
	} else {
		console.error('✗', result.message);
		process.exit(1);
	}
} else if (command.cmd === 'claude-asana') {
	const result = await openClaudeFromAsana(command.worktreeId, command.asanaUrl);

	if (result.success) {
		console.log('✓', result.message);
		process.exit(0);
	} else {
		console.error('✗', result.message);
		process.exit(1);
	}
} else if (command.cmd === 'list') {
	const result = listGroves();

	if (result.success) {
		if (command.json) {
			console.log(JSON.stringify(result.groves, null, 2));
		} else {
			console.log(formatGrovesText(result));
		}
		process.exit(0);
	} else {
		console.error('✗', result.message);
		process.exit(1);
	}
} else if (command.cmd === 'status') {
	const result = groveStatus();

	if (command.json) {
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
} else if (command.cmd === 'add-repository') {
	const result = await registerRepository(command.path);

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
} else if (command.cmd === 'session-hook') {
	// Reads JSON from stdin; silent success so hooks don't clutter output.
	const sessionsService = container.resolve(SessionsServiceToken);
	const result = await handleSessionHook(sessionsService, command.agentType as AgentType);

	if (result.success) {
		process.exit(0);
	} else {
		console.error('✗', result.message);
		process.exit(1);
	}
} else if (command.cmd === 'setup-hooks') {
	const result = await setupAgentHooks(command.agentType as AgentType);

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
} else if (command.cmd === 'verify-hooks') {
	const result = await verifyAgentHooks(command.agentType as AgentType);

	console.log(`Agent: ${command.agentType}`);
	console.log(`Configured: ${result.configured ? 'Yes' : 'No'}`);
	if (result.hooks.length > 0) {
		console.log(`Active hooks: ${result.hooks.join(', ')}`);
	}
	if (result.missing.length > 0) {
		console.log(`Missing hooks: ${result.missing.join(', ')}`);
	}

	process.exit(result.configured ? 0 : 1);
} else {
	// command.cmd === 'ui'
	// Clear terminal to give app full height
	console.clear();
	// Choose the initial screen:
	// - global (no workspace, no git repo): the workspace/repo switcher
	// - first run in a context that needs setup: the setup wizard
	// - repo/workspace mode where the auto-derived groves folder isn't yet
	//   trusted by direnv: a one-time trust prompt (the wizard never runs here)
	// - otherwise: the normal home screen for the current context
	let initialScreen: keyof Routes;
	if (workspaceContext.type === 'global') {
		initialScreen = 'globalHome';
	} else if (isFirstRun) {
		initialScreen = 'setupWizard';
	} else {
		const settings = settingsService.readSettings();
		initialScreen = shouldOfferDirenvWhitelist(
			settings.workingFolder,
			settings.direnvWhitelistPromptedFolder
		)
			? 'direnvTrust'
			: 'home';
	}
	// Start the interactive UI
	render(<App initialScreen={initialScreen} />);
}

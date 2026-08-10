/**
 * CLI argument parsing.
 *
 * `parseArgs` is a pure function: it turns the raw argv (everything after
 * `node grove`) into a discriminated {@link ParsedCommand} union. It performs no
 * I/O and never calls `process.exit` — usage errors are returned as an `error`
 * command whose `lines` the caller prints to stderr before exiting. This keeps
 * the dispatch in `index.tsx` to "parse → act" and makes the parsing logic
 * exhaustively testable.
 */

/** The default agent type when an `--agent`/`--agent-type` flag is omitted. */
export const DEFAULT_AGENT_TYPE = 'claude';

/**
 * A parsed CLI command. Each variant carries exactly the data its handler needs.
 * `agentType` is returned as a plain string and narrowed to `AgentType` by the
 * caller.
 */
export type ParsedCommand =
	| { cmd: 'help' }
	| { cmd: 'version' }
	| { cmd: 'update' }
	| { cmd: 'workspace-init' }
	| { cmd: 'create'; name: string; repository?: string; empty: boolean }
	| {
			cmd: 'add-worktree';
			groveId: string;
			name: string;
			repository?: string;
			forkFromWorktreeId?: string;
			/**
			 * Asana task URL the worktree is created from. When set, the worktree name is
			 * resolved from the task (the `name` positional is omitted) and the task is
			 * recorded as the worktree's external reference, mirroring the UI flow.
			 */
			asanaUrl?: string;
	  }
	| {
			cmd: 'adopt-worktree';
			groveId: string;
			/** Path (relative or absolute) to the existing worktree to adopt */
			path: string;
			/** Display name; defaults to the worktree folder name */
			name?: string;
	  }
	| { cmd: 'claude'; groveId?: string }
	| { cmd: 'claude-asana'; worktreeId?: string; asanaUrl?: string }
	| { cmd: 'list'; json: boolean }
	| { cmd: 'status'; json: boolean }
	| { cmd: 'add-repository'; path?: string }
	| { cmd: 'session-hook'; agentType: string }
	| { cmd: 'setup-hooks'; agentType: string }
	| { cmd: 'verify-hooks'; agentType: string }
	| { cmd: 'skill'; action: 'install' | 'status' | 'update' | 'uninstall' }
	| { cmd: 'ui' }
	| { cmd: 'error'; lines: string[] };

/**
 * Read an optional `--agent`/`--agent-type` flag. Returns the default agent type
 * when the flag is absent, an error when the flag is present without a value.
 */
function readAgentType(argv: string[], flag: string): { agentType: string } | { error: string } {
	const index = argv.indexOf(flag);
	if (index === -1) {
		return { agentType: DEFAULT_AGENT_TYPE };
	}
	const value = argv[index + 1];
	if (value === undefined) {
		return { error: `Missing value for ${flag}` };
	}
	return { agentType: value };
}

/**
 * Parse the CLI argv into a command. The branch precedence matches the original
 * inline dispatch: `--help` wins over everything, then the positional commands
 * (`workspace <subcommand>`, `create`, `add-worktree`, `adopt-worktree`,
 * `claude`, `list`, `status`), then the flag commands (`session-hook`, `--setup-hooks`,
 * `--verify-hooks`), and finally the interactive UI.
 */
export function parseArgs(argv: string[]): ParsedCommand {
	if (argv.includes('--help') || argv.includes('-h')) {
		return { cmd: 'help' };
	}

	if (argv.includes('--version') || argv.includes('-v')) {
		return { cmd: 'version' };
	}

	if (argv[0] === 'workspace') {
		return parseWorkspace(argv.slice(1));
	}

	if (argv[0] === 'create') {
		return parseCreate(argv.slice(1));
	}

	if (argv[0] === 'add-worktree') {
		return parseAddWorktree(argv.slice(1));
	}

	if (argv[0] === 'adopt-worktree') {
		return parseAdoptWorktree(argv.slice(1));
	}

	if (argv[0] === 'claude-asana') {
		return parseClaudeAsana(argv.slice(1));
	}

	if (argv[0] === 'claude') {
		return { cmd: 'claude', groveId: argv[1] };
	}

	if (argv[0] === 'list') {
		return { cmd: 'list', json: argv.includes('--json') };
	}

	if (argv[0] === 'status') {
		return { cmd: 'status', json: argv.includes('--json') };
	}

	if (argv[0] === 'update') {
		return { cmd: 'update' };
	}

	if (argv[0] === 'skill') {
		return parseSkill(argv.slice(1));
	}

	if (argv.includes('session-hook')) {
		const result = readAgentType(argv, '--agent-type');
		return 'error' in result
			? { cmd: 'error', lines: [result.error] }
			: { cmd: 'session-hook', agentType: result.agentType };
	}

	if (argv.includes('--setup-hooks')) {
		const result = readAgentType(argv, '--agent');
		return 'error' in result
			? { cmd: 'error', lines: [result.error] }
			: { cmd: 'setup-hooks', agentType: result.agentType };
	}

	if (argv.includes('--verify-hooks')) {
		const result = readAgentType(argv, '--agent');
		return 'error' in result
			? { cmd: 'error', lines: [result.error] }
			: { cmd: 'verify-hooks', agentType: result.agentType };
	}

	return { cmd: 'ui' };
}

/**
 * Parse the `workspace` subcommands:
 *   - `workspace init` — initialize a workspace in the current directory.
 *   - `workspace add-repository [path]` — register a repository. The optional
 *     path (relative or absolute) lets a repo in another workspace be registered
 *     from the current one; when omitted the current directory is used.
 */
function parseWorkspace(workspaceArgs: string[]): ParsedCommand {
	const subcommand = workspaceArgs[0];

	if (subcommand === 'init') {
		return { cmd: 'workspace-init' };
	}

	if (subcommand === 'add-repository') {
		// Optional path value, unless the following token is a flag. When omitted
		// the current directory is registered.
		const value = workspaceArgs[1];
		const path = value && !value.startsWith('-') ? value : undefined;
		return { cmd: 'add-repository', path };
	}

	return {
		cmd: 'error',
		lines: ['✗ Usage: grove workspace init', '  grove workspace add-repository [path]'],
	};
}

/**
 * Parse `create <name> [repository]` / `create <name> --empty`. The name may
 * contain spaces: every token between `create` and the repository is joined.
 */
function parseCreate(createArgs: string[]): ParsedCommand {
	const empty = createArgs.includes('--empty');
	const filteredArgs = createArgs.filter((a) => a !== '--empty');

	if (filteredArgs.length < 1) {
		return {
			cmd: 'error',
			lines: [
				'✗ Usage: grove create <name> [repository]',
				'  grove create <name> --empty',
				'  repository format: reponame or reponame.projectfolder',
			],
		};
	}

	if (empty) {
		// All remaining args form the name
		return { cmd: 'create', name: filteredArgs.join(' '), empty: true };
	}

	if (filteredArgs.length < 2) {
		return {
			cmd: 'error',
			lines: [
				'✗ Usage: grove create <name> <repository>',
				'  grove create <name> --empty',
				'  repository format: reponame or reponame.projectfolder',
			],
		};
	}

	const repository = filteredArgs[filteredArgs.length - 1];
	const name = filteredArgs.slice(0, -1).join(' ');
	return { cmd: 'create', name, repository, empty: false };
}

/**
 * Parse `add-worktree <grove-id> <name> <repository>` and the `--fork` form
 * `add-worktree <grove-id> <name> --fork <worktree-id> [repository]`.
 *
 * The `--asana <url>` form derives the worktree name from the Asana task, so no
 * `<name>` positional is given: `add-worktree <grove-id> --asana <url> <repository>`
 * (and `--asana <url> --fork <worktree-id> [repository]`).
 */
function parseAddWorktree(addArgs: string[]): ParsedCommand {
	// Extract the optional --asana <url> flag. When present the worktree name is
	// resolved from the task, so the name positional is omitted.
	const asanaIndex = addArgs.indexOf('--asana');
	let asanaUrl: string | undefined;
	if (asanaIndex !== -1) {
		asanaUrl = addArgs[asanaIndex + 1];
		if (!asanaUrl) {
			return { cmd: 'error', lines: ['✗ --asana requires a task URL'] };
		}
		addArgs = addArgs.filter((_, i) => i !== asanaIndex && i !== asanaIndex + 1);
	}

	// Extract the optional --fork <worktree-id> flag.
	const forkIndex = addArgs.indexOf('--fork');
	let forkFromWorktreeId: string | undefined;
	let positional = addArgs;
	if (forkIndex !== -1) {
		forkFromWorktreeId = addArgs[forkIndex + 1];
		if (!forkFromWorktreeId) {
			return { cmd: 'error', lines: ['✗ --fork requires a worktree id'] };
		}
		positional = addArgs.filter((_, i) => i !== forkIndex && i !== forkIndex + 1);
	}

	const groveId = positional[0];

	if (asanaUrl) {
		// Asana mode: the name comes from the task, so positionals are just the grove id
		// and (optionally, in fork mode) the repository. The repository is required in
		// the non-fork form and optional in the fork form, matching the manual flow.
		const repository = positional[1];

		if (!groveId || (!forkFromWorktreeId && !repository)) {
			return {
				cmd: 'error',
				lines: [
					'✗ Usage: grove add-worktree <grove-id> --asana <url> <repository>',
					'  grove add-worktree <grove-id> --asana <url> --fork <worktree-id> [repository]',
					'  repository format: reponame or reponame.projectfolder',
				],
			};
		}

		return { cmd: 'add-worktree', groveId, name: '', repository, forkFromWorktreeId, asanaUrl };
	}

	if (forkFromWorktreeId) {
		// Fork mode: repository is optional. With >= 2 tokens after the grove id the
		// last token is the repository; with only a name the source worktree's
		// repository/project are reused.
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
			return {
				cmd: 'error',
				lines: ['✗ Usage: grove add-worktree <grove-id> <name> --fork <worktree-id> [repository]'],
			};
		}

		return { cmd: 'add-worktree', groveId, name: worktreeName, repository, forkFromWorktreeId };
	}

	if (positional.length < 3) {
		return {
			cmd: 'error',
			lines: [
				'✗ Usage: grove add-worktree <grove-id> <name> <repository>',
				'  grove add-worktree <grove-id> <name> --fork <worktree-id>',
				'  repository format: reponame or reponame.projectfolder',
			],
		};
	}

	const repository = positional[positional.length - 1];
	const worktreeName = positional.slice(1, -1).join(' ');
	return { cmd: 'add-worktree', groveId, name: worktreeName, repository };
}

/**
 * Parse `adopt-worktree <grove-id> <path> [name]`. Adopts an existing git
 * worktree (created outside Grove) into a grove. The name may contain spaces:
 * every token after the path is joined.
 */
function parseAdoptWorktree(adoptArgs: string[]): ParsedCommand {
	const [groveId, worktreePath, ...nameParts] = adoptArgs;

	if (!groveId || !worktreePath) {
		return {
			cmd: 'error',
			lines: ['✗ Usage: grove adopt-worktree <grove-id> <path> [name]'],
		};
	}

	return {
		cmd: 'adopt-worktree',
		groveId,
		path: worktreePath,
		name: nameParts.length > 0 ? nameParts.join(' ') : undefined,
	};
}

/**
 * Parse `claude-asana [worktree-id] [--asana <url>]`. Launches a background Claude
 * session seeded from an Asana task. The worktree id is optional (the worktree is
 * detected from cwd when omitted); worktree ids are globally unique, so no grove needs
 * to be named. `--asana <url>` overrides the worktree's stored Asana reference.
 */
function parseClaudeAsana(asanaArgs: string[]): ParsedCommand {
	let positional = asanaArgs;

	const asanaIndex = positional.indexOf('--asana');
	let asanaUrl: string | undefined;
	if (asanaIndex !== -1) {
		asanaUrl = positional[asanaIndex + 1];
		if (!asanaUrl) {
			return { cmd: 'error', lines: ['✗ --asana requires a task URL'] };
		}
		positional = positional.filter((_, i) => i !== asanaIndex && i !== asanaIndex + 1);
	}

	return { cmd: 'claude-asana', worktreeId: positional[0], asanaUrl };
}

/**
 * Parse `skill <action>` for managing the bundled Claude Code skill/plugin.
 * Actions: `install` (default), `status`, `update`, `uninstall`.
 */
function parseSkill(skillArgs: string[]): ParsedCommand {
	const action = skillArgs[0] ?? 'install';

	if (action === 'install' || action === 'status' || action === 'update' || action === 'uninstall') {
		return { cmd: 'skill', action };
	}

	return {
		cmd: 'error',
		lines: [
			`✗ Unknown skill action: ${action}`,
			'  grove skill install     Install the Grove skill as a Claude Code plugin',
			'  grove skill status      Show installed vs. bundled skill version',
			'  grove skill update      Sync the installed skill to the bundled version',
			'  grove skill uninstall   Remove the Grove skill plugin and marketplace',
		],
	};
}

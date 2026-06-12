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
	| { cmd: 'workspace-init' }
	| { cmd: 'create'; name: string; repository?: string; empty: boolean }
	| {
			cmd: 'add-worktree';
			groveId: string;
			name: string;
			repository?: string;
			forkFromWorktreeId?: string;
	  }
	| { cmd: 'claude'; groveId?: string }
	| { cmd: 'list'; json: boolean }
	| { cmd: 'status'; json: boolean }
	| { cmd: 'register' }
	| { cmd: 'session-hook'; agentType: string }
	| { cmd: 'setup-hooks'; agentType: string }
	| { cmd: 'verify-hooks'; agentType: string }
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
 * (`workspace init`, `create`, `add-worktree`, `claude`, `list`, `status`), then
 * the flag commands (`--register`, `session-hook`, `--setup-hooks`,
 * `--verify-hooks`), and finally the interactive UI.
 */
export function parseArgs(argv: string[]): ParsedCommand {
	if (argv.includes('--help') || argv.includes('-h')) {
		return { cmd: 'help' };
	}

	if (argv[0] === 'workspace' && argv[1] === 'init') {
		return { cmd: 'workspace-init' };
	}

	if (argv[0] === 'create') {
		return parseCreate(argv.slice(1));
	}

	if (argv[0] === 'add-worktree') {
		return parseAddWorktree(argv.slice(1));
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

	if (argv.includes('--register')) {
		return { cmd: 'register' };
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
 */
function parseAddWorktree(addArgs: string[]): ParsedCommand {
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

import { describe, expect, it } from 'vitest';

import { parseArgs } from '../parseArgs.js';

describe('parseArgs', () => {
	describe('interactive UI (default)', () => {
		it('returns the ui command for no arguments', () => {
			expect(parseArgs([])).toEqual({ cmd: 'ui' });
		});

		it('returns the ui command for an unrecognized command', () => {
			expect(parseArgs(['frobnicate'])).toEqual({ cmd: 'ui' });
		});

		it('errors on a bare "workspace" or an unknown subcommand', () => {
			expect(parseArgs(['workspace']).cmd).toBe('error');
			expect(parseArgs(['workspace', 'other']).cmd).toBe('error');
		});
	});

	describe('help', () => {
		it('parses --help', () => {
			expect(parseArgs(['--help'])).toEqual({ cmd: 'help' });
		});

		it('parses -h', () => {
			expect(parseArgs(['-h'])).toEqual({ cmd: 'help' });
		});

		it('takes precedence over any other command', () => {
			expect(parseArgs(['create', 'x', 'repo', '--help'])).toEqual({ cmd: 'help' });
			expect(parseArgs(['--add-repository', '-h'])).toEqual({ cmd: 'help' });
		});
	});

	describe('version', () => {
		it('parses --version', () => {
			expect(parseArgs(['--version'])).toEqual({ cmd: 'version' });
		});

		it('parses -v', () => {
			expect(parseArgs(['-v'])).toEqual({ cmd: 'version' });
		});

		it('yields to --help when both are present', () => {
			expect(parseArgs(['--version', '--help'])).toEqual({ cmd: 'help' });
		});
	});

	describe('update', () => {
		it('parses the update command', () => {
			expect(parseArgs(['update'])).toEqual({ cmd: 'update' });
		});
	});

	describe('workspace init', () => {
		it('parses "workspace init"', () => {
			expect(parseArgs(['workspace', 'init'])).toEqual({ cmd: 'workspace-init' });
		});
	});

	describe('create', () => {
		it('parses name and repository', () => {
			expect(parseArgs(['create', 'my-grove', 'my-repo'])).toEqual({
				cmd: 'create',
				name: 'my-grove',
				repository: 'my-repo',
				empty: false,
			});
		});

		it('joins a multi-word name, treating the last token as the repository', () => {
			expect(parseArgs(['create', 'my', 'cool', 'grove', 'my-repo'])).toEqual({
				cmd: 'create',
				name: 'my cool grove',
				repository: 'my-repo',
				empty: false,
			});
		});

		it('parses --empty with a name and no repository', () => {
			expect(parseArgs(['create', 'my', 'grove', '--empty'])).toEqual({
				cmd: 'create',
				name: 'my grove',
				empty: true,
			});
		});

		it('handles --empty in any position', () => {
			expect(parseArgs(['create', '--empty', 'my-grove'])).toEqual({
				cmd: 'create',
				name: 'my-grove',
				empty: true,
			});
		});

		it('errors when no name is given', () => {
			const result = parseArgs(['create']);
			expect(result.cmd).toBe('error');
			expect(result).toMatchObject({
				cmd: 'error',
				lines: expect.arrayContaining(['✗ Usage: grove create <name> [repository]']),
			});
		});

		it('errors when --empty is given without a name', () => {
			expect(parseArgs(['create', '--empty']).cmd).toBe('error');
		});

		it('errors when a non-empty create has only a name (no repository)', () => {
			const result = parseArgs(['create', 'my-grove']);
			expect(result).toMatchObject({
				cmd: 'error',
				lines: expect.arrayContaining(['✗ Usage: grove create <name> <repository>']),
			});
		});
	});

	describe('add-worktree', () => {
		it('parses grove id, name, and repository', () => {
			expect(parseArgs(['add-worktree', 'grove-1', 'wt', 'my-repo'])).toEqual({
				cmd: 'add-worktree',
				groveId: 'grove-1',
				name: 'wt',
				repository: 'my-repo',
			});
		});

		it('joins a multi-word worktree name', () => {
			expect(parseArgs(['add-worktree', 'grove-1', 'my', 'wt', 'my-repo'])).toEqual({
				cmd: 'add-worktree',
				groveId: 'grove-1',
				name: 'my wt',
				repository: 'my-repo',
			});
		});

		it('errors when fewer than three positionals are given', () => {
			const result = parseArgs(['add-worktree', 'grove-1', 'wt']);
			expect(result).toMatchObject({
				cmd: 'error',
				lines: expect.arrayContaining(['✗ Usage: grove add-worktree <grove-id> <name> <repository>']),
			});
		});

		describe('--fork', () => {
			it('parses fork with only a name (repository reused)', () => {
				expect(parseArgs(['add-worktree', 'grove-1', 'wt', '--fork', 'src-wt'])).toEqual({
					cmd: 'add-worktree',
					groveId: 'grove-1',
					name: 'wt',
					repository: undefined,
					forkFromWorktreeId: 'src-wt',
				});
			});

			it('parses fork with a name and an explicit repository', () => {
				expect(parseArgs(['add-worktree', 'grove-1', 'wt', '--fork', 'src-wt', 'my-repo'])).toEqual({
					cmd: 'add-worktree',
					groveId: 'grove-1',
					name: 'wt',
					repository: 'my-repo',
					forkFromWorktreeId: 'src-wt',
				});
			});

			it('joins a multi-word name in fork mode with a repository', () => {
				expect(
					parseArgs(['add-worktree', 'grove-1', 'my', 'wt', '--fork', 'src-wt', 'my-repo'])
				).toEqual({
					cmd: 'add-worktree',
					groveId: 'grove-1',
					name: 'my wt',
					repository: 'my-repo',
					forkFromWorktreeId: 'src-wt',
				});
			});

			it('errors when --fork has no worktree id', () => {
				expect(parseArgs(['add-worktree', 'grove-1', 'wt', '--fork'])).toMatchObject({
					cmd: 'error',
					lines: ['✗ --fork requires a worktree id'],
				});
			});

			it('errors when the fork form is missing a name', () => {
				const result = parseArgs(['add-worktree', 'grove-1', '--fork', 'src-wt']);
				expect(result).toMatchObject({
					cmd: 'error',
					lines: expect.arrayContaining([
						'✗ Usage: grove add-worktree <grove-id> <name> --fork <worktree-id> [repository]',
					]),
				});
			});
		});

		describe('--asana', () => {
			const url = 'https://app.asana.com/0/123/456';

			it('parses grove id, asana url, and repository (name omitted)', () => {
				expect(parseArgs(['add-worktree', 'grove-1', '--asana', url, 'my-repo'])).toEqual({
					cmd: 'add-worktree',
					groveId: 'grove-1',
					name: '',
					repository: 'my-repo',
					forkFromWorktreeId: undefined,
					asanaUrl: url,
				});
			});

			it('combines --asana with --fork, repository optional', () => {
				expect(parseArgs(['add-worktree', 'grove-1', '--asana', url, '--fork', 'src-wt'])).toEqual({
					cmd: 'add-worktree',
					groveId: 'grove-1',
					name: '',
					repository: undefined,
					forkFromWorktreeId: 'src-wt',
					asanaUrl: url,
				});
			});

			it('combines --asana with --fork and an explicit repository', () => {
				expect(
					parseArgs(['add-worktree', 'grove-1', '--asana', url, '--fork', 'src-wt', 'my-repo'])
				).toEqual({
					cmd: 'add-worktree',
					groveId: 'grove-1',
					name: '',
					repository: 'my-repo',
					forkFromWorktreeId: 'src-wt',
					asanaUrl: url,
				});
			});

			it('errors when --asana has no url', () => {
				expect(parseArgs(['add-worktree', 'grove-1', '--asana'])).toMatchObject({
					cmd: 'error',
					lines: ['✗ --asana requires a task URL'],
				});
			});

			it('errors when the non-fork asana form is missing a repository', () => {
				const result = parseArgs(['add-worktree', 'grove-1', '--asana', url]);
				expect(result).toMatchObject({
					cmd: 'error',
					lines: expect.arrayContaining([
						'✗ Usage: grove add-worktree <grove-id> --asana <url> <repository>',
					]),
				});
			});
		});
	});

	describe('claude', () => {
		it('parses claude without a grove id', () => {
			expect(parseArgs(['claude'])).toEqual({ cmd: 'claude', groveId: undefined });
		});

		it('parses claude with a grove id', () => {
			expect(parseArgs(['claude', 'grove-1'])).toEqual({ cmd: 'claude', groveId: 'grove-1' });
		});
	});

	describe('claude-asana', () => {
		const url = 'https://app.asana.com/0/123/456';

		it('parses without a worktree id or url (cwd detection)', () => {
			expect(parseArgs(['claude-asana'])).toEqual({
				cmd: 'claude-asana',
				worktreeId: undefined,
				asanaUrl: undefined,
			});
		});

		it('parses with a worktree id', () => {
			expect(parseArgs(['claude-asana', 'wt-abc'])).toEqual({
				cmd: 'claude-asana',
				worktreeId: 'wt-abc',
				asanaUrl: undefined,
			});
		});

		it('parses with a worktree id and an --asana url', () => {
			expect(parseArgs(['claude-asana', 'wt-abc', '--asana', url])).toEqual({
				cmd: 'claude-asana',
				worktreeId: 'wt-abc',
				asanaUrl: url,
			});
		});

		it('parses an --asana url with no worktree id (cwd detection)', () => {
			expect(parseArgs(['claude-asana', '--asana', url])).toEqual({
				cmd: 'claude-asana',
				worktreeId: undefined,
				asanaUrl: url,
			});
		});

		it('errors when --asana has no url', () => {
			expect(parseArgs(['claude-asana', '--asana'])).toMatchObject({
				cmd: 'error',
				lines: ['✗ --asana requires a task URL'],
			});
		});

		it('is not confused with the claude command', () => {
			expect(parseArgs(['claude'])).toEqual({ cmd: 'claude', groveId: undefined });
		});
	});

	describe('list', () => {
		it('parses list', () => {
			expect(parseArgs(['list'])).toEqual({ cmd: 'list', json: false });
		});

		it('parses list --json', () => {
			expect(parseArgs(['list', '--json'])).toEqual({ cmd: 'list', json: true });
		});
	});

	describe('status', () => {
		it('parses status', () => {
			expect(parseArgs(['status'])).toEqual({ cmd: 'status', json: false });
		});

		it('parses status --json', () => {
			expect(parseArgs(['status', '--json'])).toEqual({ cmd: 'status', json: true });
		});
	});

	describe('workspace add-repository', () => {
		it('parses workspace add-repository with no path', () => {
			expect(parseArgs(['workspace', 'add-repository'])).toEqual({
				cmd: 'add-repository',
				path: undefined,
			});
		});

		it('parses workspace add-repository with a path', () => {
			expect(parseArgs(['workspace', 'add-repository', '/some/repo'])).toEqual({
				cmd: 'add-repository',
				path: '/some/repo',
			});
		});

		it('errors on an unknown workspace subcommand', () => {
			expect(parseArgs(['workspace', 'bogus']).cmd).toBe('error');
		});
	});

	describe('session-hook', () => {
		it('defaults the agent type to claude', () => {
			expect(parseArgs(['session-hook'])).toEqual({ cmd: 'session-hook', agentType: 'claude' });
		});

		it('reads --agent-type', () => {
			expect(parseArgs(['session-hook', '--agent-type', 'gemini'])).toEqual({
				cmd: 'session-hook',
				agentType: 'gemini',
			});
		});

		it('errors when --agent-type has no value', () => {
			expect(parseArgs(['session-hook', '--agent-type'])).toMatchObject({
				cmd: 'error',
				lines: ['Missing value for --agent-type'],
			});
		});
	});

	describe('setup-hooks', () => {
		it('defaults the agent type to claude', () => {
			expect(parseArgs(['--setup-hooks'])).toEqual({ cmd: 'setup-hooks', agentType: 'claude' });
		});

		it('reads --agent', () => {
			expect(parseArgs(['--setup-hooks', '--agent', 'codex'])).toEqual({
				cmd: 'setup-hooks',
				agentType: 'codex',
			});
		});

		it('errors when --agent has no value', () => {
			expect(parseArgs(['--setup-hooks', '--agent']).cmd).toBe('error');
		});
	});

	describe('verify-hooks', () => {
		it('defaults the agent type to claude', () => {
			expect(parseArgs(['--verify-hooks'])).toEqual({ cmd: 'verify-hooks', agentType: 'claude' });
		});

		it('reads --agent', () => {
			expect(parseArgs(['--verify-hooks', '--agent', 'custom'])).toEqual({
				cmd: 'verify-hooks',
				agentType: 'custom',
			});
		});
	});

	describe('command precedence', () => {
		it('prefers a positional create command over a trailing --setup-hooks flag', () => {
			expect(parseArgs(['create', 'x', 'repo', '--setup-hooks'])).toMatchObject({ cmd: 'create' });
		});

		it('prefers a workspace subcommand over the session-hook/--setup-hooks flag commands', () => {
			expect(parseArgs(['workspace', 'add-repository', '--setup-hooks'])).toEqual({
				cmd: 'add-repository',
				path: undefined,
			});
		});
	});
});

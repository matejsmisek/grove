import { describe, expect, it } from 'vitest';

import { parseGitRemote } from '../gitRemote.js';

describe('parseGitRemote', () => {
	it('parses scp-like SSH URLs', () => {
		expect(parseGitRemote('git@gitlab.com:group/sub/project.git')).toEqual({
			host: 'gitlab.com',
			projectPath: 'group/sub/project',
		});
	});

	it('parses HTTPS URLs with .git suffix', () => {
		expect(parseGitRemote('https://gitlab.com/group/project.git')).toEqual({
			host: 'gitlab.com',
			projectPath: 'group/project',
		});
	});

	it('parses HTTPS URLs without .git suffix', () => {
		expect(parseGitRemote('https://gitlab.com/group/project')).toEqual({
			host: 'gitlab.com',
			projectPath: 'group/project',
		});
	});

	it('parses ssh:// URLs with a port', () => {
		expect(parseGitRemote('ssh://git@gitlab.example.com:2222/group/project.git')).toEqual({
			host: 'gitlab.example.com',
			projectPath: 'group/project',
		});
	});

	it('parses HTTPS URLs with embedded credentials', () => {
		expect(parseGitRemote('https://oauth2:token@gitlab.com/group/project.git')).toEqual({
			host: 'gitlab.com',
			projectPath: 'group/project',
		});
	});

	it('lowercases the host but preserves project path case', () => {
		expect(parseGitRemote('git@GitLab.COM:Group/Project.git')).toEqual({
			host: 'gitlab.com',
			projectPath: 'Group/Project',
		});
	});

	it('handles deeply nested subgroups', () => {
		expect(parseGitRemote('https://gitlab.com/a/b/c/d/project.git')).toEqual({
			host: 'gitlab.com',
			projectPath: 'a/b/c/d/project',
		});
	});

	it('returns null for empty or nullish input', () => {
		expect(parseGitRemote('')).toBeNull();
		expect(parseGitRemote(null)).toBeNull();
		expect(parseGitRemote(undefined)).toBeNull();
	});

	it('returns null for unparseable input', () => {
		expect(parseGitRemote('not a url')).toBeNull();
	});
});

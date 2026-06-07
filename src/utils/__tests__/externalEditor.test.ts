import { describe, expect, it } from 'vitest';

import { buildEditorInvocation } from '../externalEditor.js';

const FILE = '/tmp/grove-edit.txt';
const CURSOR = { line: 7, column: 3 };

describe('buildEditorInvocation', () => {
	it('appends just the file when no cursor is given', () => {
		expect(buildEditorInvocation('vim', FILE)).toEqual({
			command: 'vim',
			args: [FILE],
		});
	});

	it('splits editor flags from the binary', () => {
		expect(buildEditorInvocation('code --wait', FILE)).toEqual({
			command: 'code',
			args: ['--wait', FILE],
		});
	});

	it('positions the caret for vim with an ex command', () => {
		expect(buildEditorInvocation('vim', FILE, CURSOR)).toEqual({
			command: 'vim',
			args: ['+call cursor(7,3)', FILE],
		});
	});

	it('positions the caret for nvim', () => {
		expect(buildEditorInvocation('nvim', FILE, CURSOR)).toEqual({
			command: 'nvim',
			args: ['+call cursor(7,3)', FILE],
		});
	});

	it('positions the caret for nano', () => {
		expect(buildEditorInvocation('nano', FILE, CURSOR)).toEqual({
			command: 'nano',
			args: ['+7,3', FILE],
		});
	});

	it('positions the caret for emacs', () => {
		expect(buildEditorInvocation('emacs', FILE, CURSOR)).toEqual({
			command: 'emacs',
			args: ['+7:3', FILE],
		});
	});

	it('positions the caret for VS Code with --goto and ensures --wait', () => {
		expect(buildEditorInvocation('code', FILE, CURSOR)).toEqual({
			command: 'code',
			args: ['--wait', '--goto', `${FILE}:7:3`],
		});
	});

	it('does not duplicate --wait when already present for VS Code', () => {
		expect(buildEditorInvocation('code --wait', FILE, CURSOR)).toEqual({
			command: 'code',
			args: ['--wait', '--goto', `${FILE}:7:3`],
		});
	});

	it('appends the location to the file path for sublime/helix style editors', () => {
		expect(buildEditorInvocation('subl', FILE, CURSOR)).toEqual({
			command: 'subl',
			args: ['--wait', `${FILE}:7:3`],
		});
	});

	it('resolves the binary name from an absolute path', () => {
		expect(buildEditorInvocation('/usr/bin/vim', FILE, CURSOR)).toEqual({
			command: '/usr/bin/vim',
			args: ['+call cursor(7,3)', FILE],
		});
	});

	it('falls back to opening the file for unknown editors', () => {
		expect(buildEditorInvocation('someeditor', FILE, CURSOR)).toEqual({
			command: 'someeditor',
			args: [FILE],
		});
	});
});

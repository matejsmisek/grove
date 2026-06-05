import { describe, expect, it } from 'vitest';

import { isAsanaTaskUrl, parseAsanaTaskUrl } from '../asanaUrl.js';

describe('parseAsanaTaskUrl', () => {
	it('parses the classic /0/{project}/{task} layout', () => {
		expect(parseAsanaTaskUrl('https://app.asana.com/0/1112223334445/9998887776665')).toEqual({
			gid: '9998887776665',
		});
	});

	it('parses the classic layout with a view suffix', () => {
		expect(parseAsanaTaskUrl('https://app.asana.com/0/1112223334445/9998887776665/f')).toEqual({
			gid: '9998887776665',
		});
	});

	it('parses the new /1/{workspace}/project/{project}/task/{task} layout', () => {
		expect(
			parseAsanaTaskUrl('https://app.asana.com/1/12345/project/67890/task/24681012?focus=true')
		).toEqual({ gid: '24681012' });
	});

	it('parses the new layout without a project segment', () => {
		expect(parseAsanaTaskUrl('https://app.asana.com/1/12345/task/24681012')).toEqual({
			gid: '24681012',
		});
	});

	it('ignores surrounding whitespace', () => {
		expect(parseAsanaTaskUrl('  https://app.asana.com/0/1/2  ')).toEqual({ gid: '2' });
	});

	it('returns null for non-asana hosts', () => {
		expect(parseAsanaTaskUrl('https://example.com/0/1/2')).toBeNull();
		expect(parseAsanaTaskUrl('https://app.notasana.com/0/1/2')).toBeNull();
	});

	it('returns null when no numeric task gid is present', () => {
		expect(parseAsanaTaskUrl('https://app.asana.com/0/inbox')).toBeNull();
		expect(parseAsanaTaskUrl('https://app.asana.com/1/12345/project/67890')).toBeNull();
		expect(parseAsanaTaskUrl('https://app.asana.com/0/project/notanid')).toBeNull();
	});

	it('returns null for non-URL input', () => {
		expect(parseAsanaTaskUrl('')).toBeNull();
		expect(parseAsanaTaskUrl('just a grove name')).toBeNull();
		expect(parseAsanaTaskUrl('not a url')).toBeNull();
	});
});

describe('isAsanaTaskUrl', () => {
	it('is true for a recognizable task URL', () => {
		expect(isAsanaTaskUrl('https://app.asana.com/0/1/2')).toBe(true);
	});

	it('is false otherwise', () => {
		expect(isAsanaTaskUrl('my-grove')).toBe(false);
	});
});

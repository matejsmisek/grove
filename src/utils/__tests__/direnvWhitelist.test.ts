import { Volume } from 'memfs';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockFs } from '../../__tests__/helpers.js';
import { __resetDirenvCacheForTests } from '../direnv.js';
import {
	addDirenvWhitelistPrefix,
	getDirenvConfigPath,
	isPathInDirenvWhitelist,
	readDirenvWhitelistPrefixes,
	shouldOfferDirenvWhitelist,
} from '../direnvWhitelist.js';

let vol: Volume;
let mockHomeDir: string;
// Controls the mocked `which direnv` probe used by isDirenvAvailable().
let direnvInstalled = true;

vi.mock('fs', () => {
	return {
		default: new Proxy(
			{},
			{
				get(_target, prop) {
					return vol?.[prop as keyof Volume];
				},
			}
		),
		...Object.fromEntries(
			Object.getOwnPropertyNames(Volume.prototype)
				.filter((key) => key !== 'constructor')
				.map((key) => [key, (...args: unknown[]) => vol?.[key as keyof Volume]?.(...args)])
		),
	};
});

vi.mock('os', () => ({
	default: {
		homedir: () => mockHomeDir,
	},
	homedir: () => mockHomeDir,
}));

vi.mock('child_process', () => ({
	execSync: vi.fn((cmd: string) => {
		if (cmd.includes('which direnv') && !direnvInstalled) {
			throw new Error('not found');
		}
		return '';
	}),
	spawnSync: vi.fn(() => ({ stdout: '', stderr: '' })),
}));

function configPath(): string {
	return path.join(mockHomeDir, '.config', 'direnv', 'direnv.toml');
}

function writeConfig(content: string): void {
	const dir = path.dirname(configPath());
	vol.mkdirSync(dir, { recursive: true });
	vol.writeFileSync(configPath(), content);
}

function readConfig(): string {
	return vol.readFileSync(configPath(), 'utf-8') as string;
}

describe('direnvWhitelist', () => {
	beforeEach(() => {
		const mockFs = createMockFs();
		vol = mockFs.vol;
		mockHomeDir = '/home/tester';
		vol.mkdirSync(mockHomeDir, { recursive: true });
		delete process.env.XDG_CONFIG_HOME;
		direnvInstalled = true;
		__resetDirenvCacheForTests();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('getDirenvConfigPath', () => {
		it('defaults to ~/.config/direnv/direnv.toml', () => {
			expect(getDirenvConfigPath()).toBe(configPath());
		});

		it('honors XDG_CONFIG_HOME', () => {
			process.env.XDG_CONFIG_HOME = '/custom/cfg';
			expect(getDirenvConfigPath()).toBe('/custom/cfg/direnv/direnv.toml');
		});
	});

	describe('readDirenvWhitelistPrefixes', () => {
		it('returns [] when the config file is missing', () => {
			expect(readDirenvWhitelistPrefixes()).toEqual([]);
		});

		it('returns [] when there is no [whitelist] section', () => {
			writeConfig('[global]\nload_dotenv = true\n');
			expect(readDirenvWhitelistPrefixes()).toEqual([]);
		});

		it('parses a multi-line prefix array', () => {
			writeConfig('[whitelist]\nprefix = [\n  "/a/groves",\n  "/b/groves",\n]\n');
			expect(readDirenvWhitelistPrefixes()).toEqual(['/a/groves', '/b/groves']);
		});

		it('parses an inline prefix array', () => {
			writeConfig('[whitelist]\nprefix = ["/a/groves", "/b/groves"]\n');
			expect(readDirenvWhitelistPrefixes()).toEqual(['/a/groves', '/b/groves']);
		});

		it('does not pick up exact entries from another array', () => {
			writeConfig('[whitelist]\nexact = ["/x/.envrc"]\nprefix = ["/a/groves"]\n');
			expect(readDirenvWhitelistPrefixes()).toEqual(['/a/groves']);
		});
	});

	describe('isPathInDirenvWhitelist', () => {
		beforeEach(() => {
			writeConfig('[whitelist]\nprefix = ["/home/tester/groves"]\n');
		});

		it('matches an exact prefix', () => {
			expect(isPathInDirenvWhitelist('/home/tester/groves')).toBe(true);
		});

		it('matches a path beneath a prefix', () => {
			expect(isPathInDirenvWhitelist('/home/tester/groves/feature-x')).toBe(true);
		});

		it('ignores a trailing slash difference', () => {
			expect(isPathInDirenvWhitelist('/home/tester/groves/')).toBe(true);
		});

		it('does not match an unrelated path', () => {
			expect(isPathInDirenvWhitelist('/home/tester/other')).toBe(false);
		});

		it('does not treat a sibling sharing a name prefix as covered', () => {
			expect(isPathInDirenvWhitelist('/home/tester/groves-2')).toBe(false);
		});
	});

	describe('addDirenvWhitelistPrefix', () => {
		it('creates the config file and section when none exists', () => {
			addDirenvWhitelistPrefix('/home/tester/groves');
			expect(readConfig()).toBe('[whitelist]\nprefix = [\n  "/home/tester/groves",\n]\n');
		});

		it('appends to an existing prefix array', () => {
			writeConfig('[whitelist]\nprefix = [\n  "/a/groves",\n]\n');
			addDirenvWhitelistPrefix('/b/groves');
			expect(readDirenvWhitelistPrefixes()).toEqual(['/a/groves', '/b/groves']);
		});

		it('does not duplicate an already-present prefix', () => {
			writeConfig('[whitelist]\nprefix = ["/a/groves"]\n');
			addDirenvWhitelistPrefix('/a/groves');
			expect(readDirenvWhitelistPrefixes()).toEqual(['/a/groves']);
		});

		it('removes the previous folder when adding a new one', () => {
			writeConfig('[whitelist]\nprefix = [\n  "/old/groves",\n  "/keep/groves",\n]\n');
			addDirenvWhitelistPrefix('/new/groves', '/old/groves');
			expect(readDirenvWhitelistPrefixes()).toEqual(['/keep/groves', '/new/groves']);
		});

		it('preserves other sections and keys', () => {
			writeConfig('[global]\nload_dotenv = true\n\n[whitelist]\nprefix = ["/a/groves"]\n');
			addDirenvWhitelistPrefix('/b/groves');
			const result = readConfig();
			expect(result).toContain('[global]');
			expect(result).toContain('load_dotenv = true');
			expect(readDirenvWhitelistPrefixes()).toEqual(['/a/groves', '/b/groves']);
		});

		it('preserves exact entries within the whitelist section', () => {
			writeConfig('[whitelist]\nexact = ["/x/.envrc"]\nprefix = ["/a/groves"]\n');
			addDirenvWhitelistPrefix('/b/groves');
			const result = readConfig();
			expect(result).toContain('exact = ["/x/.envrc"]');
			expect(readDirenvWhitelistPrefixes()).toEqual(['/a/groves', '/b/groves']);
		});

		it('adds a prefix to a [whitelist] section that has no prefix key', () => {
			writeConfig('[whitelist]\nexact = ["/x/.envrc"]\n');
			addDirenvWhitelistPrefix('/a/groves');
			expect(readDirenvWhitelistPrefixes()).toEqual(['/a/groves']);
			expect(readConfig()).toContain('exact = ["/x/.envrc"]');
		});

		it('normalizes a trailing slash on the added path', () => {
			addDirenvWhitelistPrefix('/home/tester/groves/');
			expect(readDirenvWhitelistPrefixes()).toEqual(['/home/tester/groves']);
		});
	});

	describe('shouldOfferDirenvWhitelist', () => {
		it('offers when direnv is installed and the folder is untrusted and unasked', () => {
			expect(shouldOfferDirenvWhitelist('/home/tester/groves')).toBe(true);
		});

		it('does not offer when the folder is empty or undefined', () => {
			expect(shouldOfferDirenvWhitelist(undefined)).toBe(false);
			expect(shouldOfferDirenvWhitelist('   ')).toBe(false);
		});

		it('does not offer when direnv is not installed', () => {
			direnvInstalled = false;
			__resetDirenvCacheForTests();
			expect(shouldOfferDirenvWhitelist('/home/tester/groves')).toBe(false);
		});

		it('does not offer when the folder is already whitelisted', () => {
			writeConfig('[whitelist]\nprefix = ["/home/tester/groves"]\n');
			expect(shouldOfferDirenvWhitelist('/home/tester/groves')).toBe(false);
		});

		it('does not offer when the folder was already asked about', () => {
			expect(shouldOfferDirenvWhitelist('/home/tester/groves', '/home/tester/groves')).toBe(false);
		});

		it('offers again when a different folder was previously asked about', () => {
			expect(shouldOfferDirenvWhitelist('/home/tester/groves', '/home/tester/old')).toBe(true);
		});
	});
});

import fs from 'fs';

import { invalidateJsonFileCache, readJsonFileCached } from './jsonFileCache.js';

/**
 * Configuration options for JsonStore
 */
export interface JsonStoreOptions<T> {
	/** Label used in error messages (e.g., 'settings', 'repositories') */
	label: string;
	/** JSON indentation character or number of spaces (default: '\t') */
	indent?: string | number;
	/** Whether to persist default data when file doesn't exist on read (default: true) */
	createOnFirstRead?: boolean;
	/** Transform data after reading from disk (e.g., merge with defaults) */
	afterRead?: (data: T, defaults: T) => T;
	/** Transform data before writing to disk (e.g., update timestamps) */
	beforeWrite?: (data: T) => T;
	/** Whether to silently swallow write errors instead of throwing (default: false) */
	silentWriteErrors?: boolean;
	/**
	 * Reuse the parsed file across reads while its mtime + size are unchanged, to
	 * avoid repeated blocking reads + JSON.parse on hot paths. Only safe when the
	 * read result depends solely on this one file (not, e.g., a merge of several
	 * files), so it is opt-in. Writes through this store invalidate the cache.
	 */
	cacheByMtime?: boolean;
}

/**
 * Generic JSON file storage that encapsulates the read/write/default pattern
 * used across all storage services.
 *
 * Handles:
 * - Reading JSON from disk with fallback to defaults
 * - Creating parent directories on write
 * - Pretty-printing JSON
 * - Error handling with configurable behavior
 */
export class JsonStore<T> {
	constructor(
		private readonly getFilePath: () => string,
		private readonly getParentDir: () => string,
		private readonly getDefaults: () => T,
		private readonly options: JsonStoreOptions<T>
	) {}

	/**
	 * Read data from the JSON file.
	 * Returns defaults if the file doesn't exist or can't be parsed.
	 */
	read(): T {
		try {
			const filePath = this.getFilePath();

			let data: T;
			if (this.options.cacheByMtime) {
				const cached = readJsonFileCached<T>(filePath);
				if (cached === undefined) {
					const defaults = this.getDefaults();
					if (this.options.createOnFirstRead !== false) {
						this.write(defaults);
					}
					return defaults;
				}
				data = cached;
			} else {
				if (!fs.existsSync(filePath)) {
					const defaults = this.getDefaults();
					if (this.options.createOnFirstRead !== false) {
						this.write(defaults);
					}
					return defaults;
				}

				const raw = fs.readFileSync(filePath, 'utf-8');
				data = JSON.parse(raw) as T;
			}

			if (this.options.afterRead) {
				return this.options.afterRead(data, this.getDefaults());
			}

			return data;
		} catch (error) {
			console.error(`Error reading ${this.options.label}:`, error);
			return this.getDefaults();
		}
	}

	/**
	 * Write data to the JSON file.
	 * Creates the parent directory if it doesn't exist.
	 */
	write(data: T): void {
		try {
			const parentDir = this.getParentDir();
			if (!fs.existsSync(parentDir)) {
				fs.mkdirSync(parentDir, { recursive: true });
			}

			const toWrite = this.options.beforeWrite ? this.options.beforeWrite(data) : data;
			const indent = this.options.indent ?? '\t';
			const filePath = this.getFilePath();
			fs.writeFileSync(filePath, JSON.stringify(toWrite, null, indent), 'utf-8');
			if (this.options.cacheByMtime) {
				// Invalidate so a same-tick read re-parses fresh content.
				invalidateJsonFileCache(filePath);
			}
		} catch (error) {
			if (this.options.silentWriteErrors) {
				return;
			}
			console.error(`Error writing ${this.options.label}:`, error);
			throw error;
		}
	}

	/**
	 * Read-modify-write in a single operation.
	 * Reads current data, applies the mutator function, writes the result.
	 */
	update(mutator: (data: T) => T): T {
		const current = this.read();
		const updated = mutator(current);
		this.write(updated);
		return updated;
	}
}

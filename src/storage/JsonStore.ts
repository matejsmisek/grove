import fs from 'fs';

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

			if (!fs.existsSync(filePath)) {
				const defaults = this.getDefaults();
				if (this.options.createOnFirstRead !== false) {
					this.write(defaults);
				}
				return defaults;
			}

			const raw = fs.readFileSync(filePath, 'utf-8');
			const data = JSON.parse(raw) as T;

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
			fs.writeFileSync(this.getFilePath(), JSON.stringify(toWrite, null, indent), 'utf-8');
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

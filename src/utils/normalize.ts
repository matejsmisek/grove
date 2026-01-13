import crypto from 'crypto';

/**
 * Generate a unique 5-character identifier for a grove based on its name
 * Uses SHA256 hash of the name to ensure deterministic output
 *
 * @param name - The original grove name
 * @returns A 5-character alphanumeric identifier
 */
export function generateGroveIdentifier(name: string): string {
	const hash = crypto.createHash('sha256').update(name).digest('base64url');
	return hash.substring(0, 5);
}

/**
 * Normalize and shorten a grove name for use in folder paths and branch names
 *
 * This function:
 * 1. Converts to lowercase
 * 2. Replaces spaces and special characters with hyphens
 * 3. Removes invalid characters for file paths and git branches
 * 4. Truncates to a maximum length
 * 5. Appends the provided identifier for uniqueness
 *
 * @param name - The original grove name
 * @param identifier - The unique identifier to append (from generateGroveIdentifier)
 * @param maxLength - Maximum length before adding suffix (default: 40)
 * @returns Normalized name with identifier suffix (e.g., "my-grove-abc12")
 */
export function normalizeGroveName(
	name: string,
	identifier: string,
	maxLength: number = 40
): string {
	// Step 1: Convert to lowercase
	let normalized = name.toLowerCase();

	// Step 2: Replace spaces and underscores with hyphens
	normalized = normalized.replace(/[\s_]+/g, '-');

	// Step 3: Remove invalid characters for file paths and git branches
	// Keep only alphanumeric characters and hyphens
	// Git branch names can't contain: spaces, ~, ^, :, ?, *, [, \, .., @{, consecutive dots, etc.
	// File paths can't contain: /, \, :, *, ?, ", <, >, |
	// Safe charset: a-z, 0-9, hyphen
	normalized = normalized.replace(/[^a-z0-9-]/g, '');

	// Step 4: Remove leading/trailing hyphens and collapse consecutive hyphens
	normalized = normalized.replace(/^-+|-+$/g, '');
	normalized = normalized.replace(/-+/g, '-');

	// Step 5: Truncate to max length
	if (normalized.length > maxLength) {
		normalized = normalized.substring(0, maxLength);
		// Remove trailing hyphen if truncation created one
		normalized = normalized.replace(/-+$/, '');
	}

	// Step 6: Combine normalized name with identifier
	// If normalized name is empty (all special chars), use a default
	if (normalized.length === 0) {
		normalized = 'grove';
	}

	return `${normalized}-${identifier}`;
}

/**
 * Get the display name from a normalized grove name (removes the suffix)
 * This is useful for showing the original name in UIs
 *
 * @param normalizedName - The normalized name with suffix
 * @returns The name without the 5-character suffix
 */
export function getGroveDisplayName(normalizedName: string): string {
	// Remove the last 6 characters (hyphen + 5-char suffix)
	if (normalizedName.length > 6 && normalizedName[normalizedName.length - 6] === '-') {
		return normalizedName.substring(0, normalizedName.length - 6);
	}
	return normalizedName;
}

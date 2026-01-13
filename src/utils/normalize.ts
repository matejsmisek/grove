import crypto from 'crypto';

/**
 * Normalize and shorten a grove name for use in folder paths and branch names
 *
 * This function:
 * 1. Converts to lowercase
 * 2. Replaces spaces and special characters with hyphens
 * 3. Removes invalid characters for file paths and git branches
 * 4. Truncates to a maximum length
 * 5. Adds a 5-character alphanumeric suffix based on the original name for uniqueness
 *
 * @param name - The original grove name
 * @param maxLength - Maximum length before adding suffix (default: 40)
 * @returns Normalized name with 5-character suffix (e.g., "my-grove-abc12")
 */
export function normalizeGroveName(name: string, maxLength: number = 40): string {
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

	// Step 6: Generate a 5-character suffix based on hash of original name
	// This ensures uniqueness even after normalization and shortening
	const hash = crypto.createHash('sha256').update(name).digest('base64url');
	const suffix = hash.substring(0, 5);

	// Step 7: Combine normalized name with suffix
	// If normalized name is empty (all special chars), use a default
	if (normalized.length === 0) {
		normalized = 'grove';
	}

	return `${normalized}-${suffix}`;
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

/**
 * Extract the 5-character unique suffix from a normalized grove name
 * This suffix can be used to make related paths globally unique
 *
 * @param normalizedName - The normalized name with suffix (e.g., "my-grove-abc12")
 * @returns The 5-character suffix (e.g., "abc12")
 */
export function getGroveSuffix(normalizedName: string): string {
	// Extract the last 5 characters (the suffix after the final hyphen)
	if (normalizedName.length > 6 && normalizedName[normalizedName.length - 6] === '-') {
		return normalizedName.substring(normalizedName.length - 5);
	}
	// Fallback: return empty string if format doesn't match
	return '';
}

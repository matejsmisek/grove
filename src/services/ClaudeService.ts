import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';

import type { Repository, Worktree } from '../storage/types.js';
import type { IClaudeService } from './interfaces.js';

// Re-export types for backward compatibility
export type { ContextBuilderMessage, ContextDraft } from './interfaces.js';

/**
 * Service for interacting with Claude API for context building
 * Handles chat-based context creation with file reading capabilities
 */
export class ClaudeService implements IClaudeService {
	private client: Anthropic;
	private model = 'claude-sonnet-4-20250514';

	constructor() {
		// The SDK automatically uses ANTHROPIC_API_KEY environment variable
		this.client = new Anthropic();
	}

	/**
	 * Build system prompt for context generation
	 */
	private buildSystemPrompt(
		groveName: string,
		repositories: Repository[],
		worktrees: Worktree[]
	): string {
		const repoList = repositories.map((r) => `- ${r.name}: ${r.path}`).join('\n');
		const worktreeList = worktrees.map((w) => `- ${w.repositoryName}: ${w.worktreePath}`).join('\n');

		return `You are a helpful assistant for creating CONTEXT.md files for development groves.

A grove is a collection of git worktrees that developers use to work on related features across multiple repositories.

## Current Grove Information
- **Grove Name**: ${groveName}
- **Repositories**:
${repoList}

- **Worktrees** (where files can be read):
${worktreeList}

## Your Task
Help the user create a comprehensive CONTEXT.md file for their grove. You can:
1. Ask the user about the purpose and goals of their work
2. Read files from the worktrees to understand the project structure
3. Generate a draft CONTEXT.md based on the conversation

## CONTEXT.md Structure
The CONTEXT.md file should include:
- A clear description of the purpose/goal of this grove
- Which repositories are involved and why
- Any relevant architecture or design decisions
- Notes and reminders for the developer

## Available Tools
You can use the 'read_file' tool to read files from any of the worktrees listed above. Use this to:
- Understand project structure (package.json, README.md, etc.)
- Review existing code patterns
- Find relevant context for the CONTEXT.md

## Guidelines
- Be concise but comprehensive
- Focus on what's relevant to the developer's stated goals
- Ask clarifying questions if the purpose is unclear
- When ready, provide a complete CONTEXT.md draft for the user to approve`;
	}

	/**
	 * Read a file from a worktree (for tool use)
	 */
	private readWorktreeFile(worktrees: Worktree[], filePath: string): string {
		// Try to find the file in any of the worktrees
		for (const worktree of worktrees) {
			const fullPath = path.join(worktree.worktreePath, filePath);
			if (fs.existsSync(fullPath)) {
				try {
					const stats = fs.statSync(fullPath);
					if (stats.isDirectory()) {
						// Return directory listing
						const entries = fs.readdirSync(fullPath);
						return `Directory listing for ${filePath}:\n${entries.join('\n')}`;
					}
					const content = fs.readFileSync(fullPath, 'utf-8');
					// Limit content size to prevent token overflow
					if (content.length > 50000) {
						return `File content (truncated to first 50000 characters):\n${content.slice(0, 50000)}...`;
					}
					return content;
				} catch (error) {
					const msg = error instanceof Error ? error.message : 'Unknown error';
					return `Error reading file: ${msg}`;
				}
			}
		}

		// Try absolute paths within worktrees
		for (const worktree of worktrees) {
			if (filePath.startsWith(worktree.worktreePath)) {
				if (fs.existsSync(filePath)) {
					try {
						const content = fs.readFileSync(filePath, 'utf-8');
						if (content.length > 50000) {
							return `File content (truncated):\n${content.slice(0, 50000)}...`;
						}
						return content;
					} catch (error) {
						const msg = error instanceof Error ? error.message : 'Unknown error';
						return `Error reading file: ${msg}`;
					}
				}
			}
		}

		return `File not found: ${filePath}. Available worktrees: ${worktrees.map((w) => w.worktreePath).join(', ')}`;
	}

	/**
	 * Define tools available to Claude for file reading
	 */
	private getTools(): Anthropic.Tool[] {
		return [
			{
				name: 'read_file',
				description:
					'Read the contents of a file from any of the worktrees. Provide a relative path from the worktree root (e.g., "package.json", "src/index.ts") or specify which worktree to read from.',
				input_schema: {
					type: 'object' as const,
					properties: {
						path: {
							type: 'string',
							description:
								'The file path to read. Can be relative to a worktree root (e.g., "package.json") or include the worktree name prefix (e.g., "myrepo.worktree/src/index.ts").',
						},
					},
					required: ['path'],
				},
			},
			{
				name: 'list_files',
				description:
					'List files in a directory within any of the worktrees. Useful for exploring project structure.',
				input_schema: {
					type: 'object' as const,
					properties: {
						path: {
							type: 'string',
							description:
								'The directory path to list. Can be "." for root, or a subdirectory like "src" or "lib".',
						},
						recursive: {
							type: 'boolean',
							description: 'If true, list files recursively (limited depth). Default is false.',
						},
					},
					required: ['path'],
				},
			},
		];
	}

	/**
	 * List files in a directory (for tool use)
	 */
	private listWorktreeFiles(worktrees: Worktree[], dirPath: string, recursive = false): string {
		const results: string[] = [];

		for (const worktree of worktrees) {
			const fullPath = dirPath === '.' ? worktree.worktreePath : path.join(worktree.worktreePath, dirPath);

			if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
				try {
					const entries = this.listDirectory(fullPath, recursive ? 2 : 0, '');
					results.push(`[${worktree.repositoryName}] ${dirPath === '.' ? '(root)' : dirPath}:\n${entries}`);
				} catch (error) {
					const msg = error instanceof Error ? error.message : 'Unknown error';
					results.push(`[${worktree.repositoryName}] Error: ${msg}`);
				}
			}
		}

		if (results.length === 0) {
			return `Directory not found: ${dirPath}`;
		}

		return results.join('\n\n');
	}

	/**
	 * List directory contents with optional recursion
	 */
	private listDirectory(dirPath: string, depth: number, indent: string): string {
		const entries = fs.readdirSync(dirPath);
		const lines: string[] = [];

		for (const entry of entries) {
			// Skip hidden files and common noise
			if (entry.startsWith('.') || entry === 'node_modules') {
				continue;
			}

			const fullPath = path.join(dirPath, entry);
			const stats = fs.statSync(fullPath);

			if (stats.isDirectory()) {
				lines.push(`${indent}${entry}/`);
				if (depth > 0) {
					const subEntries = this.listDirectory(fullPath, depth - 1, indent + '  ');
					if (subEntries) {
						lines.push(subEntries);
					}
				}
			} else {
				lines.push(`${indent}${entry}`);
			}
		}

		return lines.join('\n');
	}

	/**
	 * Process tool calls and return tool results
	 */
	private processToolCalls(
		toolUseBlocks: Anthropic.ToolUseBlock[],
		worktrees: Worktree[]
	): Anthropic.ToolResultBlockParam[] {
		return toolUseBlocks.map((toolUse) => {
			let result: string;

			if (toolUse.name === 'read_file') {
				const input = toolUse.input as { path: string };
				result = this.readWorktreeFile(worktrees, input.path);
			} else if (toolUse.name === 'list_files') {
				const input = toolUse.input as { path: string; recursive?: boolean };
				result = this.listWorktreeFiles(worktrees, input.path, input.recursive);
			} else {
				result = `Unknown tool: ${toolUse.name}`;
			}

			return {
				type: 'tool_result' as const,
				tool_use_id: toolUse.id,
				content: result,
			};
		});
	}

	/**
	 * Send a message to Claude and get a response
	 * Handles tool use for file reading automatically
	 */
	async chat(
		messages: Anthropic.MessageParam[],
		groveName: string,
		repositories: Repository[],
		worktrees: Worktree[]
	): Promise<{ response: string; updatedMessages: Anthropic.MessageParam[] }> {
		const systemPrompt = this.buildSystemPrompt(groveName, repositories, worktrees);
		const tools = this.getTools();

		let currentMessages = [...messages];
		let response = '';

		// Loop to handle multiple tool use rounds
		while (true) {
			const result = await this.client.messages.create({
				model: this.model,
				max_tokens: 4096,
				system: systemPrompt,
				tools,
				messages: currentMessages,
			});

			// Check if we need to handle tool use
			if (result.stop_reason === 'tool_use') {
				// Extract tool use blocks
				const toolUseBlocks = result.content.filter(
					(block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
				);

				// Process tool calls
				const toolResults = this.processToolCalls(toolUseBlocks, worktrees);

				// Add assistant message and tool results to conversation
				currentMessages = [
					...currentMessages,
					{ role: 'assistant', content: result.content },
					{ role: 'user', content: toolResults },
				];

				// Continue the loop to get the next response
				continue;
			}

			// Extract text response
			const textBlocks = result.content.filter(
				(block): block is Anthropic.TextBlock => block.type === 'text'
			);
			response = textBlocks.map((block) => block.text).join('\n');

			// Add assistant response to messages
			currentMessages = [...currentMessages, { role: 'assistant', content: result.content }];

			break;
		}

		return { response, updatedMessages: currentMessages };
	}

	/**
	 * Extract CONTEXT.md content from Claude's response
	 * Looks for markdown code blocks or structured content
	 */
	extractContextDraft(response: string): string | null {
		// Look for content between triple backticks with markdown language hint
		const markdownMatch = response.match(/```(?:markdown|md)?\s*\n([\s\S]*?)```/);
		if (markdownMatch) {
			return markdownMatch[1].trim();
		}

		// Look for content starting with "# " (markdown header)
		const headerMatch = response.match(/(^|\n)(# .+[\s\S]*)/);
		if (headerMatch) {
			return headerMatch[2].trim();
		}

		return null;
	}
}

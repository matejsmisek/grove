/**
 * LLM Service
 * Provides AI-powered features using OpenRouter API
 */
import type { ILLMService, ISettingsService, GroveNameGenerationResult } from './interfaces.js';

/**
 * Default LLM configuration
 */
const DEFAULT_MODEL = 'anthropic/claude-3.5-haiku';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * OpenRouter API request body (OpenAI-compatible format)
 */
interface OpenRouterRequest {
	model: string;
	messages: Array<{
		role: 'user' | 'assistant' | 'system';
		content: string;
	}>;
	max_tokens?: number;
	temperature?: number;
}

/**
 * OpenRouter API response (OpenAI-compatible format)
 */
interface OpenRouterResponse {
	id: string;
	choices: Array<{
		message: {
			role: string;
			content: string;
		};
		finish_reason: string;
	}>;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

/**
 * LLM Service implementation using OpenRouter API
 */
export class LLMService implements ILLMService {
	private settingsService: ISettingsService;

	constructor(settingsService: ISettingsService) {
		this.settingsService = settingsService;
	}

	/**
	 * Check if the LLM service is configured with an API key
	 */
	isConfigured(): boolean {
		const settings = this.settingsService.readSettings();
		return !!settings.openrouterApiKey && settings.openrouterApiKey.trim().length > 0;
	}

	/**
	 * Get the current model being used
	 */
	getModel(): string {
		const settings = this.settingsService.readSettings();
		return settings.llmModel || DEFAULT_MODEL;
	}

	/**
	 * Generate a grove name from a description
	 */
	async generateGroveName(description: string): Promise<GroveNameGenerationResult> {
		if (!this.isConfigured()) {
			throw new Error('OpenRouter API key not configured. Please set it in Settings.');
		}

		const settings = this.settingsService.readSettings();
		const model = this.getModel();

		const requestBody: OpenRouterRequest = {
			model,
			max_tokens: 100,
			temperature: 0.7,
			messages: [
				{
					role: 'user',
					content: `You are a helpful assistant that generates concise, descriptive names for git worktree collections (called "groves").

User's description: "${description}"

Generate a short, kebab-case name (2-5 words, lowercase, hyphen-separated) that captures the essence of this work.

Rules:
- Use only lowercase letters, numbers, and hyphens
- Keep it concise (2-5 words maximum)
- Make it descriptive but brief
- No special characters except hyphens
- Examples: "auth-bug-fix", "add-user-dashboard", "refactor-payment-flow"

Respond with ONLY the name, no explanation or extra text.`,
				},
			],
		};

		try {
			// Build headers, only including optional tracking headers if configured
			const headers: Record<string, string> = {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${settings.openrouterApiKey}`,
			};

			// Only add tracking headers if explicitly configured
			if (settings.llmSiteUrl) {
				headers['HTTP-Referer'] = settings.llmSiteUrl;
			}
			if (settings.llmAppName) {
				headers['X-Title'] = settings.llmAppName;
			}

			const response = await fetch(OPENROUTER_API_URL, {
				method: 'POST',
				headers,
				body: JSON.stringify(requestBody),
			});

			if (!response.ok) {
				const errorText = await response.text();
				if (response.status === 401) {
					throw new Error('Invalid OpenRouter API key. Please check your configuration.');
				}
				if (response.status === 429) {
					throw new Error('Rate limit reached. Please try again later.');
				}
				if (response.status === 402) {
					throw new Error('Insufficient credits. Please add credits to your OpenRouter account.');
				}
				throw new Error(
					`OpenRouter API error (${response.status}): ${errorText || response.statusText}`
				);
			}

			const data = (await response.json()) as OpenRouterResponse;

			// Extract the generated name from the response
			const generatedName = data.choices[0]?.message?.content?.trim();

			// Validate the generated name
			if (!generatedName || generatedName.length === 0) {
				throw new Error('LLM returned an empty name');
			}

			return {
				name: generatedName,
			};
		} catch (error) {
			if (error instanceof Error) {
				// Re-throw our custom errors
				if (
					error.message.includes('OpenRouter') ||
					error.message.includes('Invalid') ||
					error.message.includes('Rate limit') ||
					error.message.includes('credits')
				) {
					throw error;
				}
				// Network or other errors
				throw new Error(`LLM API error: ${error.message}`);
			}
			throw new Error('Unknown error occurred while generating grove name');
		}
	}
}

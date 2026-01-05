/**
 * LLM Service
 * Provides AI-powered features using OpenRouter/Anthropic SDK
 */
import Anthropic from '@anthropic-ai/sdk';

import type { ILLMService, ISettingsService, GroveNameGenerationResult } from './interfaces.js';

/**
 * Default LLM configuration
 */
const DEFAULT_MODEL = 'anthropic/claude-3.5-haiku';
const DEFAULT_SITE_URL = 'https://github.com/matejsmisek/grove';
const DEFAULT_APP_NAME = 'Grove';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * LLM Service implementation using Anthropic SDK with OpenRouter
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
	 * Create an Anthropic client configured for OpenRouter
	 */
	private createClient(): Anthropic {
		const settings = this.settingsService.readSettings();

		if (!settings.openrouterApiKey) {
			throw new Error('OpenRouter API key not configured. Please set it in Settings.');
		}

		return new Anthropic({
			apiKey: settings.openrouterApiKey,
			baseURL: OPENROUTER_BASE_URL,
			defaultHeaders: {
				'HTTP-Referer': settings.llmSiteUrl || DEFAULT_SITE_URL,
				'X-Title': settings.llmAppName || DEFAULT_APP_NAME,
			},
		});
	}

	/**
	 * Generate a grove name from a description
	 */
	async generateGroveName(description: string): Promise<GroveNameGenerationResult> {
		if (!this.isConfigured()) {
			throw new Error('OpenRouter API key not configured. Please set it in Settings.');
		}

		const client = this.createClient();
		const model = this.getModel();

		try {
			const response = await client.messages.create({
				model,
				max_tokens: 100,
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
			});

			// Extract the generated name from the response
			const textContent = response.content.find((block) => block.type === 'text');
			if (!textContent || textContent.type !== 'text') {
				throw new Error('No text response from LLM');
			}

			const generatedName = textContent.text.trim();

			// Validate the generated name
			if (!generatedName || generatedName.length === 0) {
				throw new Error('LLM returned an empty name');
			}

			return {
				name: generatedName,
			};
		} catch (error) {
			if (error instanceof Error) {
				// Check for common API errors
				if (error.message.includes('401') || error.message.includes('authentication')) {
					throw new Error('Invalid OpenRouter API key. Please check your configuration.');
				}
				if (error.message.includes('429') || error.message.includes('rate limit')) {
					throw new Error('Rate limit reached. Please try again later.');
				}
				throw new Error(`LLM API error: ${error.message}`);
			}
			throw new Error('Unknown error occurred while generating grove name');
		}
	}
}

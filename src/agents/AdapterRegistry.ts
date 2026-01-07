import { IAgentAdapter } from './types.js';
import { AgentType } from '../storage/types.js';

/**
 * Registry for agent adapters
 * Allows dynamic registration and lookup of adapters
 */
export class AdapterRegistry {
	private adapters = new Map<AgentType, IAgentAdapter>();

	register(adapter: IAgentAdapter): void {
		this.adapters.set(adapter.agentType, adapter);
	}

	get(agentType: AgentType): IAgentAdapter | undefined {
		return this.adapters.get(agentType);
	}

	getAll(): IAgentAdapter[] {
		return Array.from(this.adapters.values());
	}

	async getAvailable(): Promise<IAgentAdapter[]> {
		const available: IAgentAdapter[] = [];
		for (const adapter of this.adapters.values()) {
			if (await adapter.isAvailable()) {
				available.push(adapter);
			}
		}
		return available;
	}
}

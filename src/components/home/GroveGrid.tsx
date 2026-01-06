import React from 'react';

import { Box } from 'ink';

import type { ISessionTrackingService } from '../../services/SessionTrackingService.js';
import type { GroveReference } from '../../storage/index.js';
import { CreateGrovePanel } from './CreateGrovePanel.js';
import { GrovePanel } from './GrovePanel.js';

type GroveGridProps = {
	groves: GroveReference[];
	selectedIndex: number;
	sessionTrackingService: ISessionTrackingService;
};

export function GroveGrid({ groves, selectedIndex, sessionTrackingService }: GroveGridProps) {
	// Total items = 1 (create button) + groves.length
	const totalItems = 1 + groves.length;
	const rowCount = Math.ceil(totalItems / 4);

	return (
		<Box flexDirection="column">
			{Array.from({ length: rowCount }).map((_, rowIndex) => {
				const startIndex = rowIndex * 4;
				const items: React.ReactNode[] = [];

				for (let i = 0; i < 4; i++) {
					const itemIndex = startIndex + i;
					if (itemIndex >= totalItems) break;

					const isSelected = selectedIndex === itemIndex;
					const marginLeft = i > 0 ? 1 : 0;

					if (itemIndex === 0) {
						// First item is always the Create Grove button
						items.push(
							<Box key="create" marginLeft={marginLeft}>
								<CreateGrovePanel isSelected={isSelected} />
							</Box>
						);
					} else {
						// Remaining items are groves (offset by 1)
						const grove = groves[itemIndex - 1];
						if (grove) {
							// Get session counts for this grove
							const sessionCounts = sessionTrackingService.getGroveSessionCounts(grove.id);

							items.push(
								<Box key={grove.id} marginLeft={marginLeft}>
									<GrovePanel
										grove={grove}
										isSelected={isSelected}
										sessionCounts={sessionCounts}
									/>
								</Box>
							);
						}
					}
				}

				return (
					<Box key={rowIndex} marginBottom={1}>
						{items}
					</Box>
				);
			})}
		</Box>
	);
}

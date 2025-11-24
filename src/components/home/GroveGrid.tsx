import React from 'react';

import { Box } from 'ink';

import type { GroveReference } from '../../storage/index.js';
import { GrovePanel } from './GrovePanel.js';

type GroveGridProps = {
	groves: GroveReference[];
	selectedIndex: number;
};

export function GroveGrid({ groves, selectedIndex }: GroveGridProps) {
	return (
		<Box flexDirection="column">
			{Array.from({ length: Math.ceil(groves.length / 4) }).map((_, rowIndex) => {
				const grove1 = groves[rowIndex * 4];
				const grove2 = groves[rowIndex * 4 + 1];
				const grove3 = groves[rowIndex * 4 + 2];
				const grove4 = groves[rowIndex * 4 + 3];

				return (
					<Box key={rowIndex} marginBottom={1}>
						{grove1 && <GrovePanel grove={grove1} isSelected={selectedIndex === rowIndex * 4} />}
						{grove2 && (
							<Box marginLeft={1}>
								<GrovePanel grove={grove2} isSelected={selectedIndex === rowIndex * 4 + 1} />
							</Box>
						)}
						{grove3 && (
							<Box marginLeft={1}>
								<GrovePanel grove={grove3} isSelected={selectedIndex === rowIndex * 4 + 2} />
							</Box>
						)}
						{grove4 && (
							<Box marginLeft={1}>
								<GrovePanel grove={grove4} isSelected={selectedIndex === rowIndex * 4 + 3} />
							</Box>
						)}
					</Box>
				);
			})}
		</Box>
	);
}

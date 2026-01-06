import React, { useEffect, useState } from 'react';

import { Box, Text } from 'ink';

interface SessionIndicatorProps {
	activeCount: number;
	idleCount: number;
	attentionCount: number;
}

// Grove-style loader frames
const LOADER_FRAMES = ['·', '✻', '✽', '✶', '✳', '✢'];

export function SessionIndicator({
	activeCount,
	idleCount,
	attentionCount,
}: SessionIndicatorProps) {
	const [frameIndex, setFrameIndex] = useState(0);

	// Animate loader if there are active sessions
	useEffect(() => {
		if (activeCount === 0) return;

		const interval = setInterval(() => {
			setFrameIndex((prev) => (prev + 1) % LOADER_FRAMES.length);
		}, 100); // 100ms per frame for smooth animation

		return () => clearInterval(interval);
	}, [activeCount]);

	if (activeCount === 0 && idleCount === 0 && attentionCount === 0) {
		return null;
	}

	return (
		<Box gap={1}>
			{activeCount > 0 && (
				<Box flexDirection="row">
					{Array.from({ length: activeCount }).map((_, i) => (
						<Box key={i} minWidth={2} flexShrink={0}>
							<Text color="green">{LOADER_FRAMES[frameIndex]}</Text>
						</Box>
					))}
				</Box>
			)}
			{idleCount > 0 && (
				<Box flexDirection="row">
					{Array.from({ length: idleCount }).map((_, i) => (
						<Box key={i} minWidth={2} flexShrink={0}>
							<Text color="gray">·</Text>
						</Box>
					))}
				</Box>
			)}
			{attentionCount > 0 && (
				<Box flexDirection="row">
					{Array.from({ length: attentionCount }).map((_, i) => (
						<Box key={i} minWidth={2} flexShrink={0}>
							<Text color="yellow">⚠</Text>
						</Box>
					))}
				</Box>
			)}
		</Box>
	);
}

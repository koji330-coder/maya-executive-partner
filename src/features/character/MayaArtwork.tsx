import React from 'react';
import { Animated, Image, StyleSheet } from 'react-native';

import type { EyeState, MayaEmotion, MayaPose, MouthState } from './mayaTypes';
import { resolveFrame } from './expressionAssets';

export interface MayaArtworkProps {
  width: number;
  height: number;
  emotion: MayaEmotion;
  pose: MayaPose;
  eye: EyeState;
  mouth: MouthState;
  /** 0 → 1 → 0 breath cycle. */
  breath: Animated.Value;
  /** 0 → 1 → 0 slow idle drift. */
  idleSway: Animated.Value;
}

/**
 * Renders the generated MAYA artwork.
 *
 * All four frames of the current expression are mounted at once and toggled with
 * `hidden`, so a blink never waits on an image decode. Swapping the `source` of
 * a single Image flickers on the first change; keeping them resident does not.
 */
export function MayaArtwork({
  width,
  height,
  emotion,
  eye,
  mouth,
  breath,
  idleSway,
}: MayaArtworkProps) {
  const current = resolveFrame(emotion, eye, mouth);
  const frames = React.useMemo(
    () => [
      resolveFrame(emotion, 'open', 'closed'),
      resolveFrame(emotion, 'closed', 'closed'),
      resolveFrame(emotion, 'open', 'open'),
      resolveFrame(emotion, 'closed', 'open'),
    ],
    [emotion],
  );

  const transform = {
    transform: [
      {
        rotate: idleSway.interpolate({ inputRange: [0, 1], outputRange: ['-0.5deg', '0.5deg'] }),
      },
      { scaleY: breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.006] }) },
      {
        translateY: breath.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -Math.max(1, height * 0.004)],
        }),
      },
    ],
  };

  return (
    <Animated.View style={[styles.root, { width, height }, transform]}>
      {frames.map((frame, index) => (
        <Image
          key={index}
          source={frame}
          style={[styles.frame, frame === current ? null : styles.frameHidden]}
          resizeMode="contain"
          accessibilityRole="image"
          accessibilityLabel={`MAYA（${emotion}）`}
        />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  frame: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  // Kept mounted and decoded so a blink never waits on an image load.
  frameHidden: {
    opacity: 0,
  },
});

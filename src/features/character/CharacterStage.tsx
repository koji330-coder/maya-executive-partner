import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { colors, isDarkScene, radius, sceneThemes, spacing } from '@/theme';

import { PlaceholderMaya } from './placeholder/PlaceholderMaya';

import type { CharacterRuntime } from './useCharacterRuntime';

export interface CharacterStageProps {
  runtime: CharacterRuntime;
  height: number;
  /** Shows the "考えています…" caption while MAYA is thinking. */
  showStatus?: boolean;
  style?: ViewStyle;
}

/**
 * The place MAYA lives.
 *
 * docs/MAYA_CHARACTER_BIBLE.md §6 asks for a consistent room rather than a
 * transparent cut-out floating in a chat app, so the stage owns the scene
 * background and the character sits inside it.
 */
export function CharacterStage({ runtime, height, showStatus = true, style }: CharacterStageProps) {
  const { visualState, eye, mouth, breathing } = runtime;
  const scene = sceneThemes[visualState.scene];
  const dark = isDarkScene(visualState.scene);
  const [stageWidth, setStageWidth] = React.useState(0);

  const characterHeight = height * 0.92;
  const characterWidth = Math.min(stageWidth * 0.9, characterHeight * 0.78);

  return (
    <View
      style={[styles.root, { height, backgroundColor: scene.backgroundBottom }, style]}
      onLayout={(event) => setStageWidth(event.nativeEvent.layout.width)}
    >
      <View style={[styles.backdropTop, { backgroundColor: scene.backgroundTop }]} />
      <View style={[styles.floorLine, { backgroundColor: scene.accent, opacity: dark ? 0.3 : 0.18 }]} />

      {stageWidth > 0 ? (
        <PlaceholderStageCharacter
          width={characterWidth}
          height={characterHeight}
          runtime={runtime}
          breathing={breathing}
          eye={eye}
          mouth={mouth}
        />
      ) : null}

      {showStatus && visualState.activity === 'thinking' ? (
        <View style={[styles.status, { backgroundColor: dark ? '#00000055' : '#FFFFFFCC' }]}>
          <ThinkingDots color={dark ? colors.ivory : colors.charcoalSoft} />
          <Text style={[styles.statusText, { color: dark ? colors.ivory : colors.charcoalSoft }]}>
            考えています…
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function PlaceholderStageCharacter({
  width,
  height,
  runtime,
  breathing,
  eye,
  mouth,
}: {
  width: number;
  height: number;
  runtime: CharacterRuntime;
  breathing: CharacterRuntime['breathing'];
  eye: CharacterRuntime['eye'];
  mouth: CharacterRuntime['mouth'];
}) {
  return (
    <PlaceholderMaya
      width={width}
      height={height}
      emotion={runtime.visualState.emotion}
      pose={runtime.visualState.pose}
      eye={eye}
      mouth={mouth}
      isSpeaking={runtime.visualState.isSpeaking}
      breath={breathing.breath}
      idleSway={breathing.idleSway}
    />
  );
}

/** Three dots that fade in sequence. Deliberately not a spinner (docs/UX_SPEC.md §4). */
function ThinkingDots({ color }: { color: string }) {
  return (
    <View style={styles.dots}>
      {[0, 1, 2].map((index) => (
        <View key={index} style={[styles.dot, { backgroundColor: color, opacity: 0.4 + index * 0.2 }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  backdropTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '62%',
  },
  floorLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '18%',
    height: 1,
  },
  status: {
    position: 'absolute',
    bottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '500',
  },
  dots: {
    flexDirection: 'row',
    gap: 3,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
});

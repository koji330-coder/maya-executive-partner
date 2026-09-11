import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { colors, isDarkScene, radius, sceneThemes, spacing } from '@/theme';

import { hasArtwork } from './expressionAssets';
import { MayaArtwork } from './MayaArtwork';
import { PlaceholderMaya } from './placeholder/PlaceholderMaya';

import type { CharacterRuntime } from './useCharacterRuntime';

export interface CharacterStageProps {
  runtime: CharacterRuntime;
  height: number;
  /** Shows the "考えています…" caption while MAYA is thinking. */
  showStatus?: boolean;
  /**
   * Crops to the face instead of showing the whole figure.
   *
   * With the keyboard up, the full stage leaves about three lines of
   * conversation on a 844pt screen, which is unusable. Shrinking the stage on
   * its own would scale her down to a thumbnail; cropping keeps the face, and
   * the face is what carries the expression.
   */
  compact?: boolean;
  style?: ViewStyle;
}

/**
 * Where the head sits in the artwork, as a fraction of image height.
 *
 * Measured from the mask work: eyes land around 27-29%, the mouth at 40%. The
 * band below leaves room for the chin and shoulders.
 */
const FACE_TOP = 0.06;
const FACE_BOTTOM = 0.56;

/**
 * The place MAYA lives.
 *
 * docs/MAYA_CHARACTER_BIBLE.md §6 asks for a consistent room rather than a
 * transparent cut-out floating in a chat app, so the stage owns the scene
 * background and the character sits inside it.
 */
export function CharacterStage({
  runtime,
  height,
  showStatus = true,
  compact = false,
  style,
}: CharacterStageProps) {
  const { visualState, eye, mouth, breathing } = runtime;
  const scene = sceneThemes[visualState.scene];
  const dark = isDarkScene(visualState.scene);
  const [stageWidth, setStageWidth] = React.useState(0);

  // Full: the figure stands in the room, anchored at the floor.
  // Compact: the face band fills the strip, so the rest is clipped away.
  const characterHeight = compact ? height / (FACE_BOTTOM - FACE_TOP) : height * 0.92;
  const characterWidth = Math.min(
    compact ? Number.POSITIVE_INFINITY : stageWidth * 0.9,
    characterHeight * 0.78,
  );
  const characterTop = compact ? -characterHeight * FACE_TOP : height - characterHeight;

  return (
    <View
      style={[styles.root, { height, backgroundColor: scene.backgroundBottom }, style]}
      onLayout={(event) => setStageWidth(event.nativeEvent.layout.width)}
    >
      <View style={[styles.backdropTop, { backgroundColor: scene.backgroundTop }]} />
      <View style={[styles.floorLine, { backgroundColor: scene.accent, opacity: dark ? 0.3 : 0.18 }]} />

      {stageWidth > 0 ? (
        <View style={[styles.characterSlot, { top: characterTop, height: characterHeight }]}>
          <StageCharacter
            width={characterWidth}
            height={characterHeight}
            runtime={runtime}
            breathing={breathing}
            eye={eye}
            mouth={mouth}
          />
        </View>
      ) : null}

      {showStatus && visualState.activity === 'thinking' ? (
        <View
          style={[
            styles.status,
            compact && styles.statusCompact,
            { backgroundColor: dark ? '#00000055' : '#FFFFFFCC' },
          ]}
        >
          <ThinkingDots color={dark ? colors.ivory : colors.charcoalSoft} />
          <Text style={[styles.statusText, { color: dark ? colors.ivory : colors.charcoalSoft }]}>
            考えています…
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Picks the generated artwork when the current emotion has it, and the
 * placeholder when it does not. Only a couple of expressions are drawn so far,
 * so both paths stay live (docs/ASSET_PIPELINE.md §4).
 */
function StageCharacter({
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
  const { emotion, pose, isSpeaking } = runtime.visualState;
  const shared = {
    width,
    height,
    emotion,
    pose,
    eye,
    mouth,
    breath: breathing.breath,
    idleSway: breathing.idleSway,
  };
  return hasArtwork(emotion) ? (
    <MayaArtwork {...shared} />
  ) : (
    <PlaceholderMaya {...shared} isSpeaking={isSpeaking} />
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
  characterSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
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
  statusCompact: {
    bottom: spacing.xs,
    paddingVertical: 2,
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

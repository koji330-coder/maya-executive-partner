import React from 'react';
import { Image, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { colors, isDarkScene, radius, sceneThemes, spacing } from '@/theme';

import { hasArtwork } from './expressionAssets';
import { MayaArtwork } from './MayaArtwork';
import { PlaceholderMaya } from './placeholder/PlaceholderMaya';
import { resolveScenePlate } from './sceneAssets';

import type { CharacterRuntime } from './useCharacterRuntime';

export interface CharacterStageProps {
  runtime: CharacterRuntime;
  height: number;
  /** Shows the "考えています…" caption while MAYA is thinking. */
  showStatus?: boolean;
  /** How much of her the moment calls for. See `CROPS`. */
  presentation?: StagePresentation;
  /** Rounds the stage and clips it, for the small portrait beside the input. */
  rounded?: number;
  style?: ViewStyle;
}

/**
 * The four ways MAYA appears, from the screen mock.
 *
 * She is one bust-up cut-out; what changes between these is how much of it the
 * frame keeps. That is the whole animation budget: enlarging her for one reply
 * and letting her settle back reads as a reaction without a second drawing.
 */
export type StagePresentation = 'hero' | 'chat' | 'input' | 'reaction';

/**
 * The band of the artwork each presentation keeps, as a fraction of image
 * height. Eyes land around 27-29% and the mouth at 40%, measured from the mask
 * work, so every crop but `hero` keeps that range well inside it.
 */
const CROPS: Record<StagePresentation, { top: number; bottom: number }> = {
  // The whole figure, standing in the room. Home screen only.
  hero: { top: 0.0, bottom: 1.0 },
  // Head and shoulders. Enough presence to be listened to, short enough to
  // leave the conversation the rest of the screen.
  chat: { top: 0.02, bottom: 0.68 },
  // Just the face. With the keyboard up the full stage leaves about three
  // lines of conversation on an 844pt screen, which is unusable. Shrinking her
  // instead of cropping would make a thumbnail of the whole figure, and the
  // face is what carries the expression.
  input: { top: 0.04, bottom: 0.44 },
  // Bigger than `chat` and tighter than `hero`: she has come closer to say
  // something that matters.
  reaction: { top: 0.0, bottom: 0.58 },
};

/** The plates are drawn 3:4 portrait (docs/ASSET_PIPELINE.md §7). */
const PLATE_ASPECT = 4 / 3;

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
  presentation = 'chat',
  rounded,
  style,
}: CharacterStageProps) {
  const { visualState, eye, mouth, breathing } = runtime;
  const scene = sceneThemes[visualState.scene];
  const dark = isDarkScene(visualState.scene);
  const [stageWidth, setStageWidth] = React.useState(0);
  const plate = resolveScenePlate(visualState.scene);

  // Scale the artwork so the kept band exactly fills the stage, then slide it
  // up so that band starts at the top. `hero` keeps everything, so it reduces
  // to the figure standing on the floor of the frame.
  const crop = CROPS[presentation];
  const hero = presentation === 'hero';
  const characterHeight = hero ? height * 0.92 : height / (crop.bottom - crop.top);
  const characterWidth = Math.min(
    hero ? stageWidth * 0.9 : Number.POSITIVE_INFINITY,
    characterHeight * 0.78,
  );
  const characterTop = hero ? height - characterHeight : -characterHeight * crop.top;

  return (
    <View
      style={[
        styles.root,
        { height, backgroundColor: scene.backgroundBottom },
        rounded === undefined ? null : { borderRadius: rounded },
        style,
      ]}
      onLayout={(event) => setStageWidth(event.nativeEvent.layout.width)}
    >
      {plate ? (
        // The plate is drawn to the stage width, so it is taller than the strip
        // it sits in and something has to be cropped away. Which end survives
        // differs by mode: the full stage keeps the floor, where her feet are,
        // and the compact strip keeps the wall, which is what sits behind a
        // face. Cropping the other way puts a floorboard behind her head.
        <Image
          source={plate}
          style={[
            styles.plate,
            { height: stageWidth > 0 ? stageWidth * PLATE_ASPECT : '100%' },
            hero ? styles.plateBottom : styles.plateTop,
          ]}
          resizeMode="cover"
        />
      ) : (
        // No plate for this hour yet. The painted gradient is honest about that;
        // borrowing another hour's room would contradict what MAYA just said
        // about the time.
        <>
          <View style={[styles.backdropTop, { backgroundColor: scene.backgroundTop }]} />
          <View
            style={[styles.floorLine, { backgroundColor: scene.accent, opacity: dark ? 0.3 : 0.18 }]}
          />
        </>
      )}

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
            presentation !== 'hero' && styles.statusCompact,
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
  plate: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  plateTop: {
    top: 0,
  },
  plateBottom: {
    bottom: 0,
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

import React, { useMemo } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

import type { EyeState, MayaEmotion, MayaPose, MouthState } from '../mayaTypes';
import {
  EMOTION_BROWS,
  EMOTION_EYE_SCALE,
  EMOTION_MOUTH,
  EYE_APERTURE,
  MOUTH_OPENNESS,
  POSE_TRANSFORMS,
} from './placeholderStyleMaps';

export interface PlaceholderMayaProps {
  width: number;
  height: number;
  emotion: MayaEmotion;
  pose: MayaPose;
  eye: EyeState;
  mouth: MouthState;
  isSpeaking: boolean;
  /** 0 → 1 → 0 breath cycle. */
  breath: Animated.Value;
  /** 0 → 1 → 0 slow idle drift. */
  idleSway: Animated.Value;
}

/**
 * Stand-in for the generated MAYA layers.
 *
 * It consumes exactly the state the real renderer will consume — emotion, pose,
 * eyelid frame, mouth frame and the two micro-motion values — so replacing it
 * with the WebP layer stack is a swap of this component alone.
 */
export function PlaceholderMaya({
  width,
  height,
  emotion,
  pose,
  eye,
  mouth,
  isSpeaking,
  breath,
  idleSway,
}: PlaceholderMayaProps) {
  const metrics = useMemo(() => computeMetrics(width, height), [width, height]);
  const poseTransform = POSE_TRANSFORMS[pose];

  const eyeScale = EMOTION_EYE_SCALE[emotion];
  const leftAperture = EYE_APERTURE[eye] * eyeScale;
  // The wink state closes the right eye only, regardless of the blink frame.
  const rightAperture = emotion === 'wink' ? EYE_APERTURE.closed : leftAperture;

  const restingMouth = EMOTION_MOUTH[emotion];
  const openness = MOUTH_OPENNESS[mouth];
  const mouthWidth =
    metrics.headWidth * (isSpeaking ? restingMouth.width * (1 - 0.25 * openness) : restingMouth.width);
  const mouthHeight =
    metrics.headHeight * (isSpeaking ? restingMouth.height + 0.11 * openness : restingMouth.height);
  const mouthCurve = isSpeaking ? restingMouth.curve * (1 - openness) : restingMouth.curve;

  const brows = EMOTION_BROWS[emotion];

  const bodyTransform = {
    transform: [
      { translateX: width * poseTransform.shiftX },
      { scale: poseTransform.scale },
      {
        rotate: idleSway.interpolate({
          inputRange: [0, 1],
          outputRange: [`${poseTransform.tilt - 0.5}deg`, `${poseTransform.tilt + 0.5}deg`],
        }),
      },
      {
        scaleY: breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.006] }),
      },
    ],
  };

  const headTransform = {
    transform: [
      {
        translateY: breath.interpolate({ inputRange: [0, 1], outputRange: [0, -metrics.breathLift] }),
      },
      { rotate: `${poseTransform.headTilt}deg` },
    ],
  };

  return (
    <Animated.View
      style={[styles.root, { width, height }, bodyTransform]}
      accessibilityRole="image"
      accessibilityLabel={`MAYA（${emotion}）`}
    >
      {/* Shoulders / upper body */}
      <View
        style={[
          styles.body,
          {
            width: metrics.bodyWidth,
            height: metrics.bodyHeight,
            borderTopLeftRadius: metrics.bodyWidth / 2,
            borderTopRightRadius: metrics.bodyWidth / 2,
            bottom: 0,
          },
        ]}
      />
      <View
        style={[
          styles.neck,
          {
            width: metrics.neckWidth,
            height: metrics.neckHeight,
            bottom: metrics.bodyHeight - metrics.neckHeight * 0.25,
          },
        ]}
      />
      <View
        style={[
          styles.collar,
          {
            width: metrics.neckWidth * 1.9,
            height: metrics.headHeight * 0.13,
            bottom: metrics.bodyHeight - metrics.headHeight * 0.06,
          },
        ]}
      />

      <Animated.View style={[styles.headGroup, { bottom: metrics.headBottom }, headTransform]}>
        {/* Hair, back layer */}
        <View
          style={[
            styles.hairBack,
            {
              width: metrics.headWidth * 1.32,
              height: metrics.headHeight * 1.5,
              borderRadius: metrics.headWidth * 0.66,
            },
          ]}
        />

        {/* Face */}
        <View
          style={[
            styles.head,
            {
              width: metrics.headWidth,
              height: metrics.headHeight,
              borderRadius: metrics.headWidth * 0.46,
              borderBottomLeftRadius: metrics.headWidth * 0.5,
              borderBottomRightRadius: metrics.headWidth * 0.5,
            },
          ]}
        >
          {emotion === 'happy' || emotion === 'wink' ? (
            <>
              <View
                style={[
                  styles.blush,
                  { width: metrics.eyeWidth, height: metrics.eyeWidth * 0.5, left: metrics.headWidth * 0.1, top: metrics.headHeight * 0.56 },
                ]}
              />
              <View
                style={[
                  styles.blush,
                  { width: metrics.eyeWidth, height: metrics.eyeWidth * 0.5, right: metrics.headWidth * 0.1, top: metrics.headHeight * 0.56 },
                ]}
              />
            </>
          ) : null}

          <Brow
            side="left"
            width={metrics.eyeWidth * 1.1}
            top={metrics.headHeight * 0.34 + brows.left.offset}
            left={metrics.headWidth * 0.18}
            angle={brows.left.angle}
          />
          <Brow
            side="right"
            width={metrics.eyeWidth * 1.1}
            top={metrics.headHeight * 0.34 + brows.right.offset}
            left={metrics.headWidth * 0.58}
            angle={brows.right.angle}
          />

          <Eye
            width={metrics.eyeWidth}
            maxHeight={metrics.eyeHeight}
            aperture={leftAperture}
            top={metrics.headHeight * 0.45}
            left={metrics.headWidth * 0.19}
          />
          <Eye
            width={metrics.eyeWidth}
            maxHeight={metrics.eyeHeight}
            aperture={rightAperture}
            top={metrics.headHeight * 0.45}
            left={metrics.headWidth * 0.59}
          />

          {/* Nose */}
          <View
            style={[
              styles.nose,
              {
                width: metrics.headWidth * 0.05,
                height: metrics.headHeight * 0.05,
                top: metrics.headHeight * 0.63,
                left: metrics.headWidth * 0.475,
              },
            ]}
          />

          <Mouth
            width={mouthWidth}
            height={mouthHeight}
            curve={mouthCurve}
            top={metrics.headHeight * 0.73}
            centerX={metrics.headWidth / 2}
          />
        </View>

        {/* Hair, front layer sits above the face */}
        <View
          style={[
            styles.hairFront,
            {
              width: metrics.headWidth * 1.06,
              height: metrics.headHeight * 0.34,
              borderTopLeftRadius: metrics.headWidth * 0.53,
              borderTopRightRadius: metrics.headWidth * 0.53,
              borderBottomLeftRadius: metrics.headWidth * 0.42,
              borderBottomRightRadius: metrics.headWidth * 0.16,
            },
          ]}
        />
      </Animated.View>
    </Animated.View>
  );
}

function Eye({
  width,
  maxHeight,
  aperture,
  top,
  left,
}: {
  width: number;
  maxHeight: number;
  aperture: number;
  top: number;
  left: number;
}) {
  const height = Math.max(1.5, maxHeight * aperture);
  return (
    <View style={[styles.eyeSocket, { width, height, top: top + (maxHeight - height) / 2, left }]}>
      <View style={[styles.iris, { width: width * 0.46, height: Math.max(1.5, height * 0.88) }]}>
        {height > 4 ? (
          <View style={[styles.catchlight, { width: width * 0.14, height: width * 0.14 }]} />
        ) : null}
      </View>
    </View>
  );
}

function Brow({
  side,
  width,
  top,
  left,
  angle,
}: {
  side: 'left' | 'right';
  width: number;
  top: number;
  left: number;
  angle: number;
}) {
  // A positive angle should raise the outer end on both sides.
  const rotate = side === 'left' ? -angle : angle;
  return (
    <View
      style={[styles.brow, { width, top, left, transform: [{ rotate: `${rotate}deg` }] }]}
    />
  );
}

function Mouth({
  width,
  height,
  curve,
  top,
  centerX,
}: {
  width: number;
  height: number;
  curve: number;
  top: number;
  centerX: number;
}) {
  // Asymmetric corner radii fake a curve without pulling in an SVG dependency.
  const upper = curve > 0 ? height * 0.2 : height * (0.5 + 0.5 * Math.abs(curve));
  const lower = curve > 0 ? height * (0.5 + 0.5 * curve) : height * 0.2;
  return (
    <View
      style={[
        styles.mouth,
        {
          width,
          height,
          left: centerX - width / 2,
          top,
          borderTopLeftRadius: upper,
          borderTopRightRadius: upper,
          borderBottomLeftRadius: lower,
          borderBottomRightRadius: lower,
        },
      ]}
    />
  );
}

function computeMetrics(width: number, height: number) {
  const headHeight = height * 0.4;
  const headWidth = headHeight * 0.74;
  const bodyHeight = height * 0.32;
  return {
    headWidth,
    headHeight,
    // The chin must clear the collar, otherwise the face reads as a mask on a shirt.
    headBottom: bodyHeight - headHeight * 0.04,
    neckWidth: headWidth * 0.34,
    neckHeight: headHeight * 0.16,
    bodyWidth: headWidth * 1.9,
    bodyHeight,
    eyeWidth: headWidth * 0.23,
    eyeHeight: headHeight * 0.115,
    breathLift: Math.max(1, height * 0.004),
  };
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  body: {
    position: 'absolute',
    backgroundColor: colors.ivory,
    borderWidth: 1,
    borderColor: colors.line,
  },
  neck: {
    position: 'absolute',
    backgroundColor: '#E7C3A8',
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
  },
  collar: {
    position: 'absolute',
    backgroundColor: '#EFE6D8',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
  },
  headGroup: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  hairBack: {
    position: 'absolute',
    backgroundColor: '#4A3527',
    bottom: 0,
  },
  head: {
    backgroundColor: '#F2DCC9',
    overflow: 'hidden',
  },
  hairFront: {
    position: 'absolute',
    top: 0,
    backgroundColor: '#57402F',
  },
  eyeSocket: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: '#C9A98E',
  },
  iris: {
    backgroundColor: '#4A3527',
    borderRadius: 999,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    paddingTop: 1,
    paddingRight: 1,
  },
  catchlight: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    opacity: 0.85,
  },
  brow: {
    position: 'absolute',
    height: 3,
    borderRadius: 2,
    backgroundColor: '#4A3527',
  },
  nose: {
    position: 'absolute',
    backgroundColor: '#E0BFA5',
    borderRadius: 999,
  },
  mouth: {
    position: 'absolute',
    backgroundColor: '#C4706B',
  },
  blush: {
    position: 'absolute',
    backgroundColor: '#F0B7A8',
    opacity: 0.55,
    borderRadius: 999,
  },
});

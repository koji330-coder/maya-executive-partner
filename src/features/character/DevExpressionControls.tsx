import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { listClipKeys } from '@/services/audio';
import { colors, radius, spacing } from '@/theme';

import { MAYA_EMOTIONS, MAYA_POSES, MAYA_SCENES } from './mayaTypes';
import type { CharacterRuntime } from './useCharacterRuntime';

export interface DevExpressionControlsProps {
  runtime: CharacterRuntime;
}

/**
 * Temporary Phase 1 control surface for driving the character by hand.
 *
 * docs/ACCEPTANCE_CRITERIA.md forbids release screens from depending on a
 * developer control, so callers must gate this behind `__DEV__`.
 */
export function DevExpressionControls({ runtime }: DevExpressionControlsProps) {
  const { machine, visualState } = runtime;

  return (
    <View style={styles.root}>
      <Text style={styles.title}>開発用コントロール（Phase 1）</Text>

      <Row label="表情">
        {MAYA_EMOTIONS.map((emotion) => (
          <Chip
            key={emotion}
            label={emotion}
            selected={visualState.emotion === emotion}
            onPress={() => machine.setEmotion(emotion)}
          />
        ))}
      </Row>

      <Row label="ポーズ">
        {MAYA_POSES.map((pose) => (
          <Chip
            key={pose}
            label={pose}
            selected={visualState.pose === pose}
            onPress={() => machine.setPose(pose)}
          />
        ))}
      </Row>

      <Row label="シーン">
        {MAYA_SCENES.map((scene) => (
          <Chip
            key={scene}
            label={scene}
            selected={visualState.scene === scene}
            onPress={() => machine.setScene(scene)}
          />
        ))}
      </Row>

      <Row label="状態">
        <Chip label="idle" selected={visualState.activity === 'idle'} onPress={() => machine.setIdle()} />
        <Chip
          label="listening"
          selected={visualState.activity === 'listening'}
          onPress={() => machine.setListening()}
        />
        <Chip
          label="thinking"
          selected={visualState.activity === 'thinking'}
          onPress={() => machine.beginThinking()}
        />
      </Row>

      <Row label="音声（リップシンク）">
        {listClipKeys().map((key) => (
          <Chip key={key} label={key} selected={false} onPress={() => void runtime.speak(key)} />
        ))}
        <Chip label="停止" selected={false} onPress={() => void runtime.stopSpeaking()} />
      </Row>
    </View>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {children}
      </ScrollView>
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  title: {
    paddingHorizontal: spacing.md,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.muted,
    textTransform: 'uppercase',
  },
  row: {
    gap: spacing.xs,
  },
  rowLabel: {
    paddingHorizontal: spacing.md,
    fontSize: 12,
    color: colors.muted,
  },
  chips: {
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.ivory,
  },
  chipSelected: {
    backgroundColor: colors.charcoal,
    borderColor: colors.charcoal,
  },
  chipText: {
    fontSize: 12,
    color: colors.charcoalSoft,
  },
  chipTextSelected: {
    color: colors.ivory,
  },
});

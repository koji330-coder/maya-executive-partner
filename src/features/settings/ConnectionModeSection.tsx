import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ConnectionMode } from '@/services/api/server';
import { colors, radius, spacing } from '@/theme';

const LABEL: Record<ConnectionMode, string> = {
  server: 'MAYAサーバー',
  direct: 'このスマホから直接',
};

const NOW: Record<ConnectionMode, string> = {
  server: 'いまはサーバー経由で相談しています。判断・Journal・話題はサーバーに保存されます。',
  direct: 'いまはこのスマホから直接 Gemini を呼んでいます。判断・Journal・話題はこのスマホに保存されます。',
};

/**
 * The switch at the top of settings. Everything below it belongs to the chosen
 * route, so what is on screen is what is in effect.
 *
 * A switch, not tabs: tabs read as two views to compare, and this is a choice of
 * how MAYA runs.
 */
export function ConnectionModeSection({
  mode,
  onChange,
}: {
  mode: ConnectionMode;
  onChange: (next: ConnectionMode) => void;
}) {
  const choose = (next: ConnectionMode) => {
    if (next === mode) return;
    // Memory is not moved between the two, so switching hides what the other
    // side holds. Said before, not discovered afterwards.
    Alert.alert(
      `${LABEL[next]}に切り替えますか？`,
      `判断・Journal・話題の保存先が変わります。${LABEL[mode]}で保存したものは、切り替えている間は表示されません（消えはしません）。`,
      [
        { text: 'やめる', style: 'cancel' },
        { text: '切り替える', onPress: () => onChange(next) },
      ],
    );
  };

  return (
    <View style={styles.section}>
      <Text style={styles.title}>接続方法</Text>
      <View style={styles.segment} accessibilityRole="radiogroup">
        {(['server', 'direct'] as const).map((option) => {
          const selected = option === mode;
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => choose(option)}
              style={[styles.option, selected && styles.optionSelected]}
            >
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{LABEL[option]}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.now}>{NOW[mode]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.ivory,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  title: { fontSize: 15, fontWeight: '600', color: colors.charcoal },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.cream,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 3,
  },
  option: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  optionSelected: { backgroundColor: colors.charcoal },
  optionText: { fontSize: 14, color: colors.charcoalSoft },
  optionTextSelected: { color: colors.ivory, fontWeight: '600' },
  now: { fontSize: 13, lineHeight: 19, color: colors.charcoalSoft },
});

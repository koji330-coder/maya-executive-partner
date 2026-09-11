import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { ScreenContainer } from '@/components/ScreenContainer';
import { colors, spacing } from '@/theme';

/** Decisions screen — docs/UX_SPEC.md §6. Populated in Phase 2 and Phase 5. */
export default function DecisionsScreen() {
  return (
    <ScreenContainer scroll>
      <View style={styles.header}>
        <Text style={styles.title}>判断の記録</Text>
        <Text style={styles.subtitle}>
          MAYAとの会話から抽出した判断が、日付・理由・状態つきで残ります。
        </Text>
      </View>
      <EmptyState
        title="まだ記録がありません"
        body="会話の中で判断が検出されると、その場でカードとして保存できるようになります。"
        phase="Phase 5"
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.charcoal,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.charcoalSoft,
  },
});

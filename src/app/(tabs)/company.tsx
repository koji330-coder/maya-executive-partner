import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { ScreenContainer } from '@/components/ScreenContainer';
import { colors, spacing } from '@/theme';

/** Company Brain — docs/UX_SPEC.md §7. The user must be able to see what MAYA knows. */
export default function CompanyScreen() {
  return (
    <ScreenContainer scroll>
      <View style={styles.header}>
        <Text style={styles.title}>会社のこと</Text>
        <Text style={styles.subtitle}>
          MAYAが覚えている会社の事実は、すべてここで確認・修正できます。
        </Text>
      </View>
      <EmptyState
        title="会社プロフィール未登録"
        body="業種・従業員数・売上レンジ・経営目標・いま抱えている課題を登録すると、MAYAの回答がその前提で変わります。"
        phase="Phase 4"
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

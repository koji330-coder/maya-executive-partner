import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenContainer } from '@/components/ScreenContainer';
import {
  MOCK_DECISIONS,
  STATUS_LABEL,
  type DecisionRecord,
} from '@/features/decisions/mockDecisions';
import { colors, radius, spacing } from '@/theme';

/**
 * Decisions screen — docs/UX_SPEC.md §6.
 *
 * Phase 2 renders mocked records shaped like the `decisions` table. Phase 5
 * replaces the source with a repository and leaves this layout alone.
 */
export default function DecisionsScreen() {
  return (
    <ScreenContainer scroll>
      <View style={styles.header}>
        <Text style={styles.title}>判断の記録</Text>
        <Text style={styles.subtitle}>
          MAYAとの会話から抽出した判断が、日付・理由・状態つきで残ります。
        </Text>
      </View>
      <View style={styles.list}>
        {MOCK_DECISIONS.map((decision) => (
          <DecisionCard key={decision.id} decision={decision} />
        ))}
      </View>
      <Text style={styles.note}>
        いまは見本のデータです。会話から保存できるようになるのは Phase 5 です。
      </Text>
    </ScreenContainer>
  );
}

function DecisionCard({ decision }: { decision: DecisionRecord }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.date}>{decision.createdAt}</Text>
        <View style={[styles.pill, styles[decision.status]]}>
          <Text style={[styles.pillText, styles[`${decision.status}Text`]]}>
            {STATUS_LABEL[decision.status]}
          </Text>
        </View>
      </View>
      <Text style={styles.cardTitle}>{decision.title}</Text>
      <Text style={styles.reason}>{decision.reason}</Text>
      {decision.followUpDate ? (
        <Text style={styles.followUp}>見直し予定 {decision.followUpDate}</Text>
      ) : null}
    </View>
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
  list: {
    gap: spacing.sm + 2,
  },
  card: {
    backgroundColor: colors.ivory,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  date: {
    fontSize: 12,
    color: colors.muted,
  },
  pill: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  active: { backgroundColor: '#E7EDE4' },
  activeText: { color: '#44603F' },
  reconsider: { backgroundColor: '#F5E3DC' },
  reconsiderText: { color: '#8E4630' },
  completed: { backgroundColor: colors.sand },
  completedText: { color: colors.muted },
  cardTitle: {
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '700',
    color: colors.charcoal,
  },
  reason: {
    fontSize: 13,
    lineHeight: 21,
    color: colors.charcoalSoft,
  },
  followUp: {
    fontSize: 12,
    color: colors.muted,
  },
  note: {
    marginTop: spacing.md,
    fontSize: 12,
    lineHeight: 19,
    color: colors.muted,
  },
});

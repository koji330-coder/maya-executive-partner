import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { ScreenContainer } from '@/components/ScreenContainer';
import {
  listDecisions,
  setActionStatus,
  setDecisionStatus,
} from '@/features/decisions/decisionRepository';
import {
  STATUS_LABEL,
  type DecisionRecord,
  type DecisionStatus,
} from '@/features/decisions/types';
import { colors, radius, spacing } from '@/theme';

/**
 * Decisions screen — docs/UX_SPEC.md §6.
 *
 * Reads what was saved from conversations. Changing a status here changes what
 * MAYA remembers: completed decisions drop out of her prompt, and ones marked
 * for reconsideration invite her to reopen them.
 */
export default function DecisionsScreen() {
  const [decisions, setDecisions] = React.useState<DecisionRecord[] | null>(null);

  const reload = React.useCallback(() => {
    void listDecisions().then(setDecisions);
  }, []);

  // On focus, not on mount: the usual way here is saving a decision in the chat
  // and then switching over, and a mount-only load would show the list from
  // before that save.
  useFocusEffect(reload);

  const changeStatus = React.useCallback(
    (id: string, status: DecisionStatus) => {
      void setDecisionStatus(id, status).then(reload);
    },
    [reload],
  );

  const toggleAction = React.useCallback(
    (id: string, done: boolean) => {
      void setActionStatus(id, done ? 'done' : 'open').then(reload);
    },
    [reload],
  );

  return (
    <ScreenContainer scroll>
      <View style={styles.header}>
        <Text style={styles.title}>判断の記録</Text>
        <Text style={styles.subtitle}>
          相談の中で決めたことです。MAYAはここにある判断を覚えていて、矛盾する相談をすると指摘します。
        </Text>
      </View>

      {decisions === null ? null : decisions.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>まだ記録された判断はありません</Text>
          <Text style={styles.emptyBody}>
            相談の中でMAYAが判断を見つけると、返答の下に「判断として保存」が出ます。
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {decisions.map((decision) => (
            <DecisionCard
              key={decision.id}
              decision={decision}
              onStatus={changeStatus}
              onToggleAction={toggleAction}
            />
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}

const STATUS_ORDER: DecisionStatus[] = ['active', 'reconsider', 'completed'];

function DecisionCard({
  decision,
  onStatus,
  onToggleAction,
}: {
  decision: DecisionRecord;
  onStatus: (id: string, status: DecisionStatus) => void;
  onToggleAction: (id: string, done: boolean) => void;
}) {
  const action = decision.action;
  const actionDone = action?.status === 'done';

  return (
    <View style={styles.card}>
      <Text style={styles.date}>{formatDate(decision.createdAt)}</Text>
      <Text style={styles.cardTitle}>{decision.title}</Text>
      {decision.reason ? <Text style={styles.reason}>{decision.reason}</Text> : null}

      {action ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: actionDone }}
          accessibilityLabel={`次の一手、${action.title}`}
          onPress={() => onToggleAction(action.id, !actionDone)}
          style={styles.action}
        >
          <Ionicons
            name={actionDone ? 'checkbox' : 'square-outline'}
            size={18}
            color={actionDone ? colors.muted : colors.gold}
          />
          <View style={styles.actionText}>
            <Text style={[styles.actionTitle, actionDone && styles.actionTitleDone]}>
              {action.title}
            </Text>
            {action.dueDate ? (
              <Text style={styles.actionDue}>期限 {action.dueDate}</Text>
            ) : null}
          </View>
        </Pressable>
      ) : null}

      {/* All three shown, the current one filled. A menu would hide that
          "reconsider" exists, and that is the status that brings a decision
          back into the conversation. */}
      <View style={styles.statuses}>
        {STATUS_ORDER.map((status) => {
          const current = decision.status === status;
          return (
            <Pressable
              key={status}
              accessibilityRole="radio"
              accessibilityState={{ selected: current }}
              onPress={() => onStatus(decision.id, status)}
              style={[styles.pill, current ? styles[status] : styles.pillIdle]}
            >
              <Text style={[styles.pillText, current ? styles[`${status}Text`] : styles.pillTextIdle]}>
                {STATUS_LABEL[status]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
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
  empty: {
    paddingVertical: spacing.lg,
    gap: spacing.xs,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.charcoal,
  },
  emptyBody: {
    fontSize: 13,
    lineHeight: 20,
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
  date: {
    fontSize: 12,
    color: colors.muted,
  },
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
  action: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.xs,
    paddingVertical: spacing.xs,
  },
  actionText: {
    flex: 1,
    gap: 2,
  },
  actionTitle: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.charcoal,
  },
  actionTitleDone: {
    color: colors.muted,
    textDecorationLine: 'line-through',
  },
  actionDue: {
    fontSize: 12,
    color: colors.muted,
  },
  statuses: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  pill: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  pillIdle: {
    borderWidth: 1,
    borderColor: colors.line,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  pillTextIdle: {
    color: colors.muted,
    fontWeight: '500',
  },
  active: { backgroundColor: '#E7EDE4' },
  activeText: { color: '#44603F' },
  reconsider: { backgroundColor: '#F5E3DC' },
  reconsiderText: { color: '#8E4630' },
  completed: { backgroundColor: colors.sand },
  completedText: { color: colors.muted },
});

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';

import type { MayaTurn } from './useConversation';

export interface MayaAnswerProps {
  turn: MayaTurn;
  onSaveDecision: (turnId: string) => void;
}

/**
 * MAYA's reply, laid out the way docs/UX_SPEC.md §3 asks for it: the statement
 * carries the weight, reasoning sits under it, options are a short list with one
 * recommended, and the next action is separated out. Deliberately not a stack of
 * chat bubbles.
 */
export function MayaAnswer({ turn, onSaveDecision }: MayaAnswerProps) {
  const { response } = turn;
  // The first sentence is the position; the rest is why.
  const [statement, ...rest] = splitStatement(response.message);
  const reasoning = rest.join('');

  return (
    <View style={styles.root}>
      <Text style={styles.who}>MAYA</Text>
      <Text style={styles.statement}>{statement}</Text>
      {reasoning ? <Text style={styles.reasoning}>{reasoning}</Text> : null}

      {response.options ? (
        <View style={styles.options}>
          {response.options.map((option, index) => (
            <View key={option.label} style={styles.option}>
              <Text style={[styles.optionKey, option.recommended && styles.optionKeyPicked]}>
                {String.fromCharCode(65 + index)}
              </Text>
              <Text style={[styles.optionText, option.recommended && styles.optionTextPicked]}>
                {option.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {response.nextAction?.detected && response.nextAction.title ? (
        <View style={styles.action}>
          <Text style={styles.actionKey}>NEXT ACTION</Text>
          <Text style={styles.actionValue}>{response.nextAction.title}</Text>
        </View>
      ) : null}

      {response.decision?.detected && response.decision.title ? (
        <View style={styles.decision}>
          <Text style={styles.decisionKey}>判断として検出</Text>
          <Text style={styles.decisionTitle}>{response.decision.title}</Text>
          {response.decision.reason ? (
            <Text style={styles.decisionReason}>{response.decision.reason}</Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={turn.decisionSaved}
            onPress={() => onSaveDecision(turn.id)}
            style={[styles.save, turn.decisionSaved && styles.saveDone]}
          >
            <Text style={[styles.saveText, turn.decisionSaved && styles.saveTextDone]}>
              {turn.decisionSaved ? '保存しました' : '判断として保存'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {response.followUpQuestion ? (
        <Text style={styles.followUp}>{response.followUpQuestion}</Text>
      ) : null}

      {__DEV__ && turn.warnings.length > 0 ? (
        <View style={styles.warnings}>
          <Text style={styles.warningKey}>検証で修復した点（開発時のみ表示）</Text>
          {turn.warnings.map((warning) => (
            <Text key={warning} style={styles.warningText}>
              ・{warning}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Splits off the opening sentence so it can carry the visual weight. */
function splitStatement(message: string): [string, ...string[]] {
  const match = message.match(/^[\s\S]*?。/);
  if (!match || match[0].length === message.length) {
    return [message];
  }
  return [match[0], message.slice(match[0].length).trim()];
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm + 2,
  },
  who: {
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.gold,
    fontWeight: '700',
  },
  statement: {
    fontSize: 19,
    lineHeight: 29,
    fontWeight: '700',
    color: colors.charcoal,
  },
  reasoning: {
    fontSize: 14,
    lineHeight: 23,
    color: colors.charcoalSoft,
  },
  options: {
    gap: spacing.xs + 1,
  },
  option: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  optionKey: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    width: 14,
  },
  optionKeyPicked: {
    color: colors.gold,
  },
  optionText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 22,
    color: colors.charcoalSoft,
  },
  optionTextPicked: {
    color: colors.charcoal,
    fontWeight: '600',
  },
  action: {
    borderLeftWidth: 2,
    borderLeftColor: colors.gold,
    paddingLeft: spacing.sm + 2,
    gap: 2,
  },
  actionKey: {
    fontSize: 10,
    letterSpacing: 1.1,
    color: colors.muted,
    fontWeight: '600',
  },
  actionValue: {
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '600',
    color: colors.charcoal,
  },
  decision: {
    backgroundColor: colors.ivory,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  decisionKey: {
    fontSize: 10,
    letterSpacing: 1.1,
    color: colors.gold,
    fontWeight: '700',
  },
  decisionTitle: {
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '700',
    color: colors.charcoal,
  },
  decisionReason: {
    fontSize: 13,
    lineHeight: 21,
    color: colors.charcoalSoft,
  },
  save: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
    borderRadius: radius.pill,
    backgroundColor: colors.charcoal,
  },
  saveDone: {
    backgroundColor: colors.sand,
  },
  saveText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ivory,
  },
  saveTextDone: {
    color: colors.muted,
  },
  followUp: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.charcoalSoft,
    fontStyle: 'italic',
  },
  warnings: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.sm,
    gap: 2,
  },
  warningKey: {
    fontSize: 10,
    letterSpacing: 0.8,
    color: colors.danger,
    fontWeight: '700',
  },
  warningText: {
    fontSize: 11,
    lineHeight: 17,
    color: colors.muted,
  },
});

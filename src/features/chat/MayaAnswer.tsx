import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';

import { copyText, splitCodeBlocks, type CopyOutcome } from './copyText';
import type { MayaResponse } from './mayaResponse';
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
  const segments = splitCodeBlocks(response.message);
  const firstText = segments.findIndex((segment) => segment.kind === 'text');

  return (
    <View style={styles.root}>
      <Text style={styles.who}>MAYA</Text>
      {segments.map((segment, index) => {
        if (segment.kind === 'code') {
          return <CodeBlock key={index} code={segment.text} language={segment.language} />;
        }
        if (index !== firstText) {
          return (
            <Text key={index} selectable style={styles.reasoning}>
              {segment.text}
            </Text>
          );
        }
        // The first sentence is the position; the rest is why.
        const [statement, ...rest] = splitStatement(segment.text);
        const reasoning = rest.join('');
        return (
          <React.Fragment key={index}>
            <Text selectable style={styles.statement}>
              {statement}
            </Text>
            {reasoning ? (
              <Text selectable style={styles.reasoning}>
                {reasoning}
              </Text>
            ) : null}
          </React.Fragment>
        );
      })}

      {response.options ? (
        <View style={styles.options}>
          {response.options.map((option, index) => (
            <View key={option.label} style={styles.option}>
              <Text style={[styles.optionKey, option.recommended && styles.optionKeyPicked]}>
                {String.fromCharCode(65 + index)}
              </Text>
              <Text selectable style={[styles.optionText, option.recommended && styles.optionTextPicked]}>
                {option.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {response.nextAction?.detected && response.nextAction.title ? (
        <View style={styles.action}>
          <Text style={styles.actionKey}>NEXT ACTION</Text>
          <Text selectable style={styles.actionValue}>
            {response.nextAction.title}
          </Text>
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
        <Text selectable style={styles.followUp}>
          {response.followUpQuestion}
        </Text>
      ) : null}

      <CopyButton text={answerText(response)} label="全文をコピー" />

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

/**
 * The reply as plain text, the way it reads on screen: the message as written
 * (markdown and code fences intact, so it pastes into a document unchanged),
 * then the options, the next action and the question.
 */
export function answerText(response: MayaResponse): string {
  const parts = [response.message.trim()];
  if (response.options?.length) {
    parts.push(
      response.options
        .map((option, index) => `${String.fromCharCode(65 + index)}. ${option.label}${option.recommended ? '（推奨）' : ''}`)
        .join('\n'),
    );
  }
  if (response.nextAction?.detected && response.nextAction.title) parts.push(`NEXT ACTION: ${response.nextAction.title}`);
  if (response.followUpQuestion) parts.push(response.followUpQuestion);
  return parts.join('\n\n');
}

const OUTCOME_LABEL: Record<CopyOutcome, string> = {
  copied: 'コピーしました',
  shared: '共有メニューを開きました',
  failed: 'コピーできませんでした',
};

function CopyButton({ text, label }: { text: string; label: string }) {
  const [outcome, setOutcome] = useState<CopyOutcome | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const press = async () => {
    const result = await copyText(text);
    setOutcome(result);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOutcome(null), 1800);
  };

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={press} hitSlop={8} style={styles.copy}>
      <Text style={[styles.copyText, outcome === 'copied' && styles.copyTextDone]}>
        {outcome ? OUTCOME_LABEL[outcome] : label}
      </Text>
    </Pressable>
  );
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  return (
    <View style={styles.code}>
      <View style={styles.codeHead}>
        <Text style={styles.codeLanguage}>{language || 'code'}</Text>
        <CopyButton text={code} label="コピー" />
      </View>
      <Text selectable style={styles.codeText}>
        {code}
      </Text>
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
  copy: {
    alignSelf: 'flex-end',
    paddingVertical: 2,
  },
  copyText: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '600',
  },
  copyTextDone: {
    color: colors.gold,
  },
  code: {
    backgroundColor: colors.ivory,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  codeHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  codeLanguage: {
    fontSize: 10,
    letterSpacing: 1.1,
    color: colors.muted,
    fontWeight: '700',
  },
  codeText: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 12,
    lineHeight: 18,
    color: colors.charcoal,
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

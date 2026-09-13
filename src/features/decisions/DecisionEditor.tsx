import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors, radius, spacing } from '@/theme';

import { validateDraft, type DecisionDraft, type DraftProblem } from './types';

const PROBLEM_TEXT: Record<DraftProblem, string> = {
  no_title: '何を決めたかを書いてください。',
  bad_date: '期限は 2026-09-30 の形で書くか、空けてください。',
};

export interface DecisionEditorProps {
  /** The draft to start from, or null when the editor is closed. */
  initial: DecisionDraft | null;
  saving: boolean;
  onCancel: () => void;
  onSave: (draft: DecisionDraft) => void;
}

/**
 * Confirms a detected decision before it is stored.
 *
 * `docs/UX_SPEC.md` asks that extracted decisions be correctable. The model's
 * wording is usually close, so the fields arrive filled; what the president is
 * asked to do is check, not write.
 */
export function DecisionEditor({ initial, saving, onCancel, onSave }: DecisionEditorProps) {
  return (
    <Modal
      visible={initial !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      {/* Keyed so reopening for a different reply starts from that reply's draft
          instead of whatever was typed last time. */}
      {initial ? (
        <EditorBody
          key={`${initial.title}|${initial.actionTitle}`}
          initial={initial}
          saving={saving}
          onCancel={onCancel}
          onSave={onSave}
        />
      ) : null}
    </Modal>
  );
}

function EditorBody({
  initial,
  saving,
  onCancel,
  onSave,
}: {
  initial: DecisionDraft;
  saving: boolean;
  onCancel: () => void;
  onSave: (draft: DecisionDraft) => void;
}) {
  const [draft, setDraft] = React.useState(initial);
  const [tried, setTried] = React.useState(false);
  const problem = validateDraft(draft);

  const update = (field: keyof DecisionDraft) => (value: string) =>
    setDraft((current) => ({ ...current, [field]: value }));

  const submit = () => {
    setTried(true);
    if (!problem) {
      onSave(draft);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" onPress={onCancel} hitSlop={10}>
          <Text style={styles.cancel}>やめる</Text>
        </Pressable>
        <Text style={styles.barTitle}>判断を記録する</Text>
        <Pressable
          accessibilityRole="button"
          onPress={submit}
          disabled={saving}
          hitSlop={10}
        >
          <Text style={[styles.save, saving && styles.saveBusy]}>
            {saving ? '保存中…' : '保存'}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.lede}>
          MAYAが見つけた判断です。言い回しが違えば直してください。ここに残した判断を、MAYAは次の相談から覚えています。
        </Text>

        <Field label="決めたこと">
          <TextInput
            value={draft.title}
            onChangeText={update('title')}
            style={styles.input}
            multiline
            placeholder="例: 競合の値下げには追随しない"
            placeholderTextColor={colors.muted}
          />
        </Field>

        <Field label="理由">
          <TextInput
            value={draft.reason}
            onChangeText={update('reason')}
            style={[styles.input, styles.inputTall]}
            multiline
            placeholder="なぜそう決めたか。あとで見直すときの手がかりになります"
            placeholderTextColor={colors.muted}
          />
        </Field>

        <Field label="次の一手">
          <TextInput
            value={draft.actionTitle}
            onChangeText={update('actionTitle')}
            style={styles.input}
            multiline
            placeholder="例: 主要3社に価格据え置きを伝える"
            placeholderTextColor={colors.muted}
          />
        </Field>

        <Field label="期限">
          <TextInput
            value={draft.dueDate}
            onChangeText={update('dueDate')}
            style={styles.input}
            placeholder="2026-09-30"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
          />
        </Field>

        {tried && problem ? <Text style={styles.problem}>{PROBLEM_TEXT[problem]}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.ivory,
  },
  barTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.charcoal,
  },
  cancel: {
    fontSize: 15,
    color: colors.charcoalSoft,
  },
  save: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.gold,
  },
  saveBusy: {
    color: colors.muted,
  },
  body: {
    padding: spacing.md,
    gap: spacing.md,
  },
  lede: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.charcoalSoft,
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.charcoalSoft,
  },
  input: {
    backgroundColor: colors.ivory,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    lineHeight: 22,
    color: colors.charcoal,
  },
  inputTall: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  problem: {
    fontSize: 13,
    color: '#8E4630',
  },
});

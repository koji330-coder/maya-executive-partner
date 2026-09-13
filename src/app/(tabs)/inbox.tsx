import React from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { ScreenContainer } from '@/components/ScreenContainer';
import {
  findSameJournal,
  InboxError,
  listJournals,
  listTopics,
  saveJournal,
  saveTopic,
  setJournalVerdict,
  type StoredJournal,
  type StoredTopic,
} from '@/features/inbox/inboxRepository';
import {
  formatJournal,
  parseJournal,
  type AiVerdict,
  type JournalEntry,
  type ParseResult,
} from '@/features/inbox/journal';
import { colors, radius, spacing } from '@/theme';

type Mode = 'journal' | 'topic';

const VERDICT_LABEL: Record<AiVerdict, string> = {
  accepted: '受け入れる',
  rejected: '却下',
  undecided: 'あとで',
};

/**
 * The inbox: journal entries and topics brought in from outside MAYA.
 *
 * A journal skill writes its entry into a chat and stops there. Paste it here,
 * and MAYA repairs the form the chat broke, shows what it read, asks about the
 * AI's interpretation, and stores it. The wording is never rewritten.
 */
export default function InboxScreen() {
  const [mode, setMode] = React.useState<Mode>('journal');

  return (
    <ScreenContainer scroll>
      <Text style={styles.title}>受け箱</Text>
      <Text style={styles.lede}>
        外で書いたものを MAYA に渡す場所です。Journal はチャットからそのまま貼れば、崩れた形を MAYA が整えます。
      </Text>

      <View style={styles.segment}>
        {(['journal', 'topic'] as const).map((value) => (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === value }}
            onPress={() => setMode(value)}
            style={[styles.segmentItem, mode === value && styles.segmentItemOn]}
          >
            <Text style={[styles.segmentText, mode === value && styles.segmentTextOn]}>
              {value === 'journal' ? 'Journal' : '話題'}
            </Text>
          </Pressable>
        ))}
      </View>

      {mode === 'journal' ? <JournalInbox /> : <TopicInbox />}
    </ScreenContainer>
  );
}

function JournalInbox() {
  const [pasted, setPasted] = React.useState('');
  const [parsed, setParsed] = React.useState<ParseResult | null>(null);
  const [entry, setEntry] = React.useState<JournalEntry | null>(null);
  const [showClean, setShowClean] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState<StoredJournal[]>([]);

  const reload = React.useCallback(() => {
    void listJournals().then(setSaved);
  }, []);
  useFocusEffect(reload);

  const read = () => {
    const result = parseJournal(pasted);
    setParsed(result);
    setEntry(result.entry);
    setShowClean(false);
  };

  const reset = () => {
    setPasted('');
    setParsed(null);
    setEntry(null);
  };

  const store = async () => {
    if (!entry) return;
    setSaving(true);
    try {
      const existing = await findSameJournal(entry.date, entry.topic);
      if (existing) {
        const proceed = await new Promise<boolean>((resolve) =>
          Alert.alert('同じ日付と題の Journal があります', 'それでも保存しますか？', [
            { text: 'やめる', style: 'cancel', onPress: () => resolve(false) },
            { text: '保存する', onPress: () => resolve(true) },
          ]),
        );
        if (!proceed) return;
      }
      await saveJournal(entry, pasted);
      reset();
      reload();
    } catch (error) {
      Alert.alert(
        '保存できませんでした',
        error instanceof InboxError ? error.message : 'もう一度保存を押してください。',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.section}>
      {!entry ? (
        <>
          <TextInput
            value={pasted}
            onChangeText={setPasted}
            multiline
            style={[styles.input, styles.paste]}
            placeholder="スキルが出力した Journal を、--- から Notes までそのまま貼ってください"
            placeholderTextColor={colors.muted}
            autoCorrect={false}
            autoCapitalize="none"
          />
          <Pressable
            accessibilityRole="button"
            disabled={!pasted.trim()}
            onPress={read}
            style={[styles.primary, !pasted.trim() && styles.primaryOff]}
          >
            <Text style={styles.primaryText}>読み込む</Text>
          </Pressable>
        </>
      ) : (
        <JournalReview
          entry={entry}
          problems={parsed?.problems ?? []}
          showClean={showClean}
          saving={saving}
          onToggleClean={() => setShowClean((v) => !v)}
          onVerdict={(verdict) => setEntry({ ...entry, aiVerdict: verdict })}
          onReason={(reason) => setEntry({ ...entry, aiReason: reason })}
          onCancel={reset}
          onSave={() => void store()}
        />
      )}

      <Text style={styles.listTitle}>保存した Journal</Text>
      {saved.length === 0 ? (
        <Text style={styles.empty}>まだありません。</Text>
      ) : (
        saved.map((item) => (
          <SavedJournal key={item.id} item={item} onChanged={reload} />
        ))
      )}
    </View>
  );
}

function JournalReview({
  entry,
  problems,
  showClean,
  saving,
  onToggleClean,
  onVerdict,
  onReason,
  onCancel,
  onSave,
}: {
  entry: JournalEntry;
  problems: string[];
  showClean: boolean;
  saving: boolean;
  onToggleClean: () => void;
  onVerdict: (verdict: AiVerdict) => void;
  onReason: (reason: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const isPrivate = entry.sensitivity === 'private';
  const counts: [string, number][] = [
    ['経緯', entry.context.length],
    ['動機', entry.motivation.length],
    ['決めたこと', entry.decisions.length],
    ['本人の見方', entry.userPerspective.length],
    ['コンテンツ案', entry.contentAngles.length],
  ];

  return (
    <View style={styles.card}>
      <Text style={styles.cardKey}>読み取った内容</Text>
      <Text style={styles.cardTitle}>{entry.topic || '（題なし）'}</Text>
      <Text style={styles.meta}>
        {entry.date || '日付なし'}・{entry.source || '出どころ不明'}・{entry.sensitivity ?? 'sensitivity なし'}
      </Text>
      {entry.relatedProjects.length > 0 ? (
        <Text style={styles.meta}>関連: {entry.relatedProjects.join('、')}</Text>
      ) : null}
      <Text style={styles.meta}>
        {counts.map(([label, n]) => `${label} ${n}`).join('・')}
        {entry.notes ? '・Notes あり' : ''}
      </Text>

      {problems.length > 0 ? (
        <View style={styles.problems}>
          {problems.map((problem) => (
            <Text key={problem} style={styles.problemText}>
              ・{problem}
            </Text>
          ))}
        </View>
      ) : (
        <Text style={styles.ok}>形の崩れは直せました。文面には手を加えていません。</Text>
      )}

      {isPrivate ? (
        <Text style={styles.problemText}>
          sensitivity が private です。記録にしない領域なので保存できません。
        </Text>
      ) : null}

      {entry.aiInterpretation ? (
        <View style={styles.ai}>
          <Text style={styles.cardKey}>AI の解釈</Text>
          <Text style={styles.aiText}>{entry.aiInterpretation}</Text>
          <Text style={styles.aiAsk}>この解釈を受け入れますか？</Text>
          <View style={styles.verdicts}>
            {(['accepted', 'rejected', 'undecided'] as const).map((verdict) => (
              <Pressable
                key={verdict}
                accessibilityRole="radio"
                accessibilityState={{ selected: entry.aiVerdict === verdict }}
                onPress={() => onVerdict(verdict)}
                style={[styles.pill, entry.aiVerdict === verdict && styles.pillOn]}
              >
                <Text style={[styles.pillText, entry.aiVerdict === verdict && styles.pillTextOn]}>
                  {VERDICT_LABEL[verdict]}
                </Text>
              </Pressable>
            ))}
          </View>
          {entry.aiVerdict !== 'undecided' ? (
            <TextInput
              value={entry.aiReason}
              onChangeText={onReason}
              style={styles.input}
              placeholder={entry.aiVerdict === 'rejected' ? 'どこが違うか（任意）' : '理由（任意）'}
              placeholderTextColor={colors.muted}
            />
          ) : null}
        </View>
      ) : null}

      <Pressable accessibilityRole="button" onPress={onToggleClean} hitSlop={8}>
        <Text style={styles.link}>{showClean ? '整えた形を隠す' : '整えた形を見る'}</Text>
      </Pressable>
      {showClean ? <Text style={styles.code}>{formatJournal(entry)}</Text> : null}

      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={onCancel} style={styles.secondary}>
          <Text style={styles.secondaryText}>やめる</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={saving || isPrivate}
          onPress={onSave}
          style={[styles.primary, styles.flex, (saving || isPrivate) && styles.primaryOff]}
        >
          <Text style={styles.primaryText}>{saving ? '保存中…' : '保存する'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SavedJournal({ item, onChanged }: { item: StoredJournal; onChanged: () => void }) {
  const { entry } = item;

  const exportEntry = () => {
    // Out to wherever it is needed next: content-engine, a note, another chat.
    void Share.share({ message: formatJournal(entry) });
  };

  const decide = (verdict: AiVerdict) => {
    void setJournalVerdict(item.id, entry, verdict, entry.aiReason).then(onChanged);
  };

  return (
    <View style={styles.row}>
      <Text style={styles.rowTitle} numberOfLines={2}>
        {entry.topic}
      </Text>
      <Text style={styles.meta}>
        {entry.date}・{entry.source || '出どころ不明'}・{entry.sensitivity}
      </Text>
      {entry.aiInterpretation ? (
        <View style={styles.rowVerdict}>
          <Text style={styles.meta}>AI の解釈: </Text>
          {(['accepted', 'rejected', 'undecided'] as const).map((verdict) => (
            <Pressable
              key={verdict}
              accessibilityRole="radio"
              accessibilityState={{ selected: entry.aiVerdict === verdict }}
              onPress={() => decide(verdict)}
              hitSlop={6}
            >
              <Text style={[styles.meta, entry.aiVerdict === verdict && styles.verdictOn]}>
                {VERDICT_LABEL[verdict]}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Pressable accessibilityRole="button" onPress={exportEntry} hitSlop={8}>
        <Text style={styles.link}>整えた形で書き出す</Text>
      </Pressable>
    </View>
  );
}

function TopicInbox() {
  const [pasted, setPasted] = React.useState('');
  const [note, setNote] = React.useState('');
  const [topics, setTopics] = React.useState<StoredTopic[]>([]);

  const reload = React.useCallback(() => {
    void listTopics().then(setTopics);
  }, []);
  useFocusEffect(reload);

  const store = async () => {
    try {
      await saveTopic(pasted, note);
      setPasted('');
      setNote('');
      reload();
    } catch (error) {
      Alert.alert(
        '保存できませんでした',
        error instanceof InboxError ? error.message : 'もう一度保存を押してください。',
      );
    }
  };

  return (
    <View style={styles.section}>
      <TextInput
        value={pasted}
        onChangeText={setPasted}
        multiline
        style={[styles.input, styles.pasteShort]}
        placeholder="気になった投稿のリンクか本文"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
      />
      <TextInput
        value={note}
        onChangeText={setNote}
        style={styles.input}
        placeholder="ひとこと（任意）。なぜ気になったか"
        placeholderTextColor={colors.muted}
      />
      <Pressable
        accessibilityRole="button"
        disabled={!pasted.trim()}
        onPress={() => void store()}
        style={[styles.primary, !pasted.trim() && styles.primaryOff]}
      >
        <Text style={styles.primaryText}>貯める</Text>
      </Pressable>

      <Text style={styles.listTitle}>貯めた話題</Text>
      {topics.length === 0 ? (
        <Text style={styles.empty}>まだありません。</Text>
      ) : (
        topics.map((topic) => (
          <View key={topic.id} style={styles.row}>
            {topic.body ? (
              <Text style={styles.rowTitle} numberOfLines={3}>
                {topic.body}
              </Text>
            ) : null}
            {topic.url ? (
              <Text style={styles.meta} numberOfLines={1}>
                {topic.url}
              </Text>
            ) : null}
            {topic.note ? <Text style={styles.note}>「{topic.note}」</Text> : null}
            <Text style={styles.meta}>{topic.createdAt.slice(0, 10)}</Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '600', color: colors.charcoal },
  lede: { marginTop: spacing.xs, fontSize: 14, lineHeight: 21, color: colors.charcoalSoft },
  segment: {
    flexDirection: 'row',
    marginTop: spacing.md,
    backgroundColor: colors.sand,
    borderRadius: radius.pill,
    padding: 3,
  },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.pill },
  segmentItemOn: { backgroundColor: colors.ivory },
  segmentText: { fontSize: 14, color: colors.charcoalSoft },
  segmentTextOn: { color: colors.charcoal, fontWeight: '600' },
  section: { marginTop: spacing.md, gap: spacing.sm },
  input: {
    backgroundColor: colors.ivory,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    lineHeight: 20,
    color: colors.charcoal,
  },
  paste: { minHeight: 180, textAlignVertical: 'top' },
  pasteShort: { minHeight: 90, textAlignVertical: 'top' },
  primary: {
    alignItems: 'center',
    backgroundColor: colors.charcoal,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
  },
  primaryOff: { opacity: 0.35 },
  primaryText: { color: colors.ivory, fontSize: 15, fontWeight: '600' },
  secondary: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
  },
  secondaryText: { color: colors.charcoalSoft, fontSize: 15 },
  flex: { flex: 1 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  card: {
    backgroundColor: colors.ivory,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardKey: { fontSize: 11, fontWeight: '700', color: colors.gold, letterSpacing: 0.5 },
  cardTitle: { fontSize: 16, lineHeight: 23, fontWeight: '700', color: colors.charcoal },
  meta: { fontSize: 12, lineHeight: 18, color: colors.muted },
  problems: { marginTop: spacing.xs, gap: 2 },
  problemText: { fontSize: 13, lineHeight: 19, color: colors.danger },
  ok: { marginTop: spacing.xs, fontSize: 13, color: colors.success },
  ai: { marginTop: spacing.sm, gap: spacing.xs },
  aiText: { fontSize: 13, lineHeight: 20, color: colors.charcoalSoft },
  aiAsk: { fontSize: 13, fontWeight: '600', color: colors.charcoal, marginTop: spacing.xs },
  verdicts: { flexDirection: 'row', gap: spacing.xs },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pillOn: { backgroundColor: colors.charcoal, borderColor: colors.charcoal },
  pillText: { fontSize: 13, color: colors.charcoalSoft },
  pillTextOn: { color: colors.ivory, fontWeight: '600' },
  link: { fontSize: 13, color: colors.gold, marginTop: spacing.xs },
  code: {
    fontFamily: 'Menlo',
    fontSize: 11,
    lineHeight: 16,
    color: colors.charcoalSoft,
    backgroundColor: colors.cream,
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  listTitle: { marginTop: spacing.lg, fontSize: 15, fontWeight: '600', color: colors.charcoal },
  empty: { fontSize: 13, color: colors.charcoalSoft },
  row: {
    backgroundColor: colors.ivory,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 4,
  },
  rowTitle: { fontSize: 14, lineHeight: 21, fontWeight: '600', color: colors.charcoal },
  rowVerdict: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  verdictOn: { color: colors.charcoal, fontWeight: '700' },
  note: { fontSize: 13, lineHeight: 19, color: colors.charcoalSoft },
});

import React from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  CharacterStage,
  useCharacterRuntime,
  useReactionSpotlight,
} from '@/features/character';
import {
  AttachmentError,
  describeAttachment,
  MAX_ATTACHMENTS,
  pickImage,
  pickTextFile,
} from '@/features/chat/attachments';
import { ConversationSheet } from '@/features/chat/ConversationSheet';
import { MayaAnswer } from '@/features/chat/MayaAnswer';
import { useConversation } from '@/features/chat/useConversation';
import { useCompanyProfile } from '@/features/company/useCompanyProfile';
import { DecisionEditor } from '@/features/decisions/DecisionEditor';
import { draftFromResponse, type DecisionDraft } from '@/features/decisions/types';
import { errorText } from '@/services/api/errorText';
import { colors, radius, spacing } from '@/theme';

/**
 * Talk screen — docs/UX_SPEC.md §3.
 *
 * Phase 2 runs the whole consultation loop against scripted replies: send, the
 * character thinks, a validated `MayaResponse` arrives, and its fields move the
 * character and lay out the answer. Phase 3 swaps the responder for the backend.
 */
export default function TalkScreen() {
  const { height } = useWindowDimensions();
  // Seeded from a home-screen opener. It fills the draft rather than sending:
  // the president still gets to say what he actually means before it goes.
  const { seed } = useLocalSearchParams<{ seed?: string }>();
  const insets = useSafeAreaInsets();
  const runtime = useCharacterRuntime({ initialState: { scene: 'work' } });
  const company = useCompanyProfile();
  const conversation = useConversation({
    runtime,
    company: company.context,
    companyIsReal: company.profile.isRealCompany,
  });
  const scroller = React.useRef<ScrollView>(null);

  // Which reply's decision is being confirmed, and what it starts as.
  const [editing, setEditing] = React.useState<{ turnId: string; draft: DecisionDraft } | null>(
    null,
  );
  const [savingDecision, setSavingDecision] = React.useState(false);

  const openDecision = React.useCallback(
    (turnId: string) => {
      const turn = conversation.turns.find((t) => t.id === turnId);
      if (turn?.role === 'maya') {
        setEditing({ turnId, draft: draftFromResponse(turn.response) });
      }
    },
    [conversation.turns],
  );

  const confirmDecision = React.useCallback(
    (draft: DecisionDraft) => {
      if (!editing) {
        return;
      }
      setSavingDecision(true);
      conversation
        .saveDecision(editing.turnId, draft)
        .then(() => setEditing(null))
        // Left open on failure so what he corrected is not thrown away, and
        // said out loud, because a sheet that silently stays up reads as a
        // save button that does nothing.
        .catch((error: unknown) =>
          Alert.alert(
            '保存できませんでした',
            `${errorText(error, 'もう一度保存を押してください。')}直した内容はそのまま残っています。`,
          ),
        )
        .finally(() => setSavingDecision(false));
    },
    [conversation, editing],
  );

  // Once per arrival. Re-seeding on every render would fight the president's
  // own typing, and re-seeding on a back-navigation would overwrite a draft he
  // left behind.
  const seeded = React.useRef(false);
  React.useEffect(() => {
    if (seed && !seeded.current) {
      seeded.current = true;
      conversation.setDraft(seed);
    }
  }, [seed, conversation]);

  const [keyboardUp, setKeyboardUp] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);

  // The keyboard is the real constraint. On an 844pt screen the full stage
  // leaves about three lines of conversation once it is up, so the stage gives
  // way to it rather than the reader.
  React.useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardUp(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardUp(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // The mock has three resting sizes and one that only happens for a moment.
  // With the keyboard up she moves to a small portrait beside the transcript
  // instead of a full-width strip, which is what buys back the input room.
  const portrait = keyboardUp || collapsed;
  const base = portrait ? 'input' : 'chat';
  const [sheetOpen, setSheetOpen] = React.useState(false);
  // A reply loaded from storage has already had its moment.
  const fresh = conversation.latest && !conversation.latest.restored ? conversation.latest : null;
  const spotlight = useReactionSpotlight(fresh?.response ?? null, base, {
    // Never steal the screen while the president is mid-sentence.
    enabled: !keyboardUp,
  });
  const stageHeight = spotlight.active
    ? Math.round(height * 0.44)
    : portrait
      ? PORTRAIT_STAGE
      : Math.round(height * 0.32);
  const canSend =
    (conversation.draft.trim().length > 0 || conversation.attachments.length > 0) &&
    !conversation.waiting;

  const [attachError, setAttachError] = React.useState<string | null>(null);

  const attach = React.useCallback(
    async (pick: typeof pickImage) => {
      setAttachError(null);
      if (conversation.attachments.length >= MAX_ATTACHMENTS) {
        setAttachError(`添付は${MAX_ATTACHMENTS}件までです。`);
        return;
      }
      try {
        const attachment = await pick();
        if (attachment) {
          conversation.addAttachment(attachment);
        }
      } catch (error) {
        // The underlying message is shown. A generic failure cost a round trip
        // to find out that expo-file-system had changed its API.
        setAttachError(
          error instanceof AttachmentError
            ? error.message
            : `添付を読み込めませんでした。${error instanceof Error ? `（${error.message}）` : ''}`,
        );
      }
    },
    [conversation],
  );

  const toggleStage = React.useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsed((current) => !current);
  }, []);

  React.useEffect(() => {
    const id = setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(id);
  }, [conversation.latest, conversation.error]);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.bottom}
    >
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="会話の一覧"
          onPress={() => setSheetOpen(true)}
          hitSlop={10}
          style={styles.headerButton}
        >
          <Ionicons name="chatbubbles-outline" size={20} color={colors.charcoalSoft} />
        </Pressable>
        <Text style={styles.headerTitle}>MAYA</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="新しい会話を始める"
          onPress={conversation.startNewConversation}
          hitSlop={10}
          style={styles.headerButton}
        >
          <Ionicons name="create-outline" size={20} color={colors.charcoalSoft} />
        </Pressable>
      </View>

      <View style={portrait && !spotlight.active ? styles.portraitRow : undefined}>
        <CharacterStage
          runtime={runtime}
          height={stageHeight}
          presentation={spotlight.presentation}
          rounded={portrait && !spotlight.active ? radius.lg : undefined}
          style={portrait && !spotlight.active ? styles.portrait : undefined}
        />
        {spotlight.line ? (
          <View style={styles.bubble} pointerEvents="none">
            <Text style={styles.bubbleText}>{spotlight.line}</Text>
          </View>
        ) : null}
        {portrait && !spotlight.active ? (
          <Text style={styles.portraitHint} numberOfLines={2}>
            {conversation.waiting ? '考えています…' : '入力を待っています…'}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={portrait ? 'MAYAを大きく表示' : 'MAYAを小さく表示'}
          onPress={toggleStage}
          hitSlop={10}
          style={styles.stageToggle}
        >
          <Ionicons
            name={portrait ? 'chevron-down' : 'chevron-up'}
            size={16}
            color={colors.charcoalSoft}
          />
        </Pressable>
      </View>

      <ScrollView ref={scroller} style={styles.transcript} contentContainerStyle={styles.transcriptContent}>
        {conversation.turns.length === 0 ? (
          <View style={styles.opening}>
            <Text style={styles.openingText}>
              経営で迷っていることを書いてください。値下げ、採用、投資。決めきれていない話ほど向いています。
            </Text>
            {company.loaded && !company.filled ? (
              <Text style={styles.openingHint}>
                Companyタブに会社のことを書いておくと、その前提で答えます。
              </Text>
            ) : null}
          </View>
        ) : null}

        {conversation.turns.map((turn) =>
          turn.role === 'user' ? (
            <View key={turn.id} style={styles.userTurn}>
              <Text style={styles.userText}>{turn.text}</Text>
            </View>
          ) : (
            <MayaAnswer key={turn.id} turn={turn} onSaveDecision={openDecision} />
          ),
        )}

        {conversation.error ? (
          <View style={styles.error}>
            <Text style={styles.errorText}>{conversation.error}</Text>
            <View style={styles.errorActions}>
              <Pressable accessibilityRole="button" onPress={conversation.retry} style={styles.retry}>
                <Text style={styles.retryText}>もう一度送る</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={conversation.dismissError}>
                <Text style={styles.dismiss}>閉じる</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {conversation.waiting ? (
          <Pressable
            accessibilityRole="button"
            onPress={conversation.cancel}
            style={styles.cancel}
          >
            <Text style={styles.cancelText}>送信を取り消す</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {conversation.attachments.length > 0 || attachError ? (
        <View style={styles.attachTray}>
          {conversation.attachments.map((attachment) => (
            <Pressable
              key={attachment.id}
              accessibilityRole="button"
              accessibilityLabel={`${attachment.name} を外す`}
              onPress={() => conversation.removeAttachment(attachment.id)}
              style={styles.chip}
            >
              <Ionicons
                name={attachment.kind === 'image' ? 'image-outline' : 'document-text-outline'}
                size={14}
                color={colors.charcoalSoft}
              />
              <Text style={styles.chipText} numberOfLines={1}>
                {describeAttachment(attachment)}
              </Text>
              <Ionicons name="close" size={14} color={colors.muted} />
            </Pressable>
          ))}
          {attachError ? <Text style={styles.attachError}>{attachError}</Text> : null}
        </View>
      ) : null}

      <View style={styles.composer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="画像を添付"
          onPress={() => void attach(pickImage)}
          style={styles.attachButton}
        >
          <Ionicons name="image-outline" size={20} color={colors.charcoalSoft} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="ファイルを添付"
          onPress={() => void attach(pickTextFile)}
          style={styles.attachButton}
        >
          <Ionicons name="attach-outline" size={20} color={colors.charcoalSoft} />
        </Pressable>
        <TextInput
          style={styles.input}
          value={conversation.draft}
          onChangeText={conversation.setDraft}
          placeholder="相談したいことを書いてください"
          placeholderTextColor={colors.muted}
          multiline
          onFocus={() => runtime.machine.setListening()}
          onBlur={() => runtime.machine.setIdle()}
          onSubmitEditing={() => void conversation.send()}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="送信"
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={() => void conversation.send()}
          style={[styles.send, !canSend && styles.sendDisabled]}
        >
          <Ionicons name="arrow-up" size={20} color={colors.ivory} />
        </Pressable>
      </View>
      <ConversationSheet
        visible={sheetOpen}
        activeId={conversation.activeConversationId}
        onClose={() => setSheetOpen(false)}
        onNew={() => {
          conversation.startNewConversation();
          setSheetOpen(false);
        }}
        onOpen={(id) => {
          void conversation.openConversation(id).then(() => setSheetOpen(false));
        }}
      />
      <DecisionEditor
        initial={editing?.draft ?? null}
        saving={savingDecision}
        onCancel={() => setEditing(null)}
        onSave={confirmDecision}
      />
    </KeyboardAvoidingView>
  );
}

/** Tall enough for her face, short enough to leave ten lines with the keyboard up. */
const PORTRAIT_STAGE = 88;

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.ivory,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  headerButton: {
    width: 32,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 2,
    color: colors.charcoal,
  },
  // Keyboard up: she sits in a small rounded frame on the left, the way the
  // mock does it, instead of a full-width strip. Same height, far less width,
  // so the transcript beside her stays readable.
  portraitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
    backgroundColor: colors.ivory,
  },
  portrait: {
    width: PORTRAIT_STAGE,
    overflow: 'hidden',
  },
  portraitHint: {
    flex: 1,
    fontSize: 12,
    color: colors.charcoalSoft,
  },
  // Floats over her while she is enlarged. The full reply is in the transcript
  // below; this is the one line she would say out loud.
  bubble: {
    position: 'absolute',
    left: spacing.md,
    top: spacing.md,
    maxWidth: '62%',
    backgroundColor: colors.ivory,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.charcoal,
  },
  stageToggle: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.xs,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFFB8',
  },
  root: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  transcript: {
    flex: 1,
  },
  transcriptContent: {
    padding: spacing.md,
    gap: spacing.lg,
  },
  opening: {
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  openingHint: {
    fontSize: 13,
    lineHeight: 21,
    color: colors.gold,
  },
  openingText: {
    fontSize: 14,
    lineHeight: 23,
    color: colors.muted,
  },
  userTurn: {
    alignSelf: 'flex-end',
    maxWidth: '86%',
    backgroundColor: colors.sand,
    borderRadius: radius.lg,
    borderBottomRightRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  userText: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.charcoal,
  },
  cancel: {
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cancelText: {
    fontSize: 13,
    color: colors.muted,
  },
  error: {
    backgroundColor: colors.ivory,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  errorText: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.charcoal,
  },
  errorActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  retry: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
    borderRadius: radius.pill,
    backgroundColor: colors.charcoal,
  },
  retryText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ivory,
  },
  dismiss: {
    fontSize: 13,
    color: colors.muted,
  },
  attachTray: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    maxWidth: '100%',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.ivory,
  },
  chipText: {
    flexShrink: 1,
    fontSize: 12,
    color: colors.charcoalSoft,
  },
  attachError: {
    width: '100%',
    fontSize: 12,
    lineHeight: 18,
    color: colors.danger,
  },
  attachButton: {
    width: 36,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.ivory,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.cream,
    color: colors.charcoal,
    fontSize: 15,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.charcoal,
  },
  sendDisabled: {
    opacity: 0.35,
  },
});

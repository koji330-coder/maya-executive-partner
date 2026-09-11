import React from 'react';
import {
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CharacterStage, DevExpressionControls, useCharacterRuntime } from '@/features/character';
import {
  AttachmentError,
  describeAttachment,
  MAX_ATTACHMENTS,
  pickImage,
  pickTextFile,
} from '@/features/chat/attachments';
import { MayaAnswer } from '@/features/chat/MayaAnswer';
import { useConversation } from '@/features/chat/useConversation';
import { useCompanyProfile } from '@/features/company/useCompanyProfile';
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
  const insets = useSafeAreaInsets();
  const runtime = useCharacterRuntime({ initialState: { scene: 'work' } });
  const company = useCompanyProfile();
  const conversation = useConversation({
    runtime,
    company: company.context,
    companyIsReal: company.profile.isRealCompany,
  });
  const scroller = React.useRef<ScrollView>(null);

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

  const compact = keyboardUp || collapsed;
  const stageHeight = compact ? COMPACT_STAGE : Math.round(height * 0.35);
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
        setAttachError(
          error instanceof AttachmentError ? error.message : '添付を読み込めませんでした。',
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
      <View style={{ paddingTop: insets.top }}>
        <CharacterStage runtime={runtime} height={stageHeight} compact={compact} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={compact ? 'MAYAを大きく表示' : 'MAYAを小さく表示'}
          onPress={toggleStage}
          hitSlop={10}
          style={styles.stageToggle}
        >
          <Ionicons
            name={compact ? 'chevron-down' : 'chevron-up'}
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
            <MayaAnswer key={turn.id} turn={turn} onSaveDecision={conversation.saveDecision} />
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

        {__DEV__ ? <DevExpressionControls runtime={runtime} /> : null}
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
    </KeyboardAvoidingView>
  );
}

/** Tall enough for her face, short enough to leave ten lines with the keyboard up. */
const COMPACT_STAGE = 88;

const styles = StyleSheet.create({
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

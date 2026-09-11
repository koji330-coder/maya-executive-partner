import React from 'react';
import {
  KeyboardAvoidingView,
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
import { MayaAnswer } from '@/features/chat/MayaAnswer';
import { useConversation } from '@/features/chat/useConversation';
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
  const conversation = useConversation({ runtime });
  const scroller = React.useRef<ScrollView>(null);

  const stageHeight = Math.round(height * 0.35);
  const canSend = conversation.draft.trim().length > 0 && !conversation.waiting;

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
        <CharacterStage runtime={runtime} height={stageHeight} />
      </View>

      <ScrollView ref={scroller} style={styles.transcript} contentContainerStyle={styles.transcriptContent}>
        {conversation.turns.length === 0 ? (
          <View style={styles.opening}>
            <Text style={styles.openingText}>
              経営で迷っていることを書いてください。値下げ、採用、投資。決めきれていない話ほど向いています。
            </Text>
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

        {__DEV__ ? <DevExpressionControls runtime={runtime} /> : null}
      </ScrollView>

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={conversation.draft}
          onChangeText={conversation.setDraft}
          placeholder="相談したいことを書いてください"
          placeholderTextColor={colors.muted}
          multiline
          onFocus={() => runtime.machine.setListening()}
          onBlur={() => runtime.machine.setIdle()}
          onSubmitEditing={() => conversation.send()}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="送信"
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={() => conversation.send()}
          style={[styles.send, !canSend && styles.sendDisabled]}
        >
          <Ionicons name="arrow-up" size={20} color={colors.ivory} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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

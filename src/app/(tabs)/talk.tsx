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
import { colors, radius, spacing } from '@/theme';

/**
 * Talk screen — docs/UX_SPEC.md §3.
 *
 * Phase 1 ships the character stage and the composer shell. Sending is wired to
 * the mocked conversation loop in Phase 2, so the composer is present but
 * disabled rather than absent: the layout it has to live in is part of what
 * Phase 1 is proving.
 */
export default function TalkScreen() {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const runtime = useCharacterRuntime({ initialState: { scene: 'work' } });
  const [draft, setDraft] = React.useState('');

  const stageHeight = Math.round(height * 0.35);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.bottom}
    >
      <View style={{ paddingTop: insets.top }}>
        <CharacterStage runtime={runtime} height={stageHeight} />
      </View>

      <ScrollView style={styles.transcript} contentContainerStyle={styles.transcriptContent}>
        <View style={styles.mayaCard}>
          <Text style={styles.mayaLabel}>MAYA</Text>
          <Text style={styles.mayaText}>
            会話はPhase 2で有効になります。いまは表情・まばたき・呼吸・リップシンクの動きを確認してください。
          </Text>
        </View>

        {__DEV__ ? <DevExpressionControls runtime={runtime} /> : null}
      </ScrollView>

      <View style={[styles.composer, { paddingBottom: spacing.sm }]}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="相談したいことを書いてください"
          placeholderTextColor={colors.muted}
          multiline
          editable={false}
          onFocus={() => runtime.machine.setListening()}
          onBlur={() => runtime.machine.setIdle()}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="送信"
          accessibilityState={{ disabled: true }}
          disabled
          style={[styles.send, styles.sendDisabled]}
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
    gap: spacing.md,
  },
  mayaCard: {
    backgroundColor: colors.ivory,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    gap: spacing.xs,
  },
  mayaLabel: {
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.gold,
    fontWeight: '700',
  },
  mayaText: {
    fontSize: 15,
    lineHeight: 23,
    color: colors.charcoal,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
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

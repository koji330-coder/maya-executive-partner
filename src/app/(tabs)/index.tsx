import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { EmptyState } from '@/components/EmptyState';
import { ScreenContainer } from '@/components/ScreenContainer';
import { CharacterStage, useCharacterRuntime } from '@/features/character';
import { getTodayGreeting } from '@/features/today/greeting';
import { colors, radius, spacing } from '@/theme';

/** Today screen — docs/UX_SPEC.md §2. Makes MAYA present before any chat starts. */
export default function TodayScreen() {
  const router = useRouter();
  const greeting = useMemo(() => getTodayGreeting(), []);
  const runtime = useCharacterRuntime({
    initialState: { scene: greeting.scene, emotion: 'smile' },
  });

  const today = useMemo(
    () =>
      new Date().toLocaleDateString('ja-JP', {
        month: 'long',
        day: 'numeric',
        weekday: 'long',
      }),
    [],
  );

  return (
    <ScreenContainer scroll padded={false}>
      <View style={styles.header}>
        <Text style={styles.date}>{today}</Text>
        <Link href="/settings" asChild>
          <Pressable accessibilityRole="button" accessibilityLabel="設定" hitSlop={8}>
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.charcoalSoft} />
          </Pressable>
        </Link>
      </View>

      <CharacterStage runtime={runtime} height={320} showStatus={false} />

      <View style={styles.body}>
        <Text style={styles.greeting}>{greeting.greeting}</Text>
        <Text style={styles.prompt}>{greeting.prompt}</Text>

        <Pressable
          accessibilityRole="button"
          style={styles.cta}
          onPress={() => router.push('/talk')}
        >
          <Text style={styles.ctaText}>MAYAに相談する</Text>
          <Ionicons name="arrow-forward" size={18} color={colors.ivory} />
        </Pressable>

        <EmptyState
          title="未決の判断"
          body="保存した判断と次のアクションがここに並びます。まだ何も記録されていません。"
          phase="Phase 5"
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  date: {
    fontSize: 13,
    color: colors.muted,
  },
  body: {
    padding: spacing.md,
    gap: spacing.md,
  },
  greeting: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.charcoal,
  },
  prompt: {
    fontSize: 15,
    lineHeight: 23,
    color: colors.charcoalSoft,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.charcoal,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
  },
  ctaText: {
    color: colors.ivory,
    fontSize: 16,
    fontWeight: '600',
  },
});

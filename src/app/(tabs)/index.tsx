import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Link, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { EmptyState } from '@/components/EmptyState';
import { ScreenContainer } from '@/components/ScreenContainer';
import { CharacterStage, useCharacterRuntime } from '@/features/character';
import { getTodayGreeting } from '@/features/today/greeting';
import { colors, radius, spacing } from '@/theme';

/**
 * Quick ways in, from the screen mock.
 *
 * The point of putting these on the home screen is that a president opening the
 * app at 7am has not yet decided what to ask. A blank input asks him to; these
 * ask him to pick. Each one seeds the conversation rather than opening an empty
 * screen.
 *
 * UNDECIDED: the mock also shows スケジュール確認 and 資料の整理. Both need
 * capabilities `README.md` puts outside v0.1, so they are not here yet.
 */
const OPENERS: { label: string; icon: keyof typeof Ionicons.glyphMap; seed: string }[] = [
  { label: '相談する', icon: 'chatbubble-ellipses-outline', seed: '' },
  {
    label: '数字を見てほしい',
    icon: 'stats-chart-outline',
    seed: '今月の数字を見てほしい。',
  },
  {
    label: '決めきれていない話がある',
    icon: 'help-circle-outline',
    seed: '決めきれていないことがある。',
  },
  { label: '雑談する', icon: 'cafe-outline', seed: 'ちょっと雑談したい。' },
];

/** Today screen — docs/UX_SPEC.md §2. Makes MAYA present before any chat starts. */
export default function TodayScreen() {
  const router = useRouter();
  const { height } = useWindowDimensions();
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

      {/* The one screen that shows the whole figure. Everywhere else crops to
          her face, so this is where the room and the silhouette register. */}
      <CharacterStage
        runtime={runtime}
        height={Math.round(height * 0.52)}
        presentation="hero"
        showStatus={false}
      />

      <View style={styles.body}>
        <Text style={styles.greeting}>{greeting.greeting}</Text>
        <Text style={styles.prompt}>{greeting.prompt}</Text>

        <View style={styles.openers}>
          {OPENERS.map((opener) => (
            <Pressable
              key={opener.label}
              accessibilityRole="button"
              style={styles.opener}
              onPress={() =>
                router.push(opener.seed ? `/talk?seed=${encodeURIComponent(opener.seed)}` : '/talk')
              }
            >
              <Ionicons name={opener.icon} size={18} color={colors.gold} />
              <Text style={styles.openerText}>{opener.label}</Text>
            </Pressable>
          ))}
        </View>

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
  openers: {
    gap: spacing.sm,
  },
  opener: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.ivory,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
  openerText: {
    color: colors.charcoal,
    fontSize: 15,
    fontWeight: '500',
  },
});

import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { ScreenContainer } from '@/components/ScreenContainer';
import { exportTranscript } from '@/features/chat/conversationRepository';
import { colors, radius, spacing } from '@/theme';

/**
 * What a tool is doing right now.
 *
 * Shown on the tile rather than hidden behind a tap. A grid where half the
 * tiles quietly do nothing teaches the president to stop pressing them; a grid
 * that says which ones are real keeps the other half as a roadmap he can see.
 */
type Status = 'ready' | 'planned' | 'later';

interface Tool {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  status: Status;
  /** Why it is not here yet. Shown when a tile that is not ready is pressed. */
  note: string;
  run?: 'company' | 'decisions' | 'export';
}

/**
 * The tool grid from the screen mock.
 *
 * UNDECIDED: what each planned tile actually does. The mock draws eight tiles
 * without settling any of them, and that is fine for now — the grid is the
 * decision, the contents are not.
 *
 * The `later` ones are not undecided, though. `README.md` puts Gmail, Calendar,
 * Drive and finance document ingestion outside v0.1 deliberately, so they are
 * drawn as a roadmap rather than quietly dropped.
 */
const TOOLS: Tool[] = [
  {
    label: '会社のこと',
    icon: 'business-outline',
    status: 'ready',
    note: '',
    run: 'company',
  },
  {
    label: '判断の記録',
    icon: 'checkmark-done-outline',
    status: 'ready',
    note: '',
    run: 'decisions',
  },
  {
    label: '会話を書き出す',
    icon: 'download-outline',
    status: 'ready',
    note: '',
    run: 'export',
  },
  {
    label: 'CSVを読ませる',
    icon: 'grid-outline',
    status: 'planned',
    note: 'いまは相談画面の添付から渡せます。ここからまとめて読ませる形はこれからです。',
  },
  {
    label: '売上ダッシュボード',
    icon: 'stats-chart-outline',
    status: 'planned',
    note: '外部のダッシュボードへのリンクを置く場所です。リンク先をまだ決めていません。',
  },
  {
    label: '資料を要約する',
    icon: 'document-text-outline',
    status: 'planned',
    note: '長い資料を渡して要点だけ受け取る機能です。まだありません。',
  },
  {
    label: '会議の準備',
    icon: 'people-outline',
    status: 'planned',
    note: '論点と想定質問を先に出しておく機能です。まだありません。',
  },
  {
    label: 'Excelを取り込む',
    icon: 'calculator-outline',
    status: 'later',
    note: 'v0.1の対象外です。いまはCSVに書き出すか、画面のスクリーンショットを送ってください。',
  },
  {
    label: 'スケジュール',
    icon: 'calendar-outline',
    status: 'later',
    note: 'カレンダー連携はv0.1の対象外です。',
  },
  {
    label: 'メールを書く',
    icon: 'mail-outline',
    status: 'later',
    note: 'Gmail連携はv0.1の対象外です。',
  },
  {
    label: 'タスク管理',
    icon: 'list-outline',
    status: 'later',
    note: '次のアクションは判断の記録に残ります。独立したタスク管理はv0.1の対象外です。',
  },
];

const STATUS_LABEL: Record<Status, string | null> = {
  ready: null,
  planned: 'これから',
  later: 'v0.1の対象外',
};

/** Tools screen — the fifth screen of the mock. */
export default function ToolsScreen() {
  const router = useRouter();

  const press = React.useCallback(
    (tool: Tool) => {
      if (tool.status !== 'ready') {
        Alert.alert(tool.label, tool.note);
        return;
      }
      switch (tool.run) {
        case 'company':
          router.push('/company');
          return;
        case 'decisions':
          router.push('/decisions');
          return;
        case 'export':
          void exportTranscript().then((text) =>
            // Shown rather than shared: judging how MAYA actually sounds needs
            // the real exchange, and a share sheet is a Phase 6 concern.
            Alert.alert('会話の書き出し', text.slice(0, 1500)),
          );
          return;
        default:
          return;
      }
    },
    [router],
  );

  return (
    <ScreenContainer scroll>
      <Text style={styles.title}>ツール</Text>
      <Text style={styles.lede}>
        相談以外にできることです。灰色のものはまだ中身がありません。
      </Text>

      <View style={styles.grid}>
        {TOOLS.map((tool) => (
          <Pressable
            key={tool.label}
            accessibilityRole="button"
            accessibilityLabel={
              tool.status === 'ready' ? tool.label : `${tool.label}、${STATUS_LABEL[tool.status]}`
            }
            onPress={() => press(tool)}
            style={[styles.tile, tool.status !== 'ready' && styles.tileQuiet]}
          >
            <Ionicons
              name={tool.icon}
              size={22}
              color={tool.status === 'ready' ? colors.gold : colors.muted}
            />
            <Text style={[styles.tileText, tool.status !== 'ready' && styles.tileTextQuiet]}>
              {tool.label}
            </Text>
            {STATUS_LABEL[tool.status] ? (
              <Text style={styles.badge}>{STATUS_LABEL[tool.status]}</Text>
            ) : null}
          </Pressable>
        ))}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.charcoal,
  },
  lede: {
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    fontSize: 14,
    lineHeight: 21,
    color: colors.charcoalSoft,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tile: {
    // Three across on a phone, and they re-wrap rather than shrink past
    // readable on anything narrower.
    flexGrow: 1,
    flexBasis: '29%',
    minWidth: 96,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.ivory,
    borderRadius: radius.lg,
  },
  tileQuiet: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.line,
  },
  tileText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.charcoal,
    textAlign: 'center',
  },
  tileTextQuiet: {
    color: colors.charcoalSoft,
  },
  badge: {
    fontSize: 10,
    color: colors.muted,
  },
});

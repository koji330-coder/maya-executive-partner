import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { exportTranscript, listConversations } from '@/features/chat/conversationRepository';
import { ApiKeySection } from '@/features/settings/ApiKeySection';
import { apiBaseUrl, appEnv, isApiConfigured } from '@/services/api/config';
import { initializeDatabase, LATEST_SCHEMA_VERSION, type DatabaseStatus } from '@/services/storage';
import { colors, radius, spacing } from '@/theme';

/** Phase 1 settings screen: environment and local-storage diagnostics. */
export default function SettingsScreen() {
  const [status, setStatus] = useState<DatabaseStatus>({ state: 'idle' });
  const [conversationCount, setConversationCount] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    initializeDatabase().then((next) => {
      if (!cancelled) {
        setStatus(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const conversations = await listConversations(100);
      if (!cancelled) {
        setConversationCount(conversations.length);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onExport = async () => {
    setExporting(true);
    try {
      const text = await exportTranscript();
      await Share.share({ message: text });
    } catch {
      /* the user dismissed the sheet, or there was nothing to send */
    } finally {
      setExporting(false);
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Section title="ローカル保存">
        <Row label="状態" value={describeStatus(status)} />
        <Row label="スキーマ" value={`v${LATEST_SCHEMA_VERSION}`} />
      </Section>

      <Section title="会話の記録">
        <Row
          label="保存された相談"
          value={conversationCount === null ? '読み込み中…' : `${conversationCount}件`}
        />
      </Section>
      <Pressable
        accessibilityRole="button"
        disabled={exporting || conversationCount === 0}
        onPress={() => void onExport()}
        style={[styles.export, (exporting || conversationCount === 0) && styles.exportDisabled]}
      >
        <Text style={styles.exportText}>
          {exporting ? '書き出しています…' : '会話を書き出して共有'}
        </Text>
      </Pressable>
      <Text style={styles.note}>
        MAYAの応答が狙いどおりか見直すために、会話の全文を書き出せます。表情とポーズも一緒に出ます。
      </Text>

      <ApiKeySection />

      <Section title="接続先">
        <Row label="環境" value={appEnv} />
        <Row label="自前バックエンド" value={isApiConfigured() ? apiBaseUrl : '未使用'} />
      </Section>

      <Text style={styles.note}>
        アプリにAPIキーは同梱していません。上で登録した利用者自身のキーを端末のキーチェーンから
        読み出し、Googleへ直接送っています。配布する場合はバックエンド経由へ変える必要があります。
      </Text>
    </ScrollView>
  );
}

function describeStatus(status: DatabaseStatus): string {
  switch (status.state) {
    case 'ready':
      return `初期化済み（v${status.version}）`;
    case 'unavailable':
      return `利用不可: ${status.reason}`;
    case 'error':
      return `エラー: ${status.reason}`;
    case 'idle':
      return '初期化中…';
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  content: {
    padding: spacing.md,
    gap: spacing.lg,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 12,
    letterSpacing: 1,
    color: colors.muted,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: colors.ivory,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  rowLabel: {
    fontSize: 14,
    color: colors.charcoalSoft,
  },
  rowValue: {
    flexShrink: 1,
    textAlign: 'right',
    fontSize: 14,
    color: colors.charcoal,
  },
  note: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.muted,
  },
  export: {
    alignItems: 'center',
    paddingVertical: spacing.sm + 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.ivory,
  },
  exportDisabled: { opacity: 0.4 },
  exportText: { fontSize: 14, fontWeight: '700', color: colors.charcoal },
});

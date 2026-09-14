import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { exportTranscript, listConversations } from '@/features/chat/conversationRepository';
import { ApiKeySection } from '@/features/settings/ApiKeySection';
import { ConnectionModeSection } from '@/features/settings/ConnectionModeSection';
import { ServerCostSection } from '@/features/settings/ServerCostSection';
import { ServerKeysSection } from '@/features/settings/ServerKeysSection';
import { ServerSection } from '@/features/settings/ServerSection';
import { appEnv } from '@/services/api/config';
import { getConnectionMode, setConnectionMode, type ConnectionMode } from '@/services/api/server';
import { initializeDatabase, LATEST_SCHEMA_VERSION, type DatabaseStatus } from '@/services/storage';
import { colors, radius, spacing } from '@/theme';

/**
 * Settings, split by route. The switch at the top decides which cards follow, so
 * what is on screen is what is in effect.
 */
export default function SettingsScreen() {
  const [mode, setMode] = useState<ConnectionMode | null>(null);
  const [status, setStatus] = useState<DatabaseStatus>({ state: 'idle' });
  const [conversationCount, setConversationCount] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    void getConnectionMode().then(setMode);
  }, []);

  const changeMode = async (next: ConnectionMode) => {
    await setConnectionMode(next);
    setMode(next);
  };

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
      {mode ? <ConnectionModeSection mode={mode} onChange={(next) => void changeMode(next)} /> : null}

      {/* Keyed by mode so each card reloads against the route now in effect. */}
      {mode === 'server' ? (
        <View key="server" style={styles.group}>
          <ServerSection />
          <ServerKeysSection />
          <ServerCostSection />
        </View>
      ) : null}
      {mode === 'direct' ? (
        <View key="direct" style={styles.group}>
          <ApiKeySection />
        </View>
      ) : null}

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

      <Section title="アプリ">
        <Row label="環境" value={appEnv} />
      </Section>
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
  group: {
    gap: spacing.lg,
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

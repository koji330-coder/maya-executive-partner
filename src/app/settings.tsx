import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { apiBaseUrl, appEnv, isApiConfigured } from '@/services/api/config';
import { initializeDatabase, LATEST_SCHEMA_VERSION, type DatabaseStatus } from '@/services/storage';
import { colors, radius, spacing } from '@/theme';

/** Phase 1 settings screen: environment and local-storage diagnostics. */
export default function SettingsScreen() {
  const [status, setStatus] = useState<DatabaseStatus>({ state: 'idle' });

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

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Section title="ローカル保存">
        <Row label="状態" value={describeStatus(status)} />
        <Row label="スキーマ" value={`v${LATEST_SCHEMA_VERSION}`} />
      </Section>

      <Section title="接続先">
        <Row label="環境" value={appEnv} />
        <Row label="API" value={isApiConfigured() ? apiBaseUrl : '未設定（Phase 3で接続）'} />
      </Section>

      <Text style={styles.note}>
        APIキーはアプリに含めません。モデル提供者への呼び出しはすべてバックエンド経由です。
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
});

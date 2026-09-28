import React from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';

import {
  getServerJevSettings,
  saveServerJevMode,
  ServerError,
  usingServer,
  type ServerJevSettings,
} from '@/services/api/server';
import { colors, radius, spacing } from '@/theme';

/**
 * Jev routing: the switch, and the fixed rules it applies.
 *
 * Off is exactly the routing from before Jev. On, each consultation's message
 * and the last few turns go to TypeSafe first, which is why the switch lives
 * here, in the president's hands, and says so next to it. Any Jev failure
 * falls back to the old routing, so switching on cannot stop a consultation.
 * Each answer shows how it was reached (経路), so the effect can be followed.
 */

type Load =
  | { state: 'loading' }
  | { state: 'off' }
  | { state: 'ready'; settings: ServerJevSettings }
  | { state: 'failed'; message: string };

export function ServerJevSection() {
  const [load, setLoad] = React.useState<Load>({ state: 'loading' });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      if (!(await usingServer())) {
        if (alive) setLoad({ state: 'off' });
        return;
      }
      try {
        const settings = await getServerJevSettings();
        if (alive) setLoad({ state: 'ready', settings });
      } catch (caught) {
        // A server from before Jev routing has no such endpoint.
        const message = caught instanceof ServerError ? caught.message : 'Jev の設定を読めませんでした。';
        if (alive) setLoad({ state: 'failed', message });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const toggle = async (on: boolean) => {
    setSaving(true);
    setError(null);
    try {
      setLoad({ state: 'ready', settings: await saveServerJevMode(on ? 'assist' : 'off') });
    } catch (caught) {
      setError(caught instanceof ServerError ? caught.message : '保存できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  if (load.state === 'off') {
    return null;
  }
  if (load.state === 'loading') {
    return (
      <View style={styles.section}>
        <Text style={styles.title}>Jev による道具の判定</Text>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }
  if (load.state === 'failed') {
    return (
      <View style={styles.section}>
        <Text style={styles.title}>Jev による道具の判定</Text>
        <Text style={styles.error}>{load.message}</Text>
      </View>
    );
  }

  const { settings } = load;
  const on = settings.mode === 'assist';
  return (
    <View style={styles.section}>
      <Text style={styles.title}>Jev による道具の判定</Text>
      <Text style={styles.body}>
        相談の前に、Jev（TypeSafe）が「どのデータが要るか」を判定します。自信が{Math.round(settings.threshold * 100)}%以上なら、
        データを先に読んで Gemini を1往復で済ませます。自信が低いときは、Jev が有力と見た道具だけを Gemini に見せます。
      </Text>

      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>Jev を使う</Text>
          <Text style={styles.rowNote}>
            ON にすると、相談の文と直近の会話（最大6件）が毎回 TypeSafe に送られます。
            {settings.timeoutMs / 1000}秒以内に答えがない、または失敗したときは、従来の判定で答えます。
          </Text>
        </View>
        <Switch value={on} disabled={saving} onValueChange={(value) => void toggle(value)} />
      </View>
      {!settings.keyConfigured ? (
        <Text style={styles.error}>
          サーバーに TypeSafe のキー（TYPESAFE_API_KEY）がありません。ON にしても、すべて従来の判定で答えます。
        </Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.rowTitle}>固定ルール</Text>
      <Text style={styles.rowNote}>Jev が「データ不要」と判断した質問にだけ、上から順に当てはめます。</Text>
      {settings.rules.map((rule) => (
        <View key={rule.id} style={styles.rule}>
          <Text style={styles.ruleTitle}>{rule.title}</Text>
          <Text style={styles.ruleBody}>{rule.description}</Text>
          <Text style={styles.ruleMeta}>
            読む道具: {rule.tool} ／ ID: {rule.id}
          </Text>
        </View>
      ))}

      <Text style={styles.note}>
        各回答の下の「経路」を開くと、Jev の判定、先に読んだ道具、Gemini の往復回数と時間が見られます。
        モデル {settings.model}。
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.ivory,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  title: { fontSize: 15, fontWeight: '600', color: colors.charcoal },
  body: { fontSize: 13, lineHeight: 19, color: colors.charcoalSoft },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: colors.charcoal },
  rowNote: { fontSize: 12, lineHeight: 18, color: colors.muted },
  rule: {
    backgroundColor: colors.cream,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 2,
  },
  ruleTitle: { fontSize: 13, fontWeight: '600', color: colors.charcoal },
  ruleBody: { fontSize: 12, lineHeight: 18, color: colors.charcoalSoft },
  ruleMeta: { fontSize: 11, color: colors.muted },
  error: { fontSize: 13, lineHeight: 19, color: colors.danger },
  note: { fontSize: 12, lineHeight: 18, color: colors.muted },
});

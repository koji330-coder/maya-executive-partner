import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import {
  getServerCostPolicy,
  saveServerCostPolicy,
  ServerError,
  usingServer,
  type ServerCostPolicy,
} from '@/services/api/server';
import { colors, radius, spacing } from '@/theme';

/**
 * The cost rules the server applies.
 *
 * The card below this one (`ApiKeySection`) has the same three rules for the
 * other route, where the app calls Gemini itself. They are separate on purpose:
 * the keys are in different places, so the rules have to be too. Only the route
 * actually in use is worth reading, which is why this card appears only when a
 * server address is saved.
 *
 * The ceiling used to be a wrangler value, so changing it meant redeploying.
 * The president asked for it on the settings screen (2026-09-14).
 */

type Load =
  | { state: 'loading' }
  | { state: 'off' }
  | { state: 'ready'; policy: ServerCostPolicy }
  | { state: 'failed'; message: string };

/** Matches the server's clamp, so the field rejects the same values it would. */
const MAX_YEN = 10_000;

export function ServerCostSection() {
  const [load, setLoad] = React.useState<Load>({ state: 'loading' });
  const [limitText, setLimitText] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const apply = React.useCallback((policy: ServerCostPolicy) => {
    setLoad({ state: 'ready', policy });
    setLimitText(String(policy.paidDailyLimitYen));
  }, []);

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      if (!(await usingServer())) {
        if (alive) setLoad({ state: 'off' });
        return;
      }
      try {
        const policy = await getServerCostPolicy();
        if (alive) apply(policy);
      } catch (caught) {
        // An older server has no settings endpoint. Say so rather than showing
        // controls that would silently do nothing.
        const message =
          caught instanceof ServerError
            ? caught.message
            : 'サーバーの費用設定を読めませんでした。';
        if (alive) setLoad({ state: 'failed', message });
      }
    })();
    return () => {
      alive = false;
    };
  }, [apply]);

  const push = async (patch: Partial<ServerCostPolicy>) => {
    setSaving(true);
    setError(null);
    try {
      // The server returns what now applies, so the clamped ceiling shows up
      // here instead of whatever was typed.
      apply(await saveServerCostPolicy(patch));
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
        <Text style={styles.title}>サーバーの費用の歯止め</Text>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  if (load.state === 'failed') {
    return (
      <View style={styles.section}>
        <Text style={styles.title}>サーバーの費用の歯止め</Text>
        <Text style={styles.error}>{load.message}</Text>
      </View>
    );
  }

  const { policy } = load;
  const typed = Number(limitText);
  const limitValid = limitText.trim() !== '' && Number.isFinite(typed) && typed >= 0 && typed <= MAX_YEN;
  const limitDirty = limitValid && typed !== policy.paidDailyLimitYen;

  return (
    <View style={styles.section}>
      <Text style={styles.title}>サーバーの費用の歯止め</Text>
      <Text style={styles.mode}>
        サーバー経由で相談するときの規則です。鍵はサーバーの中にあり、この画面のAPIキー欄は使いません。
      </Text>

      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>無料APIを優先する</Text>
          <Text style={styles.rowNote}>OFFにすると、はじめから有料キーで相談します。</Text>
        </View>
        <Switch
          value={policy.preferFree}
          disabled={saving}
          onValueChange={(preferFree) => void push({ preferFree })}
        />
      </View>

      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>上限時に有料へ切り替える</Text>
          <Text style={styles.rowNote}>
            無料枠を使い切ったときだけ、有料キーでやり直します。認証エラーや通信障害では切り替えません。
          </Text>
        </View>
        <Switch
          value={policy.allowPaidFallback}
          disabled={saving}
          onValueChange={(allowPaidFallback) => void push({ allowPaidFallback })}
        />
      </View>

      <Text style={styles.rowTitle}>有料APIの1日の上限（円）</Text>
      <TextInput
        value={limitText}
        onChangeText={setLimitText}
        style={styles.input}
        keyboardType="number-pad"
        placeholder="50"
        placeholderTextColor={colors.muted}
      />
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          disabled={!limitDirty || saving}
          onPress={() => void push({ paidDailyLimitYen: typed })}
          style={[styles.primary, (!limitDirty || saving) && styles.off]}
        >
          <Text style={styles.primaryText}>上限を保存</Text>
        </Pressable>
        {limitDirty ? <Text style={styles.rowNote}>未保存です</Text> : null}
      </View>
      {limitText.trim() !== '' && !limitValid ? (
        <Text style={styles.error}>0〜{MAX_YEN.toLocaleString()}円の範囲で入れてください。</Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.note}>
        Googleの請求上限ではなく、こちら側のブレーカーです。1回の相談を多めに見積もって送信前に加算し、
        超える見込みなら止めます。いまの{policy.paidDailyLimitYen}円で、1日およそ
        {Math.floor(policy.paidDailyLimitYen / 1.6)}回の計算です。
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
  mode: { fontSize: 13, lineHeight: 19, color: colors.charcoalSoft },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: colors.charcoal },
  rowNote: { fontSize: 12, lineHeight: 18, color: colors.muted },
  input: {
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.charcoal,
  },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  primary: {
    backgroundColor: colors.charcoal,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
  primaryText: { color: colors.ivory, fontSize: 14, fontWeight: '600' },
  off: { opacity: 0.35 },
  error: { fontSize: 13, lineHeight: 19, color: colors.danger },
  note: { fontSize: 12, lineHeight: 18, color: colors.muted },
});

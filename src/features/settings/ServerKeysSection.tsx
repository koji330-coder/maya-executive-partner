import React from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  deleteServerKey,
  getServerKeys,
  saveServerKey,
  ServerError,
  type ServerKeyStatus,
  type ServerKeyStatuses,
  type ServerKeyTier,
} from '@/services/api/server';
import { colors, radius, spacing } from '@/theme';

const TIER_LABEL: Record<ServerKeyTier, string> = { free: '無料キー', paid: '有料キー' };

function describe(status: ServerKeyStatus): string {
  if (!status.set) return '未登録';
  const tail = status.last4 ? `（末尾 ${status.last4}）` : '';
  return status.source === 'app' ? `登録済み${tail}` : `Cloudflare に設定済み${tail}`;
}

/**
 * The Gemini keys the server uses.
 *
 * Keys go one way. The server tries a key against Gemini before storing it
 * encrypted, and nothing it returns contains the key, so this screen can only
 * ever show whether one is set and its last four characters.
 */
export function ServerKeysSection() {
  const [statuses, setStatuses] = React.useState<ServerKeyStatuses | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    getServerKeys()
      .then((next) => alive && setStatuses(next))
      .catch((caught: unknown) => {
        if (alive) setLoadError(caught instanceof ServerError ? caught.message : 'キーの状態を読めませんでした。');
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <View style={styles.section}>
      <Text style={styles.title}>AIのキー（サーバー）</Text>
      {loadError ? <Text style={styles.error}>{loadError}</Text> : null}
      {!statuses && !loadError ? <ActivityIndicator color={colors.gold} /> : null}
      {statuses
        ? (['free', 'paid'] as const).map((tier) => (
            <KeyRow key={tier} tier={tier} status={statuses[tier]} onChange={setStatuses} />
          ))
        : null}
      <Text style={styles.note}>
        入れたキーは、サーバーが Gemini で使えるか確かめてから、暗号化して保存します。保存したキーは画面にもサーバーの応答にも二度と出ません。
      </Text>
    </View>
  );
}

function KeyRow({
  tier,
  status,
  onChange,
}: {
  tier: ServerKeyTier;
  status: ServerKeyStatus;
  onChange: (next: ServerKeyStatuses) => void;
}) {
  const [draft, setDraft] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      onChange(await saveServerKey(tier, draft));
      // Cleared once stored, so the key does not sit in a field a screenshot could catch.
      setDraft('');
      setDone('確かめて保存しました。');
    } catch (caught) {
      setError(caught instanceof ServerError ? caught.message : '保存できませんでした。');
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    Alert.alert(`${TIER_LABEL[tier]}を削除しますか？`, 'Cloudflare に設定したキーがあれば、そちらに戻ります。', [
      { text: 'やめる', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          try {
            onChange(await deleteServerKey(tier));
            setDone('削除しました。');
          } catch (caught) {
            setError(caught instanceof ServerError ? caught.message : '削除できませんでした。');
          }
        },
      },
    ]);
  };

  const ready = draft.trim().length > 0 && !busy;

  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Text style={styles.tier}>{TIER_LABEL[tier]}</Text>
        <Text style={[styles.state, !status.set && styles.stateOff]}>{describe(status)}</Text>
      </View>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        style={styles.input}
        placeholder={status.set ? '入れ替えるときだけ入力' : 'キーを貼り付け'}
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        editable={!busy}
      />
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          disabled={!ready}
          onPress={() => void save()}
          style={[styles.primary, !ready && styles.off]}
        >
          <Text style={styles.primaryText}>{busy ? '確かめています…' : status.set ? '入れ替え' : '登録'}</Text>
        </Pressable>
        {status.source === 'app' ? (
          <Pressable accessibilityRole="button" disabled={busy} onPress={remove} style={styles.secondary}>
            <Text style={styles.secondaryText}>削除</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {done ? <Text style={styles.ok}>{done}</Text> : null}
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
  },
  title: { fontSize: 15, fontWeight: '600', color: colors.charcoal },
  row: {
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  tier: { fontSize: 14, fontWeight: '600', color: colors.charcoal },
  state: { fontSize: 13, color: colors.success, flexShrink: 1, textAlign: 'right' },
  stateOff: { color: colors.muted },
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
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  primary: {
    backgroundColor: colors.charcoal,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
  primaryText: { color: colors.ivory, fontSize: 14, fontWeight: '600' },
  secondary: {
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
  secondaryText: { color: colors.charcoalSoft, fontSize: 14 },
  off: { opacity: 0.35 },
  ok: { fontSize: 13, color: colors.success },
  error: { fontSize: 13, lineHeight: 19, color: colors.danger },
  note: { fontSize: 12, lineHeight: 18, color: colors.muted },
});

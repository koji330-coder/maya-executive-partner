import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  checkServer,
  getStoredServerUrl,
  saveServerUrl,
  ServerError,
  type ServerHealth,
} from '@/services/api/server';
import { colors, radius, spacing } from '@/theme';

type Check =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'ok'; health: ServerHealth }
  | { state: 'failed'; message: string };

/**
 * Where MAYA runs.
 *
 * Empty: the app calls Gemini itself and keeps memory on the phone, as before.
 * Set: consultations, decisions, journal entries and topics go through the MAYA
 * server. Switching does not move existing data. What was saved on the phone
 * stays on the phone and does not appear while the server is in use.
 */
export function ServerSection() {
  const [url, setUrl] = React.useState('');
  const [savedUrl, setSavedUrl] = React.useState<string | null>(null);
  const [check, setCheck] = React.useState<Check>({ state: 'idle' });
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    void getStoredServerUrl().then((stored) => {
      setUrl(stored);
      setSavedUrl(stored || null);
    });
  }, []);

  const runCheck = async () => {
    setCheck({ state: 'checking' });
    try {
      setCheck({ state: 'ok', health: await checkServer() });
    } catch (e) {
      setCheck({
        state: 'failed',
        message: e instanceof ServerError ? e.message : 'サーバーの状態を確かめられませんでした。',
      });
    }
  };

  const save = async () => {
    setError(null);
    try {
      const stored = await saveServerUrl(url);
      setSavedUrl(stored);
      setUrl(stored ?? '');
      if (stored) {
        await runCheck();
      } else {
        setCheck({ state: 'idle' });
      }
    } catch (e) {
      setError(e instanceof ServerError ? e.message : '保存できませんでした。');
    }
  };

  const clear = async () => {
    setUrl('');
    await saveServerUrl('');
    setSavedUrl(null);
    setCheck({ state: 'idle' });
  };

  const dirty = url.trim().replace(/\/+$/, '') !== (savedUrl ?? '');

  return (
    <View style={styles.section}>
      <Text style={styles.title}>MAYAサーバー</Text>
      <Text style={styles.mode}>
        {savedUrl ? `サーバー経由で相談しています` : 'このスマホから直接 Gemini を呼んでいます'}
      </Text>

      <TextInput
        value={url}
        onChangeText={setUrl}
        style={styles.input}
        placeholder="http://192.168.11.6:8787"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          disabled={!dirty}
          onPress={() => void save()}
          style={[styles.primary, !dirty && styles.off]}
        >
          <Text style={styles.primaryText}>保存</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={!savedUrl || check.state === 'checking'}
          onPress={() => void runCheck()}
          style={[styles.secondary, (!savedUrl || check.state === 'checking') && styles.off]}
        >
          <Text style={styles.secondaryText}>接続を確認</Text>
        </Pressable>
        {savedUrl ? (
          <Pressable accessibilityRole="button" onPress={() => void clear()} style={styles.secondary}>
            <Text style={styles.secondaryText}>使わない</Text>
          </Pressable>
        ) : null}
      </View>

      {check.state === 'checking' ? <ActivityIndicator color={colors.gold} /> : null}
      {check.state === 'ok' ? (
        <Text style={styles.ok}>
          つながりました。モデル {check.health.model}・無料キー{check.health.keys.free ? 'あり' : 'なし'}
          ・有料キー{check.health.keys.paid ? 'あり' : 'なし'}
        </Text>
      ) : null}
      {check.state === 'failed' ? <Text style={styles.error}>{check.message}</Text> : null}

      <Text style={styles.note}>
        サーバーを使うと、判断・Journal・話題はサーバーに保存されます。これまでスマホに保存したものは、サーバー使用中は表示されません。空にすれば元に戻ります。
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
  mode: { fontSize: 13, color: colors.charcoalSoft },
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
  ok: { fontSize: 13, lineHeight: 19, color: colors.success },
  error: { fontSize: 13, lineHeight: 19, color: colors.danger },
  note: { fontSize: 12, lineHeight: 18, color: colors.muted },
});

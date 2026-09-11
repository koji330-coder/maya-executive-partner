import React from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { deleteApiKey, getApiKeys, saveApiKey, type ApiTier } from '@/services/llm/apiKey';
import {
  DEFAULT_LLM_SETTINGS,
  loadLlmSettings,
  saveLlmSettings,
  type LlmSettings,
} from '@/services/llm/settings';
import { getUsage, type DailyUsage } from '@/services/llm/usage';
import { colors, radius, spacing } from '@/theme';

/**
 * Where the user puts their own Gemini keys.
 *
 * Two keys from two Google Cloud projects: the free one from a project without
 * billing, the paid one from a project with it. Keys go to the device keychain
 * and nowhere else.
 */
export function ApiKeySection() {
  const [stored, setStored] = React.useState<Record<ApiTier, boolean>>({ free: false, paid: false });
  const [drafts, setDrafts] = React.useState<Record<ApiTier, string>>({ free: '', paid: '' });
  const [settings, setSettings] = React.useState<LlmSettings>(DEFAULT_LLM_SETTINGS);
  const [usage, setUsage] = React.useState<DailyUsage | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    const [keys, loaded, used] = await Promise.all([getApiKeys(), loadLlmSettings(), getUsage()]);
    setStored({ free: Boolean(keys.free), paid: Boolean(keys.paid) });
    setSettings(loaded);
    setUsage(used);
  }, []);

  // Reading the keychain and the usage table is a side effect with an async
  // result, so the state lands in a callback rather than in the effect body.
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [keys, loaded, used] = await Promise.all([getApiKeys(), loadLlmSettings(), getUsage()]);
      if (cancelled) return;
      setStored({ free: Boolean(keys.free), paid: Boolean(keys.paid) });
      setSettings(loaded);
      setUsage(used);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const update = React.useCallback(async (next: LlmSettings) => {
    setSettings(next);
    await saveLlmSettings(next);
  }, []);

  const onSave = async (tier: ApiTier) => {
    try {
      await saveApiKey(tier, drafts[tier]);
      setDrafts((current) => ({ ...current, [tier]: '' }));
      setMessage(`${tier === 'free' ? '無料' : '有料'}APIキーを保存しました。`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'APIキーを保存できませんでした。');
    }
  };

  const onDelete = async (tier: ApiTier) => {
    await deleteApiKey(tier);
    setMessage(`${tier === 'free' ? '無料' : '有料'}APIキーを削除しました。`);
    await refresh();
  };

  return (
    <View style={styles.root}>
      <Text style={styles.sectionTitle}>APIキー</Text>

      {(['free', 'paid'] as ApiTier[]).map((tier) => (
        <View key={tier} style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>{tier === 'free' ? '無料APIキー' : '有料APIキー'}</Text>
            <Text style={[styles.state, stored[tier] && styles.stateSet]}>
              {stored[tier] ? '登録済み' : '未登録'}
            </Text>
          </View>
          <Text style={styles.cardNote}>
            {tier === 'free' ? 'Billingなしのプロジェクトのキー' : 'Billing有効の別プロジェクトのキー'}
          </Text>
          <TextInput
            style={styles.input}
            value={drafts[tier]}
            onChangeText={(text) => setDrafts((current) => ({ ...current, [tier]: text }))}
            placeholder={stored[tier] ? '新しいキーで置き換える' : 'APIキーを貼り付け'}
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <View style={styles.row}>
            <Pressable accessibilityRole="button" onPress={() => void onSave(tier)} style={styles.primary}>
              <Text style={styles.primaryText}>保存</Text>
            </Pressable>
            {stored[tier] ? (
              <Pressable accessibilityRole="button" onPress={() => void onDelete(tier)}>
                <Text style={styles.destructive}>削除</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ))}

      <Text style={styles.warning}>
        キーはこの端末のキーチェーンだけに保存し、外部へ送りません。無料枠のプロジェクトは、
        送信した内容がGoogleのサービス改善に使われる場合があります。実在する会社の数字や
        取引先の名前は、有料キーを登録してから扱ってください。
      </Text>

      <Text style={styles.sectionTitle}>費用の歯止め</Text>

      <View style={styles.card}>
        <View style={styles.ruleRow}>
          <View style={styles.ruleText}>
            <Text style={styles.ruleTitle}>無料APIを優先する</Text>
            <Text style={styles.ruleNote}>OFF、または無料キーが無い場合は有料キーを使います。</Text>
          </View>
          <Switch
            value={settings.preferFree}
            onValueChange={(preferFree) => void update({ ...settings, preferFree })}
          />
        </View>
        <View style={styles.ruleRow}>
          <View style={styles.ruleText}>
            <Text style={styles.ruleTitle}>上限時に有料へ切り替える</Text>
            <Text style={styles.ruleNote}>
              無料枠の上限に当たったときだけ、有料キーで1回やり直します。認証エラーや通信障害では
              切り替えません。
            </Text>
          </View>
          <Switch
            value={settings.allowPaidFallback}
            onValueChange={(allowPaidFallback) => void update({ ...settings, allowPaidFallback })}
          />
        </View>
        <Text style={styles.ruleTitle}>有料APIの1日の上限（円）</Text>
        <TextInput
          style={styles.input}
          value={String(settings.paidDailyLimitYen)}
          onChangeText={(text) => {
            const parsed = Number(text.replace(/[^0-9]/g, ''));
            void update({ ...settings, paidDailyLimitYen: Number.isFinite(parsed) ? parsed : 0 });
          }}
          keyboardType="number-pad"
        />
        <Text style={styles.ruleNote}>
          1回の相談を保守的に見積もって加算し、超える見込みなら送信前に止めます。Googleの実際の
          請求上限ではありません。
        </Text>
      </View>

      {usage ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>今日の利用</Text>
          <Text style={styles.usage}>無料：{usage.freeTurns}回</Text>
          <Text style={styles.usage}>有料：{usage.paidTurns}回</Text>
          <Text style={styles.usage}>有料の安全見積り：{usage.paidEstimatedYen.toFixed(2)}円</Text>
          <Text style={styles.usage}>使用トークン：{usage.totalTokens.toLocaleString()}</Text>
        </View>
      ) : null}

      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  sectionTitle: {
    marginTop: spacing.sm,
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
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.charcoal },
  cardNote: { fontSize: 12, color: colors.muted },
  state: { fontSize: 12, color: colors.muted },
  stateSet: { color: colors.success, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    backgroundColor: colors.cream,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.charcoal,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  primary: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.charcoal,
  },
  primaryText: { color: colors.ivory, fontWeight: '700', fontSize: 13 },
  destructive: { color: colors.danger, fontSize: 13 },
  warning: { fontSize: 12, lineHeight: 19, color: colors.charcoalSoft },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  ruleText: { flex: 1, gap: 2 },
  ruleTitle: { fontSize: 14, fontWeight: '600', color: colors.charcoal },
  ruleNote: { fontSize: 12, lineHeight: 18, color: colors.muted },
  usage: { fontSize: 13, color: colors.charcoalSoft },
  message: { fontSize: 12, color: colors.success },
});

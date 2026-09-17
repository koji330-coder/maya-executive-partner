import React from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { ScreenContainer } from '@/components/ScreenContainer';
import { useCompanyProfile } from '@/features/company/useCompanyProfile';
import { colors, radius, spacing } from '@/theme';

/**
 * Company Brain — docs/UX_SPEC.md §7.
 *
 * Everything MAYA knows about the company is on this screen and editable. That
 * is the point of it: the user must be able to see what she knows, not infer it
 * from how she answers.
 */
export default function CompanyScreen() {
  const company = useCompanyProfile();
  const { profile } = company;

  return (
    <ScreenContainer scroll>
      <View style={styles.header}>
        <Text style={styles.title}>会社のこと</Text>
        <Text style={styles.subtitle}>
          ここに書いたことだけを、MAYAは前提として使います。書いていないことは推測せず、
          必要なら相談中に訊いてきます。
        </Text>
      </View>

      <Field
        label="会社名"
        value={profile.name}
        onChange={(v) => company.set('name', v)}
        placeholder="株式会社◯◯"
      />
      <Field
        label="業種"
        value={profile.industry}
        onChange={(v) => company.set('industry', v)}
        placeholder="金属加工の受託製造"
      />
      <Field
        label="従業員数"
        value={profile.employeeCount}
        onChange={(v) => company.set('employeeCount', v)}
        placeholder="28"
        keyboardType="number-pad"
      />
      <Field
        label="売上レンジ"
        value={profile.revenueRange}
        onChange={(v) => company.set('revenueRange', v)}
        placeholder="4〜5億円"
      />
      <Field
        label="事業内容"
        value={profile.description}
        onChange={(v) => company.set('description', v)}
        placeholder="何を、誰に、どう売っているか"
        multiline
      />
      <ListField
        label="経営目標"
        hint="1行に1つ。優先したいことから。"
        values={profile.goals}
        onChange={(v) => company.set('goals', v)}
        placeholder="3年で主要取引先への依存を4割まで下げる"
      />
      <ListField
        label="いま抱えている課題"
        hint="1行に1つ。数字が分かるものは数字で。"
        values={profile.issues}
        onChange={(v) => company.set('issues', v)}
        placeholder="見積作成が属人化していて回答まで平均3日"
      />

      <View style={styles.realCard}>
        <View style={styles.realRow}>
          <View style={styles.realText}>
            <Text style={styles.realTitle}>実在する会社の情報です</Text>
            <Text style={styles.realNote}>
              ONにすると、無料APIキーを使わなくなります。無料枠のプロジェクトは送信内容が
              サービス改善に使われる場合があり、この会社情報は毎回の相談に送られるためです。
            </Text>
          </View>
          <Switch
            value={profile.isRealCompany}
            onValueChange={(value) => company.set('isRealCompany', value)}
          />
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={!company.dirty || company.saving}
        onPress={() => void company.save()}
        style={[styles.save, (!company.dirty || company.saving) && styles.saveDisabled]}
      >
        <Text style={styles.saveText}>{company.saving ? '保存しています…' : '保存する'}</Text>
      </Pressable>

      {company.error ? <Text style={styles.error}>{company.error}</Text> : null}

      {profile.updatedAt ? (
        <Text style={styles.stamp}>
          最終更新 {new Date(profile.updatedAt).toLocaleString('ja-JP')}
        </Text>
      ) : (
        <Text style={styles.stamp}>まだ保存していません。</Text>
      )}
    </ScreenContainer>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  keyboardType,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'number-pad';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        multiline={multiline}
        keyboardType={keyboardType ?? 'default'}
      />
    </View>
  );
}

/**
 * A newline-separated list.
 *
 * The text is derived from the stored values rather than mirrored into local
 * state, so there is nothing to keep in sync. Trailing blank lines survive
 * editing because only the saved value drops them.
 */
function ListField({
  label,
  hint,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  hint: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.hint}>{hint}</Text>
      <TextInput
        style={[styles.input, styles.inputMultiline]}
        value={values.join('\n')}
        onChangeText={(next) => onChange(next.split('\n'))}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        multiline
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingVertical: spacing.md, gap: spacing.xs },
  title: { fontSize: 24, fontWeight: '600', color: colors.charcoal },
  subtitle: { fontSize: 14, lineHeight: 21, color: colors.charcoalSoft },
  field: { gap: spacing.xs, marginBottom: spacing.md },
  label: { fontSize: 13, fontWeight: '700', color: colors.charcoal },
  hint: { fontSize: 12, color: colors.muted },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.ivory,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 15,
    color: colors.charcoal,
  },
  inputMultiline: { minHeight: 88, textAlignVertical: 'top' },
  realCard: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.ivory,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  realRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  realText: { flex: 1, gap: 3 },
  realTitle: { fontSize: 14, fontWeight: '700', color: colors.charcoal },
  realNote: { fontSize: 12, lineHeight: 18, color: colors.muted },
  save: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.charcoal,
  },
  saveDisabled: { opacity: 0.35 },
  saveText: { fontSize: 15, fontWeight: '700', color: colors.ivory },
  stamp: { marginTop: spacing.sm, fontSize: 12, color: colors.muted, textAlign: 'center' },
  error: {
    marginTop: spacing.sm,
    fontSize: 13,
    lineHeight: 20,
    color: colors.danger,
    textAlign: 'center',
  },
});

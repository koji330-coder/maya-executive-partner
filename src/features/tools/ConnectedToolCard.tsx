import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { colors, radius, spacing } from '@/theme';

import type { ConnectedTool } from './catalog';

/**
 * One tool, closed to a line and opened to its manual.
 *
 * Closed by default: with more tools connected the screen would otherwise become
 * a wall of text, and what a person wants at a glance is which ones exist.
 */
export function ConnectedToolCard({ tool }: { tool: ConnectedTool }) {
  const ready = tool.serverTool !== null;
  const [open, setOpen] = React.useState(false);

  return (
    <View style={[styles.card, !ready && styles.cardQuiet]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${tool.label}。${ready ? '使えます' : 'これから'}。${open ? '説明を閉じる' : '説明を開く'}`}
        onPress={() => setOpen((value) => !value)}
        style={styles.header}
      >
        <Ionicons name={tool.icon} size={22} color={ready ? colors.gold : colors.muted} />
        <View style={styles.headerText}>
          <View style={styles.titleRow}>
            <Text style={styles.label}>{tool.label}</Text>
            <Text style={[styles.badge, ready ? styles.badgeReady : styles.badgeQuiet]}>{ready ? '使えます' : 'これから'}</Text>
          </View>
          <Text style={styles.summary}>{tool.summary}</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
      </Pressable>

      {open ? (
        <View style={styles.body}>
          <Section title="できること" lines={tool.can} />
          <Section title="こう聞いてください" lines={tool.ask.map((line) => `「${line}」`)} />
          <Section title="知っておくこと" lines={tool.notes} />
          <Text style={styles.source}>数字の出どころ: {tool.source}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Section({ title, lines }: { title: string; lines: string[] }) {
  if (lines.length === 0) {
    return null;
  }
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {lines.map((line) => (
        <Text key={line} style={styles.line}>
          ・{line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.ivory,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  cardQuiet: {
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    padding: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.charcoal,
  },
  badge: {
    fontSize: 10,
    fontWeight: '500',
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  badgeReady: {
    color: colors.success,
    backgroundColor: colors.cream,
  },
  badgeQuiet: {
    color: colors.muted,
    backgroundColor: colors.cream,
  },
  summary: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.charcoalSoft,
  },
  body: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.md,
  },
  section: {
    gap: spacing.xs,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.gold,
  },
  line: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.charcoal,
  },
  source: {
    fontSize: 11,
    lineHeight: 17,
    color: colors.muted,
  },
});

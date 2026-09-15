import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';

export interface EmptyStateProps {
  title: string;
  body: string;
  /** Which implementation phase will fill this screen in. */
  phase?: string;
}

export function EmptyState({ title, body, phase }: EmptyStateProps) {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {phase ? <Text style={styles.phase}>{phase}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.ivory,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.charcoal,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.charcoalSoft,
  },
  phase: {
    fontSize: 11,
    letterSpacing: 0.8,
    color: colors.muted,
    textTransform: 'uppercase',
  },
});

import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { colors, radius, spacing } from '@/theme';

import { listConversations, type StoredConversation } from './conversationRepository';

export interface ConversationSheetProps {
  visible: boolean;
  activeId: string;
  onClose: () => void;
  onNew: () => void;
  onOpen: (id: string) => void;
}

/**
 * Past conversations, and the way to start a new one.
 *
 * Decisions are not listed per conversation on purpose. They belong to the
 * company, so whichever conversation is open, MAYA remembers all of them.
 */
export function ConversationSheet({ visible, activeId, onClose, onNew, onOpen }: ConversationSheetProps) {
  const [conversations, setConversations] = React.useState<StoredConversation[] | null>(null);

  React.useEffect(() => {
    if (!visible) {
      return;
    }
    let cancelled = false;
    void listConversations(50).then((rows) => {
      if (!cancelled) {
        // A conversation opened with the new-conversation button has no row
        // until its first message, so it cannot appear here empty.
        setConversations(rows.filter((row) => row.messageCount > 0));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.bar}>
          <Pressable accessibilityRole="button" onPress={onClose} hitSlop={10}>
            <Text style={styles.close}>閉じる</Text>
          </Pressable>
          <Text style={styles.barTitle}>会話</Text>
          <View style={styles.barSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          <Pressable accessibilityRole="button" onPress={onNew} style={styles.newButton}>
            <Ionicons name="create-outline" size={18} color={colors.ivory} />
            <Text style={styles.newText}>新しい会話を始める</Text>
          </Pressable>
          <Text style={styles.note}>
            保存した判断は、どの会話からでもMAYAが覚えています。
          </Text>

          {conversations === null ? null : conversations.length === 0 ? (
            <Text style={styles.empty}>まだ会話はありません。</Text>
          ) : (
            conversations.map((conversation) => {
              const active = conversation.id === activeId;
              return (
                <Pressable
                  key={conversation.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => onOpen(conversation.id)}
                  style={[styles.row, active && styles.rowActive]}
                >
                  <Text style={styles.rowTitle} numberOfLines={2}>
                    {conversation.title || '（無題）'}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {formatWhen(conversation.updatedAt)}・{conversation.messageCount}件
                    {active ? '・いま開いている会話' : ''}
                  </Text>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

/** Today shows the time, anything older shows the date. */
function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  return sameDay
    ? date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' });
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.ivory,
  },
  barTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.charcoal,
  },
  barSpacer: {
    width: 44,
  },
  close: {
    fontSize: 15,
    color: colors.charcoalSoft,
    width: 44,
  },
  body: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.charcoal,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
  },
  newText: {
    color: colors.ivory,
    fontSize: 15,
    fontWeight: '600',
  },
  note: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.charcoalSoft,
    marginBottom: spacing.sm,
  },
  empty: {
    fontSize: 13,
    color: colors.charcoalSoft,
  },
  row: {
    backgroundColor: colors.ivory,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 4,
  },
  rowActive: {
    borderColor: colors.gold,
  },
  rowTitle: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
    color: colors.charcoal,
  },
  rowMeta: {
    fontSize: 12,
    color: colors.muted,
  },
});

import { openDatabase } from '@/services/storage';

import type { MayaResponse } from './mayaResponse';

/**
 * Conversation persistence.
 *
 * `docs/DATA_MODEL.md` defines `cached_conversations` and `cached_messages`, and
 * the migration created them, but nothing wrote to them: every consultation was
 * lost when the app closed. This fills that gap.
 *
 * Writes are best-effort. A consultation that cannot be saved is still a
 * consultation, so a failed write never interrupts the turn.
 */
export interface StoredMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'maya';
  text: string;
  emotion: string | null;
  pose: string | null;
  scene: string | null;
  voiceKey: string | null;
  createdAt: string;
}

export interface StoredConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export async function createConversation(id: string, title: string): Promise<void> {
  try {
    const db = await openDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO cached_conversations (id, company_id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = excluded.updated_at;`,
      id,
      'current',
      title,
      now,
      now,
    );
  } catch {
    /* saving is best effort */
  }
}

export async function saveUserMessage(
  conversationId: string,
  id: string,
  text: string,
): Promise<void> {
  try {
    const db = await openDatabase();
    await db.runAsync(
      `INSERT INTO cached_messages (id, conversation_id, role, text, created_at)
       VALUES (?, ?, 'user', ?, ?);`,
      id,
      conversationId,
      text,
      new Date().toISOString(),
    );
    await touch(conversationId);
  } catch {
    /* saving is best effort */
  }
}

export async function saveMayaMessage(
  conversationId: string,
  id: string,
  response: MayaResponse,
): Promise<void> {
  try {
    const db = await openDatabase();
    await db.runAsync(
      `INSERT INTO cached_messages
         (id, conversation_id, role, text, emotion, pose, scene, voice_key, created_at)
       VALUES (?, ?, 'maya', ?, ?, ?, ?, ?, ?);`,
      id,
      conversationId,
      response.message,
      response.emotion,
      response.pose,
      response.scene,
      response.voice.fixedClipKey ?? null,
      new Date().toISOString(),
    );
    await touch(conversationId);
  } catch {
    /* saving is best effort */
  }
}

async function touch(conversationId: string): Promise<void> {
  const db = await openDatabase();
  await db.runAsync(
    'UPDATE cached_conversations SET updated_at = ? WHERE id = ?;',
    new Date().toISOString(),
    conversationId,
  );
}

export async function listConversations(limit = 30): Promise<StoredConversation[]> {
  try {
    const db = await openDatabase();
    return await db.getAllAsync<StoredConversation>(
      `SELECT c.id, c.title, c.created_at AS createdAt, c.updated_at AS updatedAt,
              COUNT(m.id) AS messageCount
       FROM cached_conversations c
       LEFT JOIN cached_messages m ON m.conversation_id = c.id
       GROUP BY c.id
       ORDER BY c.updated_at DESC
       LIMIT ?;`,
      limit,
    );
  } catch {
    return [];
  }
}

export async function loadMessages(conversationId: string): Promise<StoredMessage[]> {
  try {
    const db = await openDatabase();
    return await db.getAllAsync<StoredMessage>(
      `SELECT id, conversation_id AS conversationId, role, text, emotion, pose, scene,
              voice_key AS voiceKey, created_at AS createdAt
       FROM cached_messages WHERE conversation_id = ? ORDER BY created_at;`,
      conversationId,
    );
  } catch {
    return [];
  }
}

/**
 * The whole history as plain text.
 *
 * Exists so a transcript can leave the phone. Judging how MAYA actually sounds
 * needs the real exchange, not a description of it.
 */
export async function exportTranscript(): Promise<string> {
  const conversations = await listConversations(100);
  if (conversations.length === 0) {
    return '保存された会話はありません。';
  }
  const blocks: string[] = [];
  for (const conversation of conversations) {
    const messages = await loadMessages(conversation.id);
    const header = `## ${conversation.title}\n${conversation.createdAt}`;
    const body = messages
      .map((message) =>
        message.role === 'user'
          ? `社長: ${message.text}`
          : `MAYA [${message.emotion} / ${message.pose} / ${message.scene}]: ${message.text}`,
      )
      .join('\n\n');
    blocks.push(`${header}\n\n${body}`);
  }
  return blocks.join('\n\n---\n\n');
}

export async function clearConversations(): Promise<void> {
  const db = await openDatabase();
  await db.execAsync('DELETE FROM cached_messages;');
  await db.execAsync('DELETE FROM cached_conversations;');
}

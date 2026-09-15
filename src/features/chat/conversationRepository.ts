import { openDatabase } from '@/services/storage';

import { validateMayaResponse, type MayaResponse } from './mayaResponse';

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
  /**
   * The whole reply, for a maya message saved since the column existed.
   *
   * Null for the older rows, which kept only the prose. Those reload as before
   * rather than being backfilled: the structured half was never written, so
   * there is nothing to recover.
   */
  response: MayaResponse | null;
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
         (id, conversation_id, role, text, emotion, pose, scene, voice_key,
          response_json, created_at)
       VALUES (?, ?, 'maya', ?, ?, ?, ?, ?, ?, ?);`,
      id,
      conversationId,
      response.message,
      response.emotion,
      response.pose,
      response.scene,
      response.voice.fixedClipKey ?? null,
      JSON.stringify(response),
      new Date().toISOString(),
    );
    await touch(conversationId);
  } catch {
    /* saving is best effort */
  }
}

/** Takes back a message that never got an answer. */
export async function deleteMessage(id: string): Promise<void> {
  try {
    const db = await openDatabase();
    await db.runAsync('DELETE FROM cached_messages WHERE id = ?;', id);
  } catch {
    /* best effort, like saving */
  }
}

/**
 * Removes a conversation that has no messages left.
 *
 * A first message that fails is taken back, and without this the conversation
 * it created would stay in the list as an empty entry named after a question
 * that was never answered.
 */
export async function deleteConversationIfEmpty(id: string): Promise<void> {
  try {
    const db = await openDatabase();
    await db.runAsync(
      `DELETE FROM cached_conversations
       WHERE id = ? AND NOT EXISTS (SELECT 1 FROM cached_messages WHERE conversation_id = ?);`,
      id,
      id,
    );
  } catch {
    /* best effort */
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

interface MessageRow extends Omit<StoredMessage, 'response'> {
  responseJson: string | null;
}

/**
 * A stored reply is put back through the validator, not trusted.
 *
 * It was valid when it was written, but the contract moves, and a row written
 * by an older build can name an emotion this one no longer has. The validator
 * already repairs exactly that, so reloading uses the same door as arriving.
 */
function parseStoredResponse(json: string | null): MayaResponse | null {
  if (!json) {
    return null;
  }
  try {
    const result = validateMayaResponse(JSON.parse(json));
    return result.ok ? result.value : null;
  } catch {
    return null;
  }
}

export async function loadMessages(conversationId: string): Promise<StoredMessage[]> {
  try {
    const db = await openDatabase();
    const rows = await db.getAllAsync<MessageRow>(
      `SELECT id, conversation_id AS conversationId, role, text, emotion, pose, scene,
              voice_key AS voiceKey, response_json AS responseJson, created_at AS createdAt
       FROM cached_messages WHERE conversation_id = ? ORDER BY created_at;`,
      conversationId,
    );
    return rows.map(({ responseJson, ...message }) => ({
      ...message,
      response: message.role === 'maya' ? parseStoredResponse(responseJson) : null,
    }));
  } catch {
    return [];
  }
}

/**
 * One maya turn as text, structured half included.
 *
 * The export existed to judge how MAYA sounds, and printed only her prose. But
 * a reply that ends in three options is not the same reply as one that ends in
 * a flat statement, and the choice between those is most of what is being
 * judged. So everything she actually put on screen is printed.
 */
export function formatMayaMessage(message: StoredMessage): string {
  const lines = [
    `MAYA [${message.emotion} / ${message.pose} / ${message.scene}]: ${message.text}`,
  ];
  const response = message.response;
  if (!response) {
    return lines.join('\n');
  }
  if (response.options && response.options.length > 0) {
    lines.push('  選択肢:');
    for (const option of response.options) {
      lines.push(`    ${option.recommended ? '◎' : '・'} ${option.label}`);
    }
  }
  if (response.nextAction?.detected && response.nextAction.title) {
    const due = response.nextAction.dueDate ? `（期限 ${response.nextAction.dueDate}）` : '';
    lines.push(`  次の一手: ${response.nextAction.title}${due}`);
  }
  if (response.decision?.detected && response.decision.title) {
    lines.push(`  判断: ${response.decision.title}`);
    if (response.decision.reason) {
      lines.push(`    理由: ${response.decision.reason}`);
    }
  }
  if (response.followUpQuestion) {
    lines.push(`  問い返し: ${response.followUpQuestion}`);
  }
  return lines.join('\n');
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
    blocks.push(formatConversation(conversation, await loadMessages(conversation.id)));
  }
  return blocks.join('\n\n---\n\n');
}

/**
 * One conversation as text, with a time on every message.
 *
 * The export used to print the conversation's start time and nothing after
 * it. A conversation that ran for three days read as one sitting, and failures
 * that had already been fixed looked like fresh ones because there was no way
 * to see when each line was written.
 */
export function formatConversation(
  conversation: Pick<StoredConversation, 'title'>,
  messages: StoredMessage[],
): string {
  const lines: string[] = [`## ${conversation.title}`];
  let day = '';
  for (const message of messages) {
    const at = new Date(message.createdAt);
    const valid = !Number.isNaN(at.getTime());
    const thisDay = valid ? localDay(at) : '';
    if (thisDay && thisDay !== day) {
      day = thisDay;
      lines.push('', `### ${day}`);
    }
    const time = valid ? `${pad(at.getHours())}:${pad(at.getMinutes())} ` : '';
    const body = message.role === 'user' ? `社長: ${message.text}` : formatMayaMessage(message);
    lines.push('', `${time}${body}`);
  }
  return lines.join('\n');
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function localDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export async function clearConversations(): Promise<void> {
  const db = await openDatabase();
  await db.execAsync('DELETE FROM cached_messages;');
  await db.execAsync('DELETE FROM cached_conversations;');
}

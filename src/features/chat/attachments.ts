import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

/**
 * What the user can hand MAYA alongside a question.
 *
 * `README.md` excludes finance document ingestion from v0.1, so there is no
 * spreadsheet parser here. A screenshot of a sheet works, and so does a CSV
 * export; both are read as they are, with no pipeline to maintain.
 */
export type AttachmentKind = 'image' | 'text';

export interface Attachment {
  id: string;
  kind: AttachmentKind;
  name: string;
  /** Base64 for images, the file's text for everything else. */
  data: string;
  mimeType: string;
  /** Bytes on disk, for the size guard and for telling the user what it costs. */
  bytes: number;
}

/**
 * Caps, chosen from measurement rather than taste.
 *
 * A 191KB screenshot cost about 1,100 prompt tokens on `gemini-3.6-flash`.
 * Images are billed by dimension rather than file size, so the limit here is
 * about keeping the request small and the failure obvious.
 */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_TEXT_CHARS = 40_000;
export const MAX_ATTACHMENTS = 3;

const TEXT_TYPES = [
  'text/*',
  'application/json',
  'text/csv',
  'text/markdown',
  'application/pdf',
];

let counter = 0;
function attachmentId() {
  counter += 1;
  return `att-${Date.now()}-${counter}`;
}

export class AttachmentError extends Error {}

/** A screenshot or photo from the library. */
export async function pickImage(): Promise<Attachment | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new AttachmentError('写真へのアクセスが許可されていません。設定から許可してください。');
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    base64: true,
  });
  if (result.canceled || !result.assets[0]) {
    return null;
  }
  const asset = result.assets[0];
  if (!asset.base64) {
    throw new AttachmentError('画像を読み込めませんでした。');
  }
  const bytes = Math.round((asset.base64.length * 3) / 4);
  if (bytes > MAX_IMAGE_BYTES) {
    throw new AttachmentError(
      `画像が大きすぎます（${Math.round(bytes / 1024 / 1024)}MB）。${MAX_IMAGE_BYTES / 1024 / 1024}MB までにしてください。`,
    );
  }
  return {
    id: attachmentId(),
    kind: 'image',
    name: asset.fileName ?? 'screenshot.png',
    data: asset.base64,
    mimeType: asset.mimeType ?? 'image/png',
    bytes,
  };
}

/** A text file: markdown, CSV, JSON, plain text. */
export async function pickTextFile(): Promise<Attachment | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: TEXT_TYPES, copyToCacheDirectory: true });
  if (result.canceled || !result.assets[0]) {
    return null;
  }
  const asset = result.assets[0];
  if (asset.mimeType?.includes('spreadsheet') || /\.xlsx?$/i.test(asset.name)) {
    throw new AttachmentError(
      'Excelはそのままでは読めません。CSVで書き出すか、画面のスクリーンショットを送ってください。',
    );
  }
  const text = await FileSystem.readAsStringAsync(asset.uri);
  if (text.length > MAX_TEXT_CHARS) {
    throw new AttachmentError(
      `ファイルが長すぎます（${text.length.toLocaleString()}文字）。${MAX_TEXT_CHARS.toLocaleString()}文字までにしてください。`,
    );
  }
  return {
    id: attachmentId(),
    kind: 'text',
    name: asset.name,
    data: text,
    mimeType: asset.mimeType ?? 'text/plain',
    bytes: asset.size ?? text.length,
  };
}

/**
 * Roughly what these add to a turn, for the spending guard.
 *
 * The image figure is the measured 1,100 rounded up; text is the usual
 * characters-per-token approximation for Japanese.
 */
export function estimateAttachmentTokens(attachments: Attachment[]): number {
  return attachments.reduce(
    (total, attachment) =>
      total + (attachment.kind === 'image' ? 1300 : Math.ceil(attachment.data.length / 2)),
    0,
  );
}

export function describeAttachment(attachment: Attachment): string {
  const size =
    attachment.bytes > 1024 * 1024
      ? `${(attachment.bytes / 1024 / 1024).toFixed(1)}MB`
      : `${Math.max(1, Math.round(attachment.bytes / 1024))}KB`;
  return `${attachment.name}（${size}）`;
}

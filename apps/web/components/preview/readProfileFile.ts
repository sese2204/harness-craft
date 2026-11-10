// Reads harness-profile.json in the browser only (FileReader). Nothing is sent anywhere.
import { parseProfile, type ParseResult } from '@harness-craft/sheet';

export const MAX_PROFILE_BYTES = 5 * 1024 * 1024;

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('파일을 텍스트로 읽지 못했습니다.')));
    reader.onerror = () => reject(reader.error ?? new Error('파일을 읽지 못했습니다.'));
    reader.readAsText(file);
  });
}

export async function readProfileFile(file: File): Promise<ParseResult> {
  if (file.size > MAX_PROFILE_BYTES) {
    return { ok: false, errors: [`파일이 너무 큽니다 (${(file.size / 1024 / 1024).toFixed(1)}MB). 5MB 이하만 열 수 있습니다.`] };
  }
  const text = await readText(file);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, errors: [`JSON 형식이 아닙니다: ${reason}`] };
  }
  return parseProfile(json);
}

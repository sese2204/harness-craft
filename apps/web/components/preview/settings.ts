// Preview settings persisted in localStorage. Storage failures (private mode, quota, disabled) never break the page.
import { DEFAULT_HANDLE, HANDLE_MAX_LENGTH, HIDDEN_KINDS, type HiddenKind } from '@harness-craft/sheet';

export const SETTINGS_KEY = 'harness-craft:preview-settings:v1';

export interface PreviewSettings {
  handle: string;
  showDescriptions: boolean;
  scanlines: boolean;
  hidden: Record<HiddenKind, string[]>;
}

export const DEFAULT_SETTINGS: PreviewSettings = {
  handle: DEFAULT_HANDLE,
  showDescriptions: false,
  scanlines: false,
  hidden: { mcp: [], skills: [], agents: [], hooks: [] },
};

const MAX_HIDDEN_PER_KIND = 2000;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string').slice(0, MAX_HIDDEN_PER_KIND);
}

/** Accepts only known fields with the right types; anything else falls back to defaults. */
export function sanitizeSettings(raw: unknown): PreviewSettings {
  if (!isRecord(raw)) return DEFAULT_SETTINGS;
  const hidden = isRecord(raw.hidden) ? raw.hidden : {};
  return {
    handle: typeof raw.handle === 'string' ? raw.handle.slice(0, HANDLE_MAX_LENGTH + 1) : DEFAULT_SETTINGS.handle,
    showDescriptions: typeof raw.showDescriptions === 'boolean' ? raw.showDescriptions : DEFAULT_SETTINGS.showDescriptions,
    scanlines: typeof raw.scanlines === 'boolean' ? raw.scanlines : DEFAULT_SETTINGS.scanlines,
    hidden: Object.fromEntries(HIDDEN_KINDS.map((kind) => [kind, stringList(hidden[kind])])) as Record<HiddenKind, string[]>,
  };
}

export function loadSettings(): PreviewSettings {
  try {
    const stored = window.localStorage.getItem(SETTINGS_KEY);
    return stored ? sanitizeSettings(JSON.parse(stored)) : DEFAULT_SETTINGS;
  } catch (error: unknown) {
    console.warn('[harness-craft] 저장된 공개 설정을 읽지 못해 기본값을 씁니다.', error);
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: PreviewSettings): void {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error: unknown) {
    console.warn('[harness-craft] 공개 설정을 저장하지 못했습니다. 이 탭에서는 계속 동작합니다.', error);
  }
}

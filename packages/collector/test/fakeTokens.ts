/**
 * Token-shaped test values, assembled at runtime so no literal in the repository matches a secret
 * scanner (GitHub push protection etc.). Fixture files hold only the `__FAKE_*__` placeholders.
 */
export const FAKE_GHP = 'gh' + 'p_' + 'x'.repeat(36);
export const FAKE_SK = 'sk' + '-test' + 'X'.repeat(24);
export const FAKE_SK_PLAIN = 'sk' + '-' + 'abcdefghijklmnop1234';
export const FAKE_GHP_SHORT = 'gh' + 'p_' + 'abcdefghijklmnopqrstu12';
export const FAKE_GITHUB_PAT = 'github' + '_pat_' + 'abcdefghijklmnopqrstuvwx';
export const FAKE_SLACK = 'xo' + 'xb-' + '1234567890-abc';
export const FAKE_AWS = 'AK' + 'IA' + 'ABCDEFGHIJKLMNOP';

/** Placeholder -> value substituted into the copied fixture home. */
export const FIXTURE_PLACEHOLDERS: Readonly<Record<string, string>> = {
  __FAKE_GHP__: FAKE_GHP,
  __FAKE_SK__: FAKE_SK,
};

// 1. IMPORTS: Jest utilities and the functions of the README sync script (plain ESM, no build step).
import { describe, it, expect } from '@jest/globals';
import { syncIncludes, adaptForReadme, assertSafeIncludePath } from '../scripts/sync-readme.mjs';

describe('README sync (scripts/sync-readme.mjs)', () => {
  // A README with one include region, as in the "Security Policies" section.
  const readme = [
    '## Security Policies',
    '',
    '<!-- md:include start path="SECURITY.md" -->',
    'old copy that must be replaced',
    '<!-- md:include end -->',
    ''
  ].join('\n');

  // TEST 1: Verify the region between the markers is replaced by the file, with its headings nested.
  // Condition: SECURITY.md starts with a level-1 heading; inside README's level-2 section it becomes
  // level 3. Running the sync a second time must not change the result.
  it('replaces the include region and moves the copied headings two levels down', () => {
    const files: Record<string, string> = { 'SECURITY.md': '# Security Policy\r\n\r\n## Scope\r\nText.\r\n' };

    const once = syncIncludes(readme, (file: string) => files[file] as string);
    const twice = syncIncludes(once, (file: string) => files[file] as string);

    expect(once).toContain(
      '<!-- md:include start path="SECURITY.md" -->\n\n### Security Policy\n\n#### Scope\nText.\n\n<!-- md:include end -->'
    );
    expect(once).not.toContain('old copy');
    expect(twice).toBe(once);
  });

  // TEST 2: Verify relative links of a file in a subfolder still work from the repository root.
  // Condition: A link in docs/security/remediation-log.md to "../adr/0001.md" must point to
  // "docs/adr/0001.md"; web links, anchors and headings inside code fences stay as they are.
  it('rewrites relative links from the copied file folder and leaves code fences alone', () => {
    const source = [
      'See [ADR 0001](../adr/0001.md), [OWASP](https://owasp.org) and [above](#scope).',
      '```',
      '# not a heading',
      '```'
    ].join('\n');

    const adapted = adaptForReadme(source, 'docs/security/remediation-log.md');

    expect(adapted).toContain('[ADR 0001](docs/adr/0001.md)');
    expect(adapted).toContain('[OWASP](https://owasp.org)');
    expect(adapted).toContain('[above](#scope)');
    expect(adapted).toContain('```\n# not a heading\n```');
  });

  // TEST 3: Verify the sync refuses to copy anything but a Markdown file inside the repository.
  // Condition: README.md is public, so a marker naming .env, a parent folder or an absolute path must
  // stop the sync instead of publishing that file.
  it('refuses paths outside the repository and files that are not Markdown', () => {
    for (const unsafe of ['.env', '../outside.md', '/etc/passwd.md', 'docs\\..\\..\\secret.md', '']) {
      expect(() => assertSafeIncludePath(unsafe)).toThrow('md:include refuses the path');
    }
    expect(assertSafeIncludePath('docs/security/remediation-log.md')).toBe('docs/security/remediation-log.md');
  });
});

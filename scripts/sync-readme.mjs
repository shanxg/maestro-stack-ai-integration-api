/**
 * 📄 README SYNC: copies other Markdown files of this repository into README.md.
 *
 * README.md marks each copied region with a pair of HTML comments, which GitHub does not render:
 *
 *   <!-- md:include start path="SECURITY.md" -->
 *   ...everything here is replaced on every run...
 *   <!-- md:include end -->
 *
 * The workflow .github/workflows/sync-readme.yml runs this script whenever one of the copied files
 * changes on main, and commits README.md if the copy changed. Running it locally does the same:
 *   node scripts/sync-readme.mjs
 *
 * It replaces the third-party "readme-weaver" action: the job needs permission to push to the
 * repository, so the code it runs lives here, where it is reviewed like the rest of the project,
 * instead of in an external action that could change under the same tag.
 */

// 1. IMPORTS: Node's file system and path helpers only, so the workflow needs no `npm install`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The markers in README.md. The start marker names the file to copy, relative to the repository root.
const INCLUDE_BLOCK = /(<!-- md:include start path="([^"]*)" -->)[\s\S]*?(<!-- md:include end -->)/g;

// How many levels the copied headings move down. README's "## Security Policies" section is a level-2
// heading, so a copied "# Title" becomes "### Title" and stays nested under it.
const HEADING_SHIFT = 2;

/**
 * Only Markdown files inside the repository may be copied. The README is public, so a marker that
 * named a file such as `.env` or `../something` must never put that file's content there.
 */
export function assertSafeIncludePath(includePath) {
  const normalized = path.posix.normalize(includePath);
  const isInsideRepository = !path.posix.isAbsolute(normalized) && !normalized.startsWith('..');
  if (!includePath || !isInsideRepository || !normalized.endsWith('.md') || normalized.includes('\\')) {
    throw new Error(`md:include refuses the path "${includePath}": use a .md file inside the repository`);
  }
  return normalized;
}

/**
 * Prepare a copied file for its new place in README.md:
 * - headings move HEADING_SHIFT levels down (up to level 6), so the README keeps one outline;
 * - relative links and images are rewritten from the copied file's folder, so they still work from
 *   the repository root (README's folder). Absolute URLs, anchors and root-relative links stay as they are.
 * Lines inside fenced code blocks (``` or ~~~) are copied unchanged.
 */
export function adaptForReadme(markdown, includePath) {
  const folder = path.posix.dirname(includePath);
  let fence = null;

  return markdown
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      const fenceMatch = line.match(/^\s*(```|~~~)/);
      if (fenceMatch) {
        fence = fence === null ? fenceMatch[1] : fence === fenceMatch[1] ? null : fence;
        return line;
      }
      if (fence !== null) return line;

      const shifted = line.replace(
        /^(#{1,6})(\s)/,
        (_match, hashes, space) => '#'.repeat(Math.min(hashes.length + HEADING_SHIFT, 6)) + space
      );

      if (folder === '.') return shifted;
      return shifted.replace(/(!?\[[^\]]*\]\()([^)\s]+)/g, (match, prefix, target) =>
        /^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(target) ? match : prefix + path.posix.join(folder, target)
      );
    })
    .join('\n')
    .trim();
}

/**
 * Return README.md with every include region refreshed. `readFile` receives the checked relative path
 * and returns that file's text, which keeps this function free of disk access for the tests.
 */
export function syncIncludes(readme, readFile) {
  return readme.replace(INCLUDE_BLOCK, (_block, startMarker, includePath, endMarker) => {
    const safePath = assertSafeIncludePath(includePath);
    // Blank lines around the copy let GitHub render it as Markdown, also inside <details>.
    return `${startMarker}\n\n${adaptForReadme(readFile(safePath), safePath)}\n\n${endMarker}`;
  });
}

// 2. COMMAND LINE: runs only when the file is executed (node scripts/sync-readme.mjs), not when the
// tests import the functions above.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const readmePath = path.join(root, 'README.md');

  const original = fs.readFileSync(readmePath, 'utf8');
  // syncIncludes() hands the reader only paths it has already checked (a .md file inside the
  // repository, see assertSafeIncludePath above), so this non-literal path is safe to read.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const updated = syncIncludes(original, (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8'));

  if (updated === original) {
    console.log('README.md is already in sync.');
  } else {
    fs.writeFileSync(readmePath, updated);
    console.log('README.md updated from its md:include files.');
  }
}

// 1. IMPORTS: Node's file system helpers to read the versioned prompt files.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * 📝 VERSIONED PROMPTS (issue #59)
 *
 * Prompts live in prompts/ at the repository root, one Markdown file each, instead of string
 * literals inside the code. A change to what the model is told is then a reviewed diff of its
 * own, with a version number that the start-up log and the tests can point to.
 *
 * File format: a front matter block between two '---' lines with 'key: value' pairs, then the
 * prompt text. 'id' (equal to the file name) and 'version' (MAJOR.MINOR.PATCH) are required.
 */
export type PromptFile = {
  id: string;
  version: string;
  // Every front matter field, as written, including id and version.
  metadata: Record<string, string>;
  // The prompt itself: the text after the front matter, with Unix line endings and no outer blank lines.
  text: string;
};

// prompts/ seen from this module: src/ai/ when run with tsx or Jest, dist/ai/ after the build.
// Both are two levels below the repository root, so the same relative URL works for both.
const PROMPTS_DIRECTORY = new URL('../../prompts/', import.meta.url);

const VERSION_FORMAT = /^\d+\.\d+\.\d+$/;
// Lowercase letters, digits and hyphens only: the id becomes part of a file path.
const ID_FORMAT = /^[a-z0-9-]+$/;

/**
 * Parses the text of one prompt file. Throws an Error naming the file and the problem, so a
 * broken prompt stops the API at start-up instead of reaching the model.
 *
 * @param source The file content.
 * @param fileId The file name without '.md'; the front matter 'id' must match it.
 */
export function parsePromptFile(source: string, fileId: string): PromptFile {
  // Windows checkouts may have CRLF line endings; the model must get the same text everywhere.
  const normalized = source.replace(/\r\n/g, '\n');
  const fail = (problem: string): never => {
    throw new Error(`Invalid prompt file prompts/${fileId}.md: ${problem}`);
  };

  // Step A: Split the front matter from the prompt text.
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(normalized);
  if (!match) return fail("it must start with a front matter block between two '---' lines");
  const [, header = '', body = ''] = match;

  // Step B: Read the 'key: value' lines into a Map (no object keys built from file content).
  // Blank lines are skipped; anything else is an error.
  const fields = new Map<string, string>();
  for (const line of header.split('\n')) {
    if (!line.trim()) continue;
    const field = /^([a-z][a-z-]*):\s*(.+)$/.exec(line);
    if (!field) return fail(`front matter line is not 'key: value': ${line}`);
    const [, key = '', value = ''] = field;
    fields.set(key, value.trim());
  }

  // Step C: Check the required fields and the text.
  const id = fields.get('id') ?? fail("missing 'id'");
  if (id !== fileId) fail(`'id' is "${id}" but the file is ${fileId}.md`);
  const version = fields.get('version') ?? fail("missing 'version'");
  if (!VERSION_FORMAT.test(version)) fail(`'version' must be MAJOR.MINOR.PATCH, got "${version}"`);
  const text = body.trim();
  if (!text) fail('the prompt text after the front matter is empty');

  return { id, version, metadata: Object.fromEntries(fields), text };
}

/**
 * Reads and parses prompts/<id>.md. Read synchronously on purpose: callers load their prompt once,
 * while the app is being built, before the server accepts any request.
 */
export function loadPrompt(id: string): PromptFile {
  if (!ID_FORMAT.test(id)) {
    // The id becomes part of a file path, so only plain names are accepted (no '../').
    throw new Error(`Invalid prompt id "${id}"`);
  }
  const fileUrl = new URL(`${id}.md`, PROMPTS_DIRECTORY);
  // The path is built from a checked id inside prompts/, never from request input.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const source = fs.readFileSync(fileURLToPath(fileUrl), 'utf8');
  return parsePromptFile(source, id);
}

// 1. IMPORTS: Jest utilities, the YAML parser and Node's file and path helpers.
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { describe, it, expect } from '@jest/globals';

// The parts of a GitHub Actions workflow this suite reads. A permissions block is either a map of
// scopes ("contents: read") or one of the shorthand strings "read-all" and "write-all".
type Permissions = string | Record<string, string>;
type Step = { uses?: string };
type Job = { permissions?: Permissions; uses?: string; steps?: Step[] };
type Workflow = { permissions?: Permissions; jobs: Record<string, Job> };

const WORKFLOWS_DIR = '.github/workflows';

// Owners whose actions are maintained by GitHub itself. CodeQL's actions/unpinned-tag rule (and this
// suite) accepts their major-version tags; every other action must be pinned to a commit SHA.
const GITHUB_OWNED = new Set(['actions', 'github']);

// A full Git commit SHA: 40 hexadecimal characters. A tag or branch name can be moved, a SHA cannot.
const COMMIT_SHA = /^[0-9a-f]{40}$/;

// Every workflow file, parsed, with its file name for the failure messages.
function loadWorkflows(): Array<{ file: string; workflow: Workflow }> {
  return fs
    .readdirSync(WORKFLOWS_DIR)
    .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
    .map((file) => ({
      file,
      workflow: yaml.load(fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8')) as Workflow
    }));
}

// True when a permissions block grants write access to any scope.
function grantsWrite(permissions: Permissions): boolean {
  if (typeof permissions === 'string') return permissions === 'write-all';
  return Object.values(permissions).includes('write');
}

describe('GitHub Actions workflows (.github/workflows)', () => {
  // TEST 1: Verify every workflow declares a read-only default token (CWE-250, issue #143).
  // Condition: without a top-level permissions block, the GITHUB_TOKEN gets the repository default,
  // a setting outside code review; write access must be granted per job, only where a job needs it.
  it('declares read-only token permissions at the top of every workflow', () => {
    const workflows = loadWorkflows();
    expect(workflows.length).toBeGreaterThan(0);

    const problems = workflows.flatMap(({ file, workflow }) => {
      if (workflow.permissions === undefined) return [`${file}: no top-level permissions block`];
      if (grantsWrite(workflow.permissions)) return [`${file}: the top-level permissions grant write access`];
      return [];
    });

    expect(problems).toEqual([]);
  });

  // TEST 2: Verify every third-party action is pinned to a commit SHA (CWE-829, issue #143).
  // Condition: a tag such as "@v3" can be moved by whoever controls the action's repository, which
  // would change the code this repository's workflows run (with their token) without any review here.
  it('pins every third-party action to a full commit SHA', () => {
    const references = loadWorkflows().flatMap(({ file, workflow }) =>
      Object.values(workflow.jobs).flatMap((job) =>
        // A job either calls a reusable workflow (job.uses) or runs steps, which may use actions.
        [job.uses, ...(job.steps ?? []).map((step) => step.uses)]
          .filter((uses): uses is string => uses !== undefined)
          .map((uses) => ({ file, uses }))
      )
    );
    expect(references.length).toBeGreaterThan(0);

    const unpinned = references.filter(({ uses }) => {
      // Local actions ("./path") are code in this repository, and Docker images are covered by Dependabot.
      if (uses.startsWith('./') || uses.startsWith('docker://')) return false;
      const [name = '', ref = ''] = uses.split('@');
      const owner = name.split('/')[0] ?? '';
      return !GITHUB_OWNED.has(owner) && !COMMIT_SHA.test(ref);
    });

    expect(unpinned).toEqual([]);
  });
});

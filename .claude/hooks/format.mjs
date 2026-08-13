#!/usr/bin/env node
/**
 * PostToolUse hook — formats the single file that was just edited.
 *
 * Kills format-noise commits at the source: every diff is a behavior diff.
 * Reads the hook payload from stdin, pulls `tool_input.file_path`, and runs
 * prettier --write then eslint --fix on it. Silent on success; never blocks
 * the tool call, because a formatter failure is not a reason to stop work.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const FORMATTABLE = new Set(['.ts', '.tsx', '.js', '.mjs', '.jsx', '.json', '.css', '.md']);
const LINTABLE = new Set(['.ts', '.tsx', '.js', '.mjs', '.jsx']);

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
};

const run = (args, file) => {
  try {
    execFileSync('pnpm', ['exec', ...args, file], { stdio: 'ignore', shell: process.platform === 'win32' });
  } catch {
    // A formatter/linter that can't parse a half-written file is expected noise.
  }
};

const raw = await readStdin();
if (!raw.trim()) process.exit(0);

let filePath;
try {
  filePath = JSON.parse(raw)?.tool_input?.file_path;
} catch {
  process.exit(0);
}
if (!filePath) process.exit(0);

// Generated Prisma clients and migrations are never hand-formatted.
const normalized = filePath.replaceAll('\\', '/');
if (normalized.includes('/generated/') || normalized.includes('/migrations/')) process.exit(0);
if (!existsSync(filePath)) process.exit(0);

const ext = path.extname(filePath);
if (FORMATTABLE.has(ext)) run(['prettier', '--write', '--log-level', 'silent'], filePath);
if (LINTABLE.has(ext)) run(['eslint', '--fix', '--no-warn-ignored'], filePath);

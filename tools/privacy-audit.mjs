#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const checks = [
  ['absolute Windows user path', /\b[A-Z]:[\\/]+Users[\\/]+(?!(?:YOUR_USER|USERNAME)(?:[\\/]|$))[^\\/\s"'`<>]+/gi],
  ['absolute Unix user path', /\/(?:Users|home)\/[A-Za-z0-9._-]+(?:\/[^\s"'`<>]+)+/g],
  ['private key material', /-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----/g],
  ['credential-like assignment', /\b(?:api[_-]?key|client[_-]?secret|app[_-]?secret|access[_-]?token|refresh[_-]?token|bridge[_-]?secret|bootstrap[_-]?hash)\b["']?\s*[:=]\s*(?:["'](?!test-|fixture-|YOUR_|EXAMPLE_)[^"'\r\n]{12,}["']|[A-Za-z0-9_-]{20,}(?=[\r\n]|$))/gi],
  ['secret token prefix', /\b(?:sk-(?:proj-)?|rk-|gh[pousr]_|github_pat_|xox[baprs]-|AKIA)[A-Za-z0-9_-]{12,}\b/g]
];
const strictChecks = [
  ['WeChat deployment identifier', /\b(?:wx[a-f0-9]{16}|gh_[a-f0-9]{12}|cloud[0-9]+-[a-z0-9]{8,})\b/gi],
  ['Cloudflare tunnel identifier', /\b[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}\.cfargotunnel\.com\b/gi],
  ['named tunnel or dynamic public domain', /\b[a-z0-9-]+\.(?:dpdns\.org|duckdns\.org|trycloudflare\.com)\b/gi]
];
const forbiddenParts = new Set(['.git', '.local', '.codex', '.cloudflared', 'node_modules', 'cloudflared-config.yml', 'project.private.config.json']);
const findings = [];
let scanned = 0;

function git(root, args, encoding = 'utf8') {
  return execFileSync('git', ['-C', root, ...args], {
    encoding,
    maxBuffer: 128 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore']
  });
}

function find(file, label, line = 0, revision = '') {
  findings.push({ file, label, line, revision });
}

function forbidden(path) {
  return path.toLowerCase().split(/[\\/]/).some(part => forbiddenParts.has(part)
    || (part !== '.env.example' && /^\.env(?:\.|$)/.test(part))
    || /\.(?:log|db(?:-.+)?|sqlite3?(?:-.+)?|bak|tmp|pem|key|pfx|p12)$/.test(part));
}

function scan(file, content, strict, revision) {
  scanned++;
  const prefix = content.subarray(0, 2).toString('hex');
  let source;
  if (prefix === 'fffe') source = content.subarray(2).toString('utf16le');
  else if (prefix === 'feff') source = new TextDecoder('utf-16be').decode(content);
  else if (!content.subarray(0, 65536).includes(0)) source = content.toString('utf8');
  else return;
  for (const [label, expression] of strict ? [...checks, ...strictChecks] : checks) {
    for (const match of source.matchAll(expression)) {
      const line = source.slice(0, match.index).split('\n').length;
      find(file, label, line, revision);
    }
  }
}

function scanPath(root, name, strict, missingAllowed = false) {
  if (forbidden(name)) {
    find(name, 'local data or credential file');
    return;
  }
  const file = join(root, name);
  let entry;
  try {
    entry = lstatSync(file);
  } catch (error) {
    if (missingAllowed && error.code === 'ENOENT') return;
    throw error;
  }
  if (entry.isSymbolicLink()) find(name, 'symbolic link');
  else if (entry.isDirectory()) {
    for (const child of readdirSync(file)) scanPath(root, join(name, child), strict);
  } else if (entry.isFile()) scan(name, readFileSync(file), strict);
  else find(name, 'non-regular file');
}

function scanRange(root, range, strict) {
  const commits = git(root, ['rev-list', '--reverse', range, '--']).trim().split(/\s+/).filter(Boolean);
  for (const revision of commits) {
    const entries = git(root, [
      'diff-tree', '--root', '-m', '--no-commit-id', '--no-renames', '--no-abbrev', '--raw',
      '--diff-filter=ACMT', '-r', '-z', revision, '--'
    ]).split('\0');
    const seen = new Set();
    for (let i = 0; i < entries.length - 1; i += 2) {
      const [, mode, , blob] = entries[i].split(' ');
      const file = entries[i + 1];
      const key = file + '\0' + blob;
      if (seen.has(key)) continue;
      seen.add(key);
      if (forbidden(file)) find(file, 'local data or credential file', 0, revision);
      else if (!['100644', '100755'].includes(mode)) find(file, 'non-regular file', 0, revision);
      else scan(file, git(root, ['cat-file', 'blob', blob], 'buffer'), strict, revision);
    }
  }
  return commits.length;
}

function main(args) {
  const strict = args.includes('--strict');
  const options = args.filter(arg => arg !== '--strict');
  let commits;
  if (options[0] === '--range' && options.length === 2 && /^[^-\s][^\s]*\.\.[^.\s][^\s]*$/.test(options[1])) {
    commits = scanRange(process.cwd(), options[1], strict);
  } else if (options.length === 1 && !options[0].startsWith('-')) {
    const root = resolve(options[0]);
    if (!lstatSync(root).isDirectory()) throw new Error('Expected a staging directory.');
    for (const file of readdirSync(root)) scanPath(root, file, strict);
    if (!scanned && !findings.length) throw new Error('Staging directory is empty.');
  } else if (!options.length) {
    const root = git(process.cwd(), ['rev-parse', '--show-toplevel']).trim();
    const files = git(root, ['ls-files', '-co', '--exclude-standard', '-z']).split('\0').filter(Boolean);
    for (const name of new Set(files)) scanPath(root, name, strict, true);
  } else {
    throw new Error('Usage: node tools/privacy-audit.mjs [--strict] [staging-dir | --range BASE..HEAD]');
  }

  if (findings.length) {
    console.error('Privacy audit found ' + findings.length + ' finding(s):');
    for (const {file, line, label, revision} of findings) {
      const location = JSON.stringify(file) + (line ? ':' + line : '');
      const source = revision ? ' (' + revision.slice(0, 8) + ')' : '';
      console.error('- ' + location + source + ' [' + label + ']');
    }
    process.exitCode = 1;
  } else {
    const rangeSummary = commits === undefined ? '' : ' across ' + commits + ' commit(s)';
    console.log('Privacy audit passed' + (strict ? ' (strict mode)' : '') + ': ' + scanned + ' file(s) scanned' + rangeSummary + '.');
  }
}

try {
  main(process.argv.slice(2));
} catch {
  console.error('Privacy audit could not read the repository, requested Git range or staging directory.');
  console.error('Usage: node tools/privacy-audit.mjs [--strict] [staging-dir | --range BASE..HEAD]');
  process.exitCode = 2;
}

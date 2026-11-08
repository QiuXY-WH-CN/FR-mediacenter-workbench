#!/usr/bin/env node

/**
 * Check the files that would be included in a Git-based release for
 * machine paths, credentials and other identity-bearing values.
 *
 * Usage:
 *   node tools/privacy-audit.mjs
 *   node tools/privacy-audit.mjs --strict path/to/staging
 *
 * The default scan follows Git's tracked + untracked-but-not-ignored file
 * list, so .local/, databases and other local runtime data are excluded by
 * .gitignore. Pass a directory to audit a release staging directory instead.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const requestedRoot = args.find((arg) => !arg.startsWith('--'));
const root = resolve(requestedRoot || process.cwd());

const textExtensions = new Set([
  '.c', '.cc', '.cmd', '.config', '.css', '.csv', '.env', '.html', '.ini',
  '.js', '.json', '.md', '.mjs', '.ps1', '.py', '.sh', '.sql', '.ts', '.tsx',
  '.txt', '.wxml', '.wxss', '.xml', '.yaml', '.yml'
]);

const checks = [
  {
    label: 'absolute Windows user path',
    expression: /[A-Za-z]:[\\/]Users[\\/](?!(?:YOUR_USER|USERNAME)(?:[\\/]|$))[^\\/\s"'`<>]+/g
  },
  {
    label: 'absolute Unix user path',
    expression: /\/(?:Users|home)\/[A-Za-z0-9._-]+(?:\/[^\s"'`<>]+)+/g
  },
  {
    label: 'private key material',
    expression: /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/g
  },
  {
    label: 'credential-like assignment',
    expression: /\b(?:api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token)\b\s*[:=]\s*["'][^"']{12,}["']/gi
  },
  {
    label: 'high-entropy secret prefix',
    expression: /\b(?:sk|rk|ghp|github_pat|xox[baprs])-[A-Za-z0-9_-]{12,}\b/g
  }
];

const strictChecks = [
  {
    label: 'WeChat app identifier',
    expression: /\bwx[0-9a-f]{16,}\b/gi
  },
  {
    label: 'named tunnel or dynamic public domain',
    expression: /\b(?:[a-z0-9-]+\.(?:dpdns|duckdns)\.org|[a-z0-9-]+\.trycloudflare\.com)\b/gi
  }
];

function gitFiles() {
  try {
    const output = execFileSync('git', ['-C', root, 'ls-files', '-co', '--exclude-standard', '-z'], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024
    });
    return output.split('\0').filter(Boolean).map((file) => resolve(root, file));
  } catch {
    return [];
  }
}

function fallbackFiles(directory) {
  const files = [];
  function walk(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const file = join(current, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) files.push(resolve(file));
    }
  }
  walk(directory);
  return files;
}

function filesToScan() {
  if (requestedRoot) {
    try {
      return fallbackFiles(root);
    } catch {
      return [];
    }
  }
  return gitFiles();
}

function lineNumber(content, offset) {
  return content.slice(0, offset).split('\n').length;
}

const files = filesToScan();
const findings = [];
for (const file of files) {
  if (!existsSync(file) || !statSync(file).isFile()) continue;
  if (!textExtensions.has(file.slice(file.lastIndexOf('.')).toLowerCase())) continue;
  if (statSync(file).size > 2 * 1024 * 1024) continue;
  const content = readFileSync(file, 'utf8');
  if (content.includes('\0')) continue;
  const fileChecks = strict ? [...checks, ...strictChecks] : checks;
  for (const check of fileChecks) {
    check.expression.lastIndex = 0;
    let match;
    while ((match = check.expression.exec(content)) !== null) {
      findings.push({
        file: relative(root, file) || file,
        line: lineNumber(content, match.index),
        label: check.label,
        sample: match[0].length > 100 ? `${match[0].slice(0, 97)}...` : match[0]
      });
      if (!check.expression.global) break;
    }
  }
}

if (findings.length) {
  console.error(`Privacy audit found ${findings.length} finding(s)${strict ? ' (strict mode)' : ''}:`);
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} [${finding.label}] ${finding.sample}`);
  }
  console.error('\nRemove the value, move it to ignored local configuration, or document an explicit release-safe allowlist.');
  process.exitCode = 1;
} else {
  console.log(`Privacy audit passed${strict ? ' (strict mode)' : ''}: ${files.length} file(s) scanned.`);
}

#!/usr/bin/env node
/** aios cred — manage browser MCP credentials in macOS Keychain

    Passwords are sent to Python via stdin JSON (never command-line arguments)
    to avoid shell interpolation issues and prevent password exposure in ps output.
*/

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function python(expr, stdinObj = null) {
  const args = ['-c', expr];
  const opts = { encoding: 'utf-8' };
  if (stdinObj !== null) {
    opts.input = JSON.stringify(stdinObj);
  }
  const result = spawnSync('python3', args, opts);
  if (result.error) throw result.error;
  if (result.stderr) process.stderr.write(result.stderr);
  return result.stdout.trim();
}

function error(msg) { process.stderr.write(`error: ${msg}\n`); process.exit(1); }

const cmd = process.argv[2];
const args = process.argv.slice(3);

function requireArgs(n, usage) {
  if (args.length < n) error(`Usage: aios cred ${cmd} ${usage}`);
}

switch (cmd) {
  case 'set': {
    requireArgs(3, '<site> <account> <password>');
    const [site, account, password] = args;
    const stdout = python(`
import sys, json
sys.path.insert(0, ${JSON.stringify(__dirname)})
from lib.credentials import set_credential
data = json.loads(sys.stdin.read())
set_credential(data["site"], data["account"], data["password"])
print("ok")
`, { site, account, password });
    console.log(stdout || 'ok');
    break;
  }
  case 'get': {
    requireArgs(1, '<site> [account]');
    const [site, account = 'default'] = args;
    const password = python(`
import sys, json
sys.path.insert(0, ${JSON.stringify(__dirname)})
from lib.credentials import get_password
print(get_password(${JSON.stringify(site)}, ${JSON.stringify(account)}))
`);
    console.log(password);
    break;
  }
  case 'list': {
    const stdout = python(`
import sys, json
sys.path.insert(0, ${JSON.stringify(__dirname)})
from lib.credentials import list_sites
entries = list_sites()
print(json.dumps(entries, indent=2, ensure_ascii=False))
`);
    console.log(stdout || '[]');
    break;
  }
  case 'delete': {
    requireArgs(1, '<site> [account]');
    const [site, account = 'default'] = args;
    python(`
import sys
sys.path.insert(0, ${JSON.stringify(__dirname)})
from lib.credentials import delete_credential
delete_credential(${JSON.stringify(site)}, ${JSON.stringify(account)})
print("deleted")
`);
    console.log('deleted');
    break;
  }
  case 'set-username': {
    requireArgs(2, '<site> <username>');
    const [site, username] = args;
    python(`
import sys
sys.path.insert(0, ${JSON.stringify(__dirname)})
from lib.credentials import set_username
set_username(${JSON.stringify(site)}, "default", ${JSON.stringify(username)})
print("ok")
`);
    console.log('ok');
    break;
  }
  default:
    error(`unknown subcommand: ${cmd}\nUsage: aios cred <set|get|list|delete|set-username>`);
}

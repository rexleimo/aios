/* 中文注释：memo 解析保留透传语义，让 memo 子系统自行解释业务参数。 */
export function parseMemoArgs(argv) {
  const rest = argv.slice(1);
  let help = false;
  const passthrough = [];

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--') {
      passthrough.push(...rest.slice(index + 1));
      break;
    }
    if (arg === '-h' || arg === '--help' || arg === 'help') {
      help = true;
      continue;
    }
    passthrough.push(arg);
  }

  return {
    mode: help ? 'help' : 'command',
    help,
    command: 'memo',
    options: {
      argv: passthrough,
    },
  };
}

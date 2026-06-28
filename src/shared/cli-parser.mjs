// src/shared/cli-parser.mjs — 统一 CLI 参数解析工厂
// 目标：消除所有独立脚本中的手写 parseArgs 循环
// 基于 Commander ^14，为每个脚本创建声明式 CLI 解析器
import { Command } from 'commander';

/**
 * @typedef {Object} CliParserOptions
 * @property {string} name - 脚本名称
 * @property {string} [description] - 描述
 * @property {string} [version] - 版本号
 * @property {Array<{name: string, description: string, options?: Array<[string, string]>, action?: Function}>} [subcommands] - 子命令
 * @property {Array<[string, string]>} [options] - 全局选项
 * @property {string} [helpText] - 额外帮助文本（追加到自动生成的 help 之后）
 * @property {Object} [envDefaults] - 环境变量默认值 { key: { env: 'ENV_VAR', default: value } }
 */

/**
 * 创建轻量 CLI 解析器。
 *
 * 返回 { parse(argv): { command, args, flags, help, version, helpText } }
 * - command: 子命令字符串（如有）
 * - args: 剩余位置参数
 * - flags: 已解析的 options 对象
 * - help: boolean，用户请求帮助
 * - version: boolean，用户请求版本
 * - helpText: 帮助文本（仅 help=true 时）
 *
 * @param {CliParserOptions} spec
 */
export function createCliParser(spec = {}) {
  const program = new Command()
    .name(spec.name || 'cli')
    .description(spec.description || '')
    .helpOption(false)
    .exitOverride();

  if (spec.version) {
    program.version(spec.version, '-V, --version', 'Print version');
  }

  if (spec.subcommands && spec.subcommands.length > 0) {
    for (const sub of spec.subcommands || []) {
      const cmd = program
        .command(sub.name)
        .description(sub.description || '')
        .helpOption(false)
        .allowUnknownOption(true)
        .allowExcessArguments(true)
        .argument('[args...]');

      for (const [flags, desc] of sub.options || []) {
        cmd.option(flags, desc || '');
      }

      if (sub.action) {
        cmd.action(sub.action);
      }
    }
  } else {
    for (const [flags, desc] of spec.options || []) {
      program.option(flags, desc || '');
    }
    program.allowUnknownOption(true).allowExcessArguments(true).argument('[args...]');
  }

  /**
   * 解析 argv 数组。
   */
  function parse(argv = []) {
    const result = {
      command: '',
      args: [],
      flags: {},
      help: false,
      version: false,
    };

    // 空参数或顶层 help
    if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help' || argv[0] === 'help') {
      if (argv.length === 0 && spec.envDefaults) {
        try {
          const parsed = program.parse(['--'], { from: 'user' });
          const base = parsed.opts ? { ...parsed.opts() } : {};
          for (const [key, { env, default: defVal }] of Object.entries(spec.envDefaults)) {
            if (base[key] === undefined || base[key] === null) {
              const envVal = process.env[env];
              base[key] = envVal !== undefined ? coerceValue(envVal) : defVal;
            }
          }
          result.flags = base;
          return result;
        } catch {
          // fall through to help
        }
      }
      result.help = true;
      return result;
    }

    if (spec.version && (argv[0] === '-V' || argv[0] === '--version' || argv[0] === 'version')) {
      result.version = true;
      result.flags = { version: spec.version };
      return result;
    }

    try {
      // 检测子命令 help：argv = ['subcmd', '--help'] 或 ['subcmd', '-h']
      if (spec.subcommands && argv[1] && (argv[1] === '-h' || argv[1] === '--help')) {
        const subName = String(argv[0]).trim();
        if (spec.subcommands.some((s) => s.name === subName)) {
          result.help = true;
          return result;
        }
      }

      const parsed = program.parse(argv, { from: 'user' });

      // 提取子命令
      let subName = '';
      let cmdObj = parsed;
      for (const arg of parsed.args || []) {
        const a = String(arg || '');
        if (!a.startsWith('-')) {
          subName = a;
          break;
        }
      }
      if (subName) {
        cmdObj = parsed.commands?.find((c) => c.name() === subName) || parsed;
      }

      // 子命令 help 检测
      if (subName && (parsed.args.includes('-h') || parsed.args.includes('--help'))) {
        result.help = true;
        return result;
      }

      result.command = subName;
      result.args = (parsed.args || []).filter(
        (a) => !['-h', '--help', 'help'].includes(a) && !String(a).startsWith('-'),
      );
      result.flags = cmdObj.opts ? { ...cmdObj.opts() } : {};
      result.help = !subName && parsed.args && parsed.args.includes('help');

      // 应用环境变量默认值
      if (spec.envDefaults) {
        for (const [key, { env, default: defVal }] of Object.entries(spec.envDefaults)) {
          if (result.flags[key] === undefined || result.flags[key] === null) {
            const envVal = process.env[env];
            result.flags[key] = envVal !== undefined ? coerceValue(envVal) : defVal;
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // 未知命令/help 请求 → 回退到顶层 help
      result.help = true;
      return result;
    }

    return result;
  }

  return { parse, program };
}

function coerceValue(value) {
  if (value === 'true' || value === '1' || value === 'yes') return true;
  if (value === 'false' || value === '0' || value === 'no') return false;
  const num = Number(value);
  if (Number.isFinite(num)) return num;
  return value;
}

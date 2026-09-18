// scripts/lib/judgment/cli.mjs — `aios judgment` 命令实现。
//
// 输出纪律与其他命令一致：文本模式说清"下一步你要做什么"，JSON 模式给机器断言。
// 关键行为：disable 之后不存在任何"回退到默认放行"的路径。
import { readFileSync } from 'node:fs';
import {
  applyVendorOverride,
  readJudgmentConfig,
  resolveJudgmentConfigPath,
  resolveVendorConfig,
  writeJudgmentConfig,
} from './config.mjs';
import { JUDGMENT_VENDORS, askJudgment, createJudgmentSession, hasCredential, resolveVendor } from './jev-client.mjs';
import { RISK_CLASSES, judgeVerdict } from './verdict.mjs';

function readMaybeFile(value) {
  const raw = String(value ?? '');
  if (!raw.startsWith('@')) return raw;
  return readFileSync(raw.slice(1), 'utf8');
}

function parseQuestionsOption(value) {
  const raw = readMaybeFile(value).trim();
  if (!raw) throw new Error('--questions requires a JSON object or @path/to/questions.json');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`--questions is not valid JSON: ${error.message}`);
  }
  return parsed;
}

function vendorList() {
  return Object.keys(JUDGMENT_VENDORS);
}

function buildStatusReport({ env, configPath, homeDir }) {
  const loaded = readJudgmentConfig({ configPath, env, homeDir });
  const vendors = vendorList().map((vendor) => {
    const entry = resolveVendor(vendor);
    const vendorConfig = resolveVendorConfig(loaded.config, vendor);
    return {
      vendor,
      displayName: entry.displayName,
      enabled: vendorConfig.enabled === true,
      credentialEnvVar: entry.credentialEnvVar,
      credentialPresent: hasCredential(entry, env),
      model: vendorConfig.model,
      actFloor: vendorConfig.actFloor,
      confirmFloor: vendorConfig.confirmFloor,
      maxCallsPerSession: vendorConfig.maxCallsPerSession,
      maxInputChars: vendorConfig.maxInputChars,
    };
  });
  return { path: loaded.path, exists: loaded.exists, warnings: loaded.warnings, vendors };
}

function renderStatus(report, { json }, stdout) {
  if (json) {
    stdout.write(`${JSON.stringify({ ok: true, ...report }, null, 2)}\n`);
    return { exitCode: 0 };
  }
  stdout.write(`Judgment gate: ${report.exists ? report.path : `${report.path} (not created yet)`}\n`);
  for (const warning of report.warnings) stdout.write(`  ! ${warning}\n`);
  for (const vendor of report.vendors) {
    stdout.write(`  ${vendor.vendor}  ${vendor.enabled ? 'ENABLED' : 'disabled'}\n`);
    stdout.write(`      credential  ${vendor.credentialEnvVar} ${vendor.credentialPresent ? '(present)' : '(NOT SET)'}\n`);
    stdout.write(`      model       ${vendor.model}\n`);
    stdout.write(`      floors      act >= ${vendor.actFloor}, abort < ${vendor.confirmFloor}\n`);
    stdout.write(`      budget      ${vendor.maxCallsPerSession} calls/session, ${vendor.maxInputChars} chars\n`);
  }
  const disabled = report.vendors.filter((vendor) => !vendor.enabled);
  if (disabled.length > 0) {
    stdout.write('\nThe gate is OFF by default. Nothing calls a vendor until you enable it:\n');
    for (const vendor of disabled) stdout.write(`  aios judgment enable ${vendor.vendor}\n`);
  }
  return { exitCode: 0 };
}

export async function runJudgmentCommand(options = {}, { rootDir, stdout = process.stdout, env = process.env, homeDir, transport } = {}) {
  const subcommand = String(options.subcommand || 'status').trim().toLowerCase();
  const json = options.json === true || options.format === 'json';
  const configPath = options.configPath || resolveJudgmentConfigPath({ env, homeDir });

  if (subcommand === 'status') {
    return renderStatus(buildStatusReport({ env, configPath, homeDir }), { json }, stdout);
  }

  if (subcommand === 'enable' || subcommand === 'disable') {
    const vendor = String(options.vendor || '').trim();
    if (!vendor) throw new Error(`aios judgment ${subcommand} requires a vendor (known: ${vendorList().join(', ')})`);
    const entry = resolveVendor(vendor);

    const loaded = readJudgmentConfig({ configPath, env, homeDir });
    const overrides = { enabled: subcommand === 'enable' };
    if (options.model !== undefined) overrides.model = options.model;
    for (const [flag, key] of [['actFloor', 'actFloor'], ['confirmFloor', 'confirmFloor']]) {
      if (options[flag] !== undefined) overrides[key] = Number(options[flag]);
    }
    if (options.maxCalls !== undefined) overrides.maxCallsPerSession = Number(options.maxCalls);
    if (options.maxInputChars !== undefined) overrides.maxInputChars = Number(options.maxInputChars);

    const next = applyVendorOverride(loaded.config, vendor, overrides);
    const written = writeJudgmentConfig(next, { configPath, env, homeDir });
    const vendorConfig = resolveVendorConfig(next, vendor);
    const credentialPresent = hasCredential(entry, env);

    // --probe 会真的扣一次计量调用，所以必须由用户显式敲出来，默认不做。
    let probe = null;
    if (subcommand === 'enable' && options.probe === true) {
      probe = await askJudgment({
        vendor,
        state: 'AIOS judgment probe: confirm the endpoint accepts this credential.',
        questions: { reachable: { type: 'noul', instructions: 'Is this request reaching the endpoint successfully?' } },
        config: next,
        configPath: written,
        env,
        homeDir,
        transport,
      });
    }

    const report = {
      vendor,
      enabled: vendorConfig.enabled,
      path: written,
      credentialEnvVar: entry.credentialEnvVar,
      credentialPresent,
      config: vendorConfig,
      probe,
    };

    if (json) {
      stdout.write(`${JSON.stringify({ ok: true, report }, null, 2)}\n`);
      return { exitCode: 0 };
    }

    stdout.write(`${entry.displayName}: ${vendorConfig.enabled ? 'ENABLED' : 'disabled'} (${written})\n`);
    if (vendorConfig.enabled) {
      if (!credentialPresent) {
        stdout.write(`  ! ${entry.credentialEnvVar} is not set in this process.\n`);
        stdout.write('    Set it and RESTART your client — variables set after a client starts are not visible to it.\n');
      } else {
        stdout.write(`  credential  ${entry.credentialEnvVar} (present)\n`);
      }
      stdout.write(`  floors      act >= ${vendorConfig.actFloor}, abort < ${vendorConfig.confirmFloor}\n`);
    } else {
      stdout.write('  Nothing will call this vendor until you run: aios judgment enable ' + vendor + '\n');
    }
    if (probe) {
      stdout.write(`  probe       ${probe.ok ? `ok (${probe.model}, request=${probe.requestId}, usage=${probe.usage.inputTokens}/${probe.usage.outputTokens})` : `failed (${probe.reason}: ${probe.message})`}\n`);
    }
    return { exitCode: 0 };
  }

  if (subcommand === 'ask') {
    const vendor = String(options.vendor || 'typesafe').trim();
    const entry = resolveVendor(vendor);
    const riskClass = String(options.risk || 'guarded').trim();
    if (!RISK_CLASSES.includes(riskClass)) {
      throw new Error(`--risk must be one of ${RISK_CLASSES.join(', ')} (got ${riskClass})`);
    }

    const state = readMaybeFile(options.state).trim();
    if (!state) throw new Error('aios judgment ask requires --state <text|@path/to/state.txt>');
    const questions = parseQuestionsOption(options.questions);

    const loaded = readJudgmentConfig({ configPath, env, homeDir });
    const vendorConfig = resolveVendorConfig(loaded.config, vendor);

    const result = await askJudgment({
      vendor,
      state,
      questions,
      config: loaded.config,
      configPath: loaded.path,
      env,
      homeDir,
      session: createJudgmentSession(),
      transport,
    });

    if (!result.ok) {
      // 未开启是正常状态，不是崩溃；给出可执行的下一步，退出码区分"没开"和"失败"。
      const disabled = result.reason === 'judgment-disabled';
      if (json) {
        stdout.write(`${JSON.stringify({ ok: false, disabled, result }, null, 2)}\n`);
        return { exitCode: disabled ? 3 : 1 };
      }
      stdout.write(`judgment unavailable: ${result.reason}\n`);
      stdout.write(`  ${result.message}\n`);
      if (disabled) stdout.write(`  Enable it first: aios judgment enable ${vendor}\n`);
      return { exitCode: disabled ? 3 : 1 };
    }

    const verdicts = {};
    for (const [id, answer] of Object.entries(result.answers)) {
      verdicts[id] = judgeVerdict({
        answer,
        actFloor: vendorConfig.actFloor,
        confirmFloor: vendorConfig.confirmFloor,
        riskClass,
      });
    }

    // 判定是提案：连同出处一起给出，调用方必须自己决定怎么用，且不得写成事实。
    const provenance = {
      vendor,
      model: result.model,
      requestId: result.requestId,
      usage: result.usage,
      riskClass,
      actFloor: vendorConfig.actFloor,
      confirmFloor: vendorConfig.confirmFloor,
    };

    if (json) {
      stdout.write(`${JSON.stringify({ ok: true, provenance, answers: result.answers, verdicts }, null, 2)}\n`);
      return { exitCode: 0 };
    }

    stdout.write(`Judgment (${entry.displayName}) — proposal only, not a fact\n`);
    stdout.write(`  model=${provenance.model} request=${provenance.requestId ?? 'n/a'} risk=${riskClass}\n`);
    stdout.write(`  usage=${provenance.usage.inputTokens ?? '?'}/${provenance.usage.outputTokens ?? '?'} tokens\n`);
    for (const [id, answer] of Object.entries(result.answers)) {
      const verdict = verdicts[id];
      const value = answer.type === 'noul'
        ? `noul=${answer.noul}`
        : answer.type === 'choice' ? `choice=${answer.choice}` : `score=${answer.score}`;
      stdout.write(`  ${id}: ${value} confidence=${answer.confidence ?? 'n/a'} -> ${verdict.verdict.toUpperCase()}\n`);
      stdout.write(`      ${verdict.reason}\n`);
    }
    return { exitCode: 0 };
  }

  throw new Error(`unknown judgment subcommand "${subcommand}". Use: status, enable, disable, ask`);
}

export const JUDGMENT_HELP = Object.freeze({
  usage: [
    'aios judgment status [--json]',
    'aios judgment enable <typesafe> [--act-floor 0.8] [--confirm-floor 0.5] [--model jev-latest] [--probe] [--json]',
    'aios judgment disable <typesafe> [--json]',
    'aios judgment ask --state <text|@file> --questions <json|@file> [--risk read-only|guarded|destructive] [--json]',
  ],
  vendors: Object.keys(JUDGMENT_VENDORS),
  defaultState: 'disabled',
});

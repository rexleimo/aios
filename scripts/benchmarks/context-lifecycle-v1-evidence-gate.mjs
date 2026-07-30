import { createHash, verify } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function parseArgs(argv) {
  const options = {
    oraclePath: '',
    oracleSignaturePath: '',
    observationsPath: '',
    observationsSignaturePath: '',
    publicKeyPath: '',
    jsonOut: '',
    markdownOut: '',
    minRealSamples: 20,
  };
  const flags = new Map([
    ['--oracle', 'oraclePath'],
    ['--oracle-signature', 'oracleSignaturePath'],
    ['--observations', 'observationsPath'],
    ['--observations-signature', 'observationsSignaturePath'],
    ['--public-key', 'publicKeyPath'],
    ['--json-out', 'jsonOut'],
    ['--markdown-out', 'markdownOut'],
    ['--min-real-samples', 'minRealSamples'],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const flag = String(argv[index] || '');
    const key = flags.get(flag);
    const value = String(argv[index + 1] || '');
    if (!key) throw new Error(`unknown argument: ${flag}`);
    if (!value || value.startsWith('--')) throw new Error(`missing value for ${flag}`);
    options[key] = key === 'minRealSamples' ? Number.parseInt(value, 10) : path.resolve(value);
    index += 1;
  }
  for (const key of ['oraclePath', 'oracleSignaturePath', 'observationsPath', 'observationsSignaturePath', 'publicKeyPath', 'jsonOut', 'markdownOut']) {
    if (!options[key]) throw new Error(`missing required argument for ${key}`);
  }
  if (!Number.isInteger(options.minRealSamples) || options.minRealSamples < 1) {
    throw new Error('--min-real-samples must be a positive integer');
  }
  return options;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeReasons(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))].sort();
}

function sameReasons(left, right) {
  return JSON.stringify(normalizeReasons(left)) === JSON.stringify(normalizeReasons(right));
}

export function verifyDetachedSignature({ payload, signature, publicKey }) {
  try {
    return verify(null, payload, publicKey, signature);
  } catch {
    return false;
  }
}

function normalizeOracle(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('oracle must be a JSON object');
  if (raw.kind !== 'context-lifecycle-v1-independent-oracle') {
    throw new Error('oracle kind must be context-lifecycle-v1-independent-oracle');
  }
  if (!Array.isArray(raw.cases) || raw.cases.length === 0) throw new Error('oracle must contain cases');
  const cases = new Map();
  for (const candidate of raw.cases) {
    const id = String(candidate?.id || '').trim();
    if (!id || cases.has(id) || typeof candidate?.wouldBlock !== 'boolean') {
      throw new Error('oracle cases require unique id and boolean wouldBlock');
    }
    cases.set(id, {
      id,
      wouldBlock: candidate.wouldBlock,
      reasons: normalizeReasons(candidate.reasons),
    });
  }
  return cases;
}

function normalizeObservations(raw) {
  const rows = [];
  for (const [index, row] of raw.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`observation ${index + 1} must be a JSON object`);
    }
    const oracleCaseId = String(row.oracleCaseId || '').trim();
    const taskKind = String(row.taskKind || '').trim();
    if (!oracleCaseId || !['real_task', 'synthetic'].includes(taskKind) || typeof row.wouldBlock !== 'boolean') {
      throw new Error(`observation ${index + 1} has invalid taskKind, oracleCaseId, or wouldBlock`);
    }
    rows.push({
      observationId: String(row.observationId || `observation-${index + 1}`).trim(),
      oracleCaseId,
      taskKind,
      wouldBlock: row.wouldBlock,
      reasons: normalizeReasons(row.reasons),
      evidenceRefs: Array.isArray(row.evidenceRefs) ? row.evidenceRefs.map(String).filter(Boolean) : [],
    });
  }
  return rows;
}

export function evaluateIndependentValidationEvidence({
  oracle,
  observations,
  oracleSignatureVerified = false,
  observationsSignatureVerified = false,
  minRealSamples = 20,
} = {}) {
  const errors = [];
  let cases = new Map();
  let rows = [];
  try {
    cases = normalizeOracle(oracle);
  } catch (error) {
    errors.push(String(error?.message || error));
  }
  try {
    rows = normalizeObservations(Array.isArray(observations) ? observations : []);
  } catch (error) {
    errors.push(String(error?.message || error));
  }
  if (!oracleSignatureVerified) errors.push('oracle signature verification failed');
  if (!observationsSignatureVerified) errors.push('observations signature verification failed');

  const mismatches = [];
  for (const observation of rows) {
    const expected = cases.get(observation.oracleCaseId);
    if (!expected) {
      mismatches.push({ observationId: observation.observationId, reason: 'unknown_oracle_case' });
      continue;
    }
    if (observation.wouldBlock !== expected.wouldBlock || !sameReasons(observation.reasons, expected.reasons)) {
      mismatches.push({
        observationId: observation.observationId,
        reason: 'oracle_mismatch',
        expected: { wouldBlock: expected.wouldBlock, reasons: expected.reasons },
        observed: { wouldBlock: observation.wouldBlock, reasons: observation.reasons },
      });
    }
  }
  const realTaskRows = rows.filter((row) => row.taskKind === 'real_task');
  const realTaskSamples = realTaskRows.length;
  const realTaskWithoutEvidence = realTaskRows.filter((row) => row.evidenceRefs.length === 0);
  if (realTaskWithoutEvidence.length > 0) {
    errors.push(`${realTaskWithoutEvidence.length} real-task observation(s) have no evidence reference`);
  }
  if (realTaskSamples < minRealSamples) {
    errors.push(`real-task sample count ${realTaskSamples} is below required minimum ${minRealSamples}`);
  }
  if (mismatches.length > 0) errors.push(`${mismatches.length} oracle observation mismatch(es)`);

  const evidenceSatisfied = errors.length === 0;
  return {
    schemaVersion: 1,
    kind: 'context-lifecycle-v1-independent-validation-result',
    evidenceSatisfied,
    pilotDecision: evidenceSatisfied ? 'REVIEW_REQUIRED' : 'NO-GO',
    errors,
    oracleCaseCount: cases.size,
    observationCount: rows.length,
    realTaskSamples,
    minRealSamples,
    mismatches,
    evidenceBoundary: {
      oracleSignatureVerified,
      observationsSignatureVerified,
      automaticEnforcementEnabled: false,
      defaultHardEnforcement: 'NO-GO',
    },
  };
}

function renderMarkdown(result, inputs) {
  const lines = [
    '# Context Lifecycle V1 Independent Validation Evidence',
    '',
    `- Evidence status: **${result.evidenceSatisfied ? 'SATISFIED' : 'INCOMPLETE'}**`,
    `- Pilot decision: **${result.pilotDecision}**`,
    `- Oracle cases: ${result.oracleCaseCount}`,
    `- Observations: ${result.observationCount}`,
    `- Real-task samples: ${result.realTaskSamples}/${result.minRealSamples}`,
    `- Oracle SHA-256: \`${inputs.oracleSha256}\``,
    `- Observation SHA-256: \`${inputs.observationsSha256}\``,
    '',
    '## Safety boundary',
    '',
    '- Both oracle and observations must verify against the supplied detached-signature public key.',
    '- A satisfied evidence bundle only permits a human review decision; it never enables enforcement automatically.',
    '- Default hard enforcement remains NO-GO.',
    '',
  ];
  if (result.errors.length > 0) {
    lines.push('## Gaps', '');
    for (const error of result.errors) lines.push(`- ${error}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const [oraclePayload, oracleSignatureText, observationsPayload, observationsSignatureText, publicKey] = await Promise.all([
    readFile(options.oraclePath),
    readFile(options.oracleSignaturePath, 'utf8'),
    readFile(options.observationsPath),
    readFile(options.observationsSignaturePath, 'utf8'),
    readFile(options.publicKeyPath, 'utf8'),
  ]);
  const oracleSignature = Buffer.from(oracleSignatureText.trim(), 'base64');
  const observationsSignature = Buffer.from(observationsSignatureText.trim(), 'base64');
  const oracleSignatureVerified = verifyDetachedSignature({ payload: oraclePayload, signature: oracleSignature, publicKey });
  const observationsSignatureVerified = verifyDetachedSignature({ payload: observationsPayload, signature: observationsSignature, publicKey });
  const oracle = JSON.parse(oraclePayload.toString('utf8'));
  const observations = observationsPayload.toString('utf8')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const result = evaluateIndependentValidationEvidence({
    oracle,
    observations,
    oracleSignatureVerified,
    observationsSignatureVerified,
    minRealSamples: options.minRealSamples,
  });
  const inputs = {
    oracleSha256: sha256(oraclePayload),
    observationsSha256: sha256(observationsPayload),
  };
  await Promise.all([
    mkdir(path.dirname(options.jsonOut), { recursive: true }),
    mkdir(path.dirname(options.markdownOut), { recursive: true }),
  ]);
  await writeFile(options.jsonOut, `${JSON.stringify({ ...result, inputs }, null, 2)}\n`, 'utf8');
  await writeFile(options.markdownOut, renderMarkdown(result, inputs), 'utf8');
  process.stdout.write(`${JSON.stringify({
    evidenceSatisfied: result.evidenceSatisfied,
    pilotDecision: result.pilotDecision,
    jsonOut: options.jsonOut,
    markdownOut: options.markdownOut,
  })}\n`);
  process.exitCode = result.evidenceSatisfied ? 0 : 1;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exitCode = 1;
  });
}

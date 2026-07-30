import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';

import {
  evaluateIndependentValidationEvidence,
  verifyDetachedSignature,
} from '../benchmarks/context-lifecycle-v1-evidence-gate.mjs';

function signedFixture() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const oracle = {
    schemaVersion: 1,
    kind: 'context-lifecycle-v1-independent-oracle',
    cases: [
      { id: 'fresh', wouldBlock: false, reasons: [] },
      { id: 'undeclared', wouldBlock: true, reasons: ['undeclared_target'] },
    ],
  };
  const observations = [
    {
      observationId: 'real-1',
      taskKind: 'real_task',
      oracleCaseId: 'fresh',
      wouldBlock: false,
      reasons: [],
      evidenceRefs: ['receipt:real-1'],
    },
    {
      observationId: 'real-2',
      taskKind: 'real_task',
      oracleCaseId: 'undeclared',
      wouldBlock: true,
      reasons: ['undeclared_target'],
      evidenceRefs: ['receipt:real-2'],
    },
  ];
  const oraclePayload = Buffer.from(JSON.stringify(oracle), 'utf8');
  const observationsPayload = Buffer.from(observations.map((row) => JSON.stringify(row)).join('\n'), 'utf8');
  return {
    oracle,
    observations,
    oraclePayload,
    observationsPayload,
    oracleSignature: sign(null, oraclePayload, privateKey),
    observationsSignature: sign(null, observationsPayload, privateKey),
    publicKey,
  };
}

test('signed independent evidence can satisfy a review-only validation gate', () => {
  const fixture = signedFixture();
  const oracleSignatureVerified = verifyDetachedSignature({
    payload: fixture.oraclePayload,
    signature: fixture.oracleSignature,
    publicKey: fixture.publicKey,
  });
  const observationsSignatureVerified = verifyDetachedSignature({
    payload: fixture.observationsPayload,
    signature: fixture.observationsSignature,
    publicKey: fixture.publicKey,
  });

  const result = evaluateIndependentValidationEvidence({
    oracle: fixture.oracle,
    observations: fixture.observations,
    oracleSignatureVerified,
    observationsSignatureVerified,
    minRealSamples: 2,
  });

  assert.equal(result.evidenceSatisfied, true);
  assert.equal(result.pilotDecision, 'REVIEW_REQUIRED');
  assert.equal(result.evidenceBoundary.automaticEnforcementEnabled, false);
  assert.equal(result.evidenceBoundary.defaultHardEnforcement, 'NO-GO');
});

test('unsigned, mismatched, or unreferenced observations remain NO-GO', () => {
  const fixture = signedFixture();
  const observations = [{
    ...fixture.observations[0],
    oracleCaseId: 'undeclared',
    wouldBlock: false,
    evidenceRefs: [],
  }];
  const result = evaluateIndependentValidationEvidence({
    oracle: fixture.oracle,
    observations,
    oracleSignatureVerified: true,
    observationsSignatureVerified: false,
    minRealSamples: 1,
  });

  assert.equal(result.evidenceSatisfied, false);
  assert.equal(result.pilotDecision, 'NO-GO');
  assert.ok(result.errors.includes('observations signature verification failed'));
  assert.ok(result.errors.some((error) => error.includes('have no evidence reference')));
  assert.equal(result.mismatches[0].reason, 'oracle_mismatch');
});

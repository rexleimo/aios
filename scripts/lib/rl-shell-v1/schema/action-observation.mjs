import { ACTION_TYPES, OBSERVATION_STATUS } from './constants.mjs';
import {
  assertBoolean,
  assertEnum,
  assertInteger,
  assertNoUnknownKeys,
  assertObject,
  assertString,
  assertStringArray,
} from './assertions.mjs';

export function validateActionObject(action, label = 'action') {
  assertObject(action, label);
  assertNoUnknownKeys(action, ['action', 'path', 'command', 'diff', 'message'], label);
  assertEnum(action.action, ACTION_TYPES, `${label}.action`);
  if (action.action === 'read') {
    assertString(action.path, `${label}.path`);
  } else if (action.action === 'run') {
    assertString(action.command, `${label}.command`);
  } else if (action.action === 'patch') {
    assertString(action.diff, `${label}.diff`);
  } else if (action.action === 'stop') {
    assertString(action.message, `${label}.message`);
  }
}

function validateReadPayload(payload) {
  assertNoUnknownKeys(payload, ['path', 'content_excerpt', 'content_truncated', 'bytes_read'], 'payload');
  assertString(payload.path, 'payload.path');
  assertBoolean(payload.content_truncated, 'payload.content_truncated');
  assertInteger(payload.bytes_read, 'payload.bytes_read', { min: 0 });
  if (typeof payload.content_excerpt !== 'string') {
    throw new Error('payload.content_excerpt must be a string');
  }
}

function validateRunPayload(payload) {
  assertNoUnknownKeys(payload, ['exit_code', 'stdout_excerpt', 'stderr_excerpt', 'stdout_truncated', 'stderr_truncated', 'files_touched'], 'payload');
  assertInteger(payload.exit_code, 'payload.exit_code');
  if (typeof payload.stdout_excerpt !== 'string') {
    throw new Error('payload.stdout_excerpt must be a string');
  }
  if (typeof payload.stderr_excerpt !== 'string') {
    throw new Error('payload.stderr_excerpt must be a string');
  }
  assertBoolean(payload.stdout_truncated, 'payload.stdout_truncated');
  assertBoolean(payload.stderr_truncated, 'payload.stderr_truncated');
  assertStringArray(payload.files_touched, 'payload.files_touched');
}

function validatePatchPayload(payload) {
  assertNoUnknownKeys(payload, ['applied', 'files_touched', 'reject_reason', 'diff_excerpt'], 'payload');
  assertBoolean(payload.applied, 'payload.applied');
  assertStringArray(payload.files_touched, 'payload.files_touched');
  if (payload.reject_reason !== null && typeof payload.reject_reason !== 'string') {
    throw new Error('payload.reject_reason must be a string or null');
  }
  if (typeof payload.diff_excerpt !== 'string') {
    throw new Error('payload.diff_excerpt must be a string');
  }
}

export function validateObservationPayload(actionType, payload) {
  assertObject(payload, 'payload');
  if (actionType === 'read') {
    validateReadPayload(payload);
    return;
  }
  if (actionType === 'run') {
    validateRunPayload(payload);
    return;
  }
  if (actionType === 'patch') {
    validatePatchPayload(payload);
    return;
  }
  assertNoUnknownKeys(payload, ['message'], 'payload');
  assertString(payload.message, 'payload.message');
}

export function validateObservationEvent(raw) {
  assertObject(raw, 'observation event');
  assertNoUnknownKeys(raw, ['schema_version', 'step_index', 'action', 'status', 'error_code', 'error_message', 'payload'], 'observation event');
  assertInteger(raw.schema_version, 'observation event.schema_version', { min: 1 });
  if (raw.schema_version !== 1) {
    throw new Error('observation event.schema_version must equal 1');
  }
  assertInteger(raw.step_index, 'observation event.step_index', { min: 1 });
  validateActionObject(raw.action, 'observation event.action');
  assertEnum(raw.status, OBSERVATION_STATUS, 'observation event.status');
  if (raw.error_code !== null && typeof raw.error_code !== 'string') {
    throw new Error('observation event.error_code must be a string or null');
  }
  if (raw.error_message !== null && typeof raw.error_message !== 'string') {
    throw new Error('observation event.error_message must be a string or null');
  }
  validateObservationPayload(raw.action.action, raw.payload);
  return raw;
}

import { appendFile } from 'node:fs/promises';

import { validateObservationEvent } from '../schema.mjs';

export function makeObservation({ workspace, action, status, errorCode = null, errorMessage = null, payload }) {
  const event = validateObservationEvent({
    schema_version: 1,
    step_index: workspace.observations.length + 1,
    action,
    status,
    error_code: errorCode,
    error_message: errorMessage,
    payload,
  });
  workspace.observations.push(event);
  return event;
}

export async function persistObservation(workspace, event) {
  await appendFile(workspace.observationTracePath, `${JSON.stringify(event)}\n`, 'utf8');
}

export async function recordObservation(args) {
  const event = makeObservation(args);
  await persistObservation(args.workspace, event);
  return event;
}

import { validateBrowserTask } from './schema.mjs';

import { computeHash } from '../../../src/shared/normalize.mjs';

function buildTask(index) {
  return validateBrowserTask({
    task_id: `browser-publish-${String(index + 1).padStart(3, '0')}`,
    target_site: 'example.test',
    flow_id: 'publish-sequence',
    start_url: `https://example.test/publish/${index + 1}`,
    comparison_start_url: `https://example.test/publish/${index + 1}`,
    success_selector: '[data-status="published"]',
    challenge_selector: '#captcha',
    auth_state_class: 'authenticated',
    input_payload: {
      title: `Fixture Title ${index + 1}`,
    },
    exploration_mode: 'controlled',
    sensitive_action_flag: false,
    flow_constraints: ['controlled-submit', 'known-target-site'],
  });
}

export function isAdmissibleBrowserTask(task) {
  const normalized = validateBrowserTask(task);
  if (normalized.exploration_mode === 'open-ended') {
    return false;
  }
  if (normalized.sensitive_action_flag && normalized.flow_constraints.length === 0) {
    return false;
  }
  return true;
}

export function loadBrowserTasks({ tasks, count = 24 } = {}) {
  const source = Array.isArray(tasks) && tasks.length > 0
    ? tasks
    : Array.from({ length: count }, (_, index) => buildTask(index));
  return source.map((task) => validateBrowserTask(task));
}

export function sampleBrowserTask({ seed = 0, attempt = 0, tasks = [] }) {
  const admissible = loadBrowserTasks({ tasks }).filter(isAdmissibleBrowserTask);
  if (admissible.length === 0) {
    return null;
  }
  const index = computeHash(`${seed}:${attempt}:browser`) % admissible.length;
  return admissible[index];
}


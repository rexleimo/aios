import test from 'node:test';

import { assertFreshTrainingEvidence } from './fixtures/skill-training-freshness.mjs';

const SKILLS = ['rex-implement', 'rex-debug', 'rex-code-review', 'rex-wayfinder'];

test('四项技能的当前版本均持有受跟踪且哈希新鲜的 V2 训练认证证据', async () => {
  for (const skillId of SKILLS) {
    await assertFreshTrainingEvidence(process.cwd(), skillId);
  }
});

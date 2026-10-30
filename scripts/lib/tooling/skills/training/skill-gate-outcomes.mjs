import { SKILL_NAME_ALIASES } from '../../components/skills/normalizers.mjs';

function noEvidence() {
  return { evidence: null, staleRefs: [], staleDetails: [] };
}

// 改名登记表是显式事实，不是从文件名推的：旧 id 的源已不存在时，只有它声明的新 id
// 持有已接受证据，才把“被删的文件”判为换代；否则仍是不可读输入 —— 后者给出的空
// remedy 是刻意的，因为 certify 会去读同一个不存在的文件，救不回来。
function supersededByRename(skillId, { sourceMissing, evidenceBySkill }) {
  if (!sourceMissing) return '';
  const target = SKILL_NAME_ALIASES[skillId];
  if (!target || target === skillId) return '';
  return evidenceBySkill.get(target)?.evidence ? target : '';
}

export async function collectSkillOutcomes({ skillIds, skillFiles, currentHash, findEvidence, describeBlocked }) {
  const hashes = new Map();
  for (const skillId of skillIds) hashes.set(skillId, await currentHash(skillFiles.get(skillId)));
  const evidenceBySkill = new Map();
  for (const skillId of skillIds) {
    const hash = hashes.get(skillId);
    evidenceBySkill.set(skillId, hash ? await findEvidence(skillId, skillFiles.get(skillId), hash) : noEvidence());
  }
  return skillIds.map((skillId) => {
    const currentSkillHash = hashes.get(skillId);
    const evidenceResult = evidenceBySkill.get(skillId);
    if (evidenceResult.evidence) return { skillId, status: 'verified', evidence: evidenceResult.evidence };
    const supersededBy = supersededByRename(skillId, { sourceMissing: !currentSkillHash, evidenceBySkill });
    if (!supersededBy) return describeBlocked({ skillId, currentSkillHash, evidenceResult });
    return {
      skillId,
      sourcePath: skillFiles.get(skillId),
      status: 'verified',
      supersededBy,
      code: 'superseded-by-rename',
      evidence: evidenceBySkill.get(supersededBy).evidence,
    };
  });
}

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { formatSkillCandidatePatchTemplateDocument } from '../../hud/skill-candidates.mjs';
import {
  DEFAULT_SKILL_CANDIDATE_LIMIT,
  formatArtifactTimestamp,
  normalizeText,
  toPosixPath,
} from './shared.mjs';

// 纯函数：生成 ContextDB 里的技能候选补丁模板相对路径，集中管理 artifact 命名规则。
function buildSkillCandidatePatchTemplateArtifactPath(sessionId, { stamp = '' } = {}) {
  const normalizedSessionId = normalizeText(sessionId);
  const normalizedStamp = normalizeText(stamp) || formatArtifactTimestamp();
  return path.join(
    'memory',
    'context-db',
    'sessions',
    normalizedSessionId,
    'artifacts',
    `skill-candidate-patch-template-${normalizedStamp}.md`
  );
}

// 纯函数：把显式输出路径和默认 artifact 路径统一成可写入的绝对路径与展示路径。
function resolveSkillCandidatePatchTemplateOutputPath({
  rootDir = '',
  sessionId = '',
  generatedAt = '',
  outputPath = '',
} = {}) {
  const normalizedRootDir = normalizeText(rootDir) || process.cwd();
  const normalizedOutputPath = normalizeText(outputPath);
  if (normalizedOutputPath) {
    const normalizedPath = path.normalize(normalizedOutputPath);
    if (path.isAbsolute(normalizedPath)) {
      return {
        artifactPath: toPosixPath(normalizedPath),
        artifactAbsPath: normalizedPath,
      };
    }
    return {
      artifactPath: toPosixPath(normalizedPath),
      artifactAbsPath: path.join(normalizedRootDir, normalizedPath),
    };
  }

  const artifactPath = buildSkillCandidatePatchTemplateArtifactPath(sessionId, {
    stamp: formatArtifactTimestamp(new Date(generatedAt)),
  });
  return {
    artifactPath: toPosixPath(artifactPath),
    artifactAbsPath: path.join(normalizedRootDir, artifactPath),
  };
}

// 持久化函数：集中写入技能候选补丁模板，避免 status 与独立 export 命令各自拼路径。
async function persistSkillCandidatePatchTemplateArtifact({
  rootDir,
  state,
  skillCandidateLimit = DEFAULT_SKILL_CANDIDATE_LIMIT,
  draftId = '',
  outputPath = '',
} = {}) {
  const sessionId = normalizeText(state?.selection?.sessionId) || normalizeText(state?.session?.sessionId);
  if (!sessionId) return null;

  const generatedAt = new Date().toISOString();
  const resolvedOutputPath = resolveSkillCandidatePatchTemplateOutputPath({
    rootDir,
    sessionId,
    generatedAt,
    outputPath,
  });
  const content = formatSkillCandidatePatchTemplateDocument(state, {
    rootDir,
    limit: skillCandidateLimit,
    generatedAt,
    draftId,
  });

  await fs.mkdir(path.dirname(resolvedOutputPath.artifactAbsPath), { recursive: true });
  await fs.writeFile(resolvedOutputPath.artifactAbsPath, `${content}\n`, 'utf8');

  return {
    artifactPath: resolvedOutputPath.artifactPath,
    generatedAt,
  };
}

export {
  buildSkillCandidatePatchTemplateArtifactPath,
  persistSkillCandidatePatchTemplateArtifact,
  resolveSkillCandidatePatchTemplateOutputPath,
};

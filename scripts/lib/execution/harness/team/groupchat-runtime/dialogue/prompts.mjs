import { renderHandoffContract, stripOutputContractSection } from '../../../../../foundation/agents/emitters/shared.mjs';
import { buildPersonaOverlay } from '../../../../../memory/memo/care/persona.mjs';
import { buildModelRouterPromptSection } from '../../../../../tooling/model-router.mjs';
import { normalizeText } from '../support/shared.mjs';

function deliveredExecutionContext(executionContext) {
  return String(executionContext?.text || '').trim();
}

export function buildRolePrompt({ role, taskTitle, contextSummary, workItems, executionContext = null }) {
  const lines = [];
  lines.push('# Task');
  lines.push(`taskTitle: ${normalizeText(taskTitle) || 'Untitled'}`);
  if (contextSummary) {
    lines.push(`contextSummary: ${normalizeText(contextSummary)}`);
  }
  lines.push('');

  if (Array.isArray(workItems) && workItems.length > 0) {
    lines.push('## Assigned Work Items');
    for (const item of workItems) {
      lines.push(`- [${normalizeText(item.type) || 'general'}] ${normalizeText(item.itemId)}: ${normalizeText(item.summary)}`);
    }
    lines.push('');
  }

  const contextDelivery = deliveredExecutionContext(executionContext);
  if (contextDelivery) {
    lines.push('## Orchestrator-Delivered Context');
    lines.push('Use this delivery for the task. Do not copy raw delivered source text into the JSON handoff; summarize findings and cite ref/hash only.');
    lines.push(contextDelivery);
    lines.push('');
  }

  lines.push('## Deliverable');
  lines.push('- Summarize concrete findings.');
  lines.push('- If you touched files, list them in `filesTouched` (relative paths).');
  lines.push('- If blocked or need input, set `status` to `blocked` or `needs-input` and explain in `openQuestions`.');
  lines.push('- Otherwise set `status` to `completed`.');
  lines.push('- Complete the assigned objective, including review, diagnosis or verification when no code changes are needed. Return a no-op only when evidence shows the assigned work is already satisfied.');
  lines.push('- For the final reply, output ONLY the JSON object.');
  lines.push('');
  return lines.join('\n');
}

export function buildConversationPrompt({ history, currentRole, currentSpeaker }) {
  const lines = [];

  if (history.length === 0) {
    lines.push('## Conversation History');
    lines.push('(no prior conversation - you are the first speaker)');
    lines.push('');
  } else {
    lines.push('## Conversation History');
    let lastRound = 0;
    for (const entry of history.entries) {
      if (entry.roundNumber !== lastRound) {
        lastRound = entry.roundNumber;
        lines.push('');
        lines.push(`### Round ${entry.roundNumber}`);
      }

      const handoff = entry.handoff;
      lines.push(`#### ${entry.speaker} (${entry.role})`);
      lines.push(`- Status: ${handoff.status}`);
      lines.push(`- Summary: ${normalizeText(handoff.contextSummary) || '(none)'}`);
      if (handoff.findings.length > 0) {
        lines.push(`- Findings: ${handoff.findings.map((finding) => normalizeText(finding)).join('; ')}`);
      }
      if (handoff.filesTouched.length > 0) {
        lines.push(`- Files: ${handoff.filesTouched.join(', ')}`);
      }
      if (handoff.openQuestions.length > 0) {
        lines.push(`- Questions: ${handoff.openQuestions.map((question) => normalizeText(question)).join('; ')}`);
      }
      if (handoff.recommendations.length > 0) {
        lines.push(`- Recommendations: ${handoff.recommendations.map((recommendation) => normalizeText(recommendation)).join('; ')}`);
      }
    }
    lines.push('');
  }

  lines.push('## Your Turn');
  const speakerLabel = currentSpeaker || currentRole;
  lines.push(`You are speaking as **${speakerLabel}** (role: ${currentRole}).`);
  lines.push('Read the conversation history above. Based on what has been discussed and decided, perform your role.');
  lines.push('');
  return lines.join('\n');
}

export function buildSystemPromptForSpeaker({ agent, rootDir, env, rolePinnedMemory, modelRouting = null }) {
  const lines = [];
  if (agent?.systemPrompt) {
    lines.push(stripOutputContractSection(agent.systemPrompt));
  } else {
    lines.push('You are a role-based subagent for AIOS orchestrations (GroupChat mode).');
  }

  if (rootDir) {
    try {
      const personaOverlay = buildPersonaOverlay('persona', { workspaceRoot: rootDir, env });
      if (personaOverlay) {
        lines.push('');
        lines.push(personaOverlay.trim());
      }
    } catch { /* 中文注释：persona 是增强信息，读取失败不应阻断群聊运行。 */ }
    try {
      const userOverlay = buildPersonaOverlay('user', { workspaceRoot: rootDir, env });
      if (userOverlay) {
        lines.push('');
        lines.push(userOverlay.trim());
      }
    } catch { /* 中文注释：用户画像缺失时保持默认提示词。 */ }
  }

  if (rolePinnedMemory) {
    lines.push('');
    lines.push('## Role Memory (Pinned)');
    lines.push('Key findings from prior invocations:');
    lines.push('');
    lines.push(rolePinnedMemory.trim());
  }

  const modelRouterSection = buildModelRouterPromptSection(modelRouting);
  if (modelRouterSection) {
    lines.push('');
    lines.push(modelRouterSection);
    lines.push('Use the routed model/protocol for this GroupChat speaker.');
  }

  lines.push('');
  lines.push(renderHandoffContract({ role: agent?.role, handoffTarget: agent?.handoffTarget }));
  lines.push('');
  return lines.join('\n');
}

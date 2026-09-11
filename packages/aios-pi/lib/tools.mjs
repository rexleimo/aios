// AIOS tool definitions for the Pi extension. TypeBox is injected (Pi
// provides it at runtime; tests inject a stub) so this module stays
// runnable under plain node --test. `run` executes resolved AIOS argv
// and returns { text } content for the tool result.
import {
  memoRecallArgs,
  memoUsefulArgs,
  memoWriteArgs,
  skillSearchArgs,
} from './aios-cli.mjs';

function textResult(text, extra = {}) {
  return {
    content: [{ type: 'text', text: String(text || '') }],
    details: { ...extra },
  };
}

export function buildToolDefs({ Type, run } = {}) {
  if (!Type || typeof run !== 'function') throw new Error('buildToolDefs requires { Type, run }');
  return [
    {
      name: 'aios_memory_recall',
      label: 'AIOS memory recall',
      description: 'Search AIOS project memory before continuing prior work. Use when the user says continue/resume or the task builds on earlier conclusions.',
      parameters: Type.Object({
        query: Type.String({ description: 'Search text' }),
        limit: Type.Optional(Type.Number({ description: 'Max results (default 5)' })),
      }),
      async execute(_toolCallId, params) {
        const { text } = await run({ argv: memoRecallArgs(params || {}) });
        return textResult(text, { argv: memoRecallArgs(params || {}) });
      },
    },
    {
      name: 'aios_memory_write',
      label: 'AIOS memory write',
      description: 'Persist a verified conclusion, fix, or preference to AIOS project memory. Only confirmed facts, never guesses.',
      parameters: Type.Object({
        text: Type.String({ description: 'One-line durable takeaway' }),
      }),
      async execute(_toolCallId, params) {
        const { text } = await run({ argv: memoWriteArgs(params || {}) });
        return textResult(text);
      },
    },
    {
      name: 'aios_memory_useful',
      label: 'AIOS memory feedback',
      description: 'Mark recalled AIOS memo event(s) as adopted so future recall ranks them higher.',
      parameters: Type.Object({
        eventIds: Type.Array(Type.String(), { description: 'Memo event ids to mark useful' }),
      }),
      async execute(_toolCallId, params) {
        const { text } = await run({ argv: memoUsefulArgs(params || {}) });
        return textResult(text);
      },
    },
    {
      name: 'aios_skill_search',
      label: 'AIOS skill search',
      description: 'Search AIOS skills and client guidance for the current task before building something new.',
      parameters: Type.Object({
        query: Type.String({ description: 'Search text' }),
      }),
      async execute(_toolCallId, params) {
        const { text } = await run({ argv: skillSearchArgs(params || {}), json: true });
        return textResult(text);
      },
    },
  ];
}

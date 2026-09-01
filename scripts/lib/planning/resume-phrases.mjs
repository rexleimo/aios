/* Resume/continue is a workflow-protocol signal, not a semantic guess about the
 * user's intent. The harness recognizes an explicit, conventional resume prefix
 * ("continue/resume/接着/下一步") so the workflow state machine can pick up an
 * active plan; judging whether the user is "actually recalling memory" or "about
 * to start a new objective" is left to the model (explicitIntent / declaration),
 * never inferred from a keyword table. */

export const RESUME_PREFIX = /^(?:(?:please\s+)?(?:resume|continue|pick\s+up|carry\s+on|keep\s+going|go\s+on|next\s+step)|\u7ee7\u7eed|\u63a5\u7740|\u6062\u590d|\u7eed\u4e0a|\u5f80\u4e0b\u505a|\u63a5\u7740\u505a|\u63a5\u7740\u6539|\u4e0b\u4e00\u6b65)[\s,;:!?\u3002\u3001\uff0c\uff01\uff1f-]*/iu;

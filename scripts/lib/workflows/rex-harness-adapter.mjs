/**
 * AIOS 与 rex-harness 的唯一适配边界。
 * 工作流始终使用 rex 内置 Provider，避免宿主重新引入另一套语义路由。
 */
import {
  CAPABILITY,
  advanceSoftwareWorkflow,
  advanceActivation,
  evaluateSoftwareRequest,
  listSoftwareWorkflowRecipes,
  nextCommand,
  rexNativeProviderBindings,
  startActivation,
  startSoftwareWorkflow,
} from '../../../rex-harness/src/index.mjs';
import { resolveAiosAgentProvider } from './rex-agent-provider.mjs';

export function createAiosRexProviderBindings() {
  return Object.freeze([...rexNativeProviderBindings]);
}

export const AIOS_REX_PROVIDER_BINDINGS = createAiosRexProviderBindings();

const DEFAULT_AGENT_ROLE = new Map([
  [CAPABILITY.REQUIREMENTS_CLARIFY, 'planner'],
  [CAPABILITY.DESIGN_RESOLVE, 'architect'],
  [CAPABILITY.PLANNING_SEQUENCE, 'planner'],
  [CAPABILITY.TESTING_DESIGN, 'tdd-guide'],
  [CAPABILITY.TESTING_TDD, 'tdd-guide'],
  [CAPABILITY.TESTING_STRICT_TDD, 'tdd-guide'],
  [CAPABILITY.DEBUG_ROOT_CAUSE, 'build-error-resolver'],
  [CAPABILITY.IMPLEMENTATION_MINIMIZE, 'implementer'],
  [CAPABILITY.IMPLEMENTATION_EXECUTE, 'implementer'],
  [CAPABILITY.REVIEW_STANDARDS_SPEC, 'code-reviewer'],
  [CAPABILITY.REVIEW_SPECIALIST, 'security-reviewer'],
  [CAPABILITY.NAVIGATION_WAYFIND, 'planner'],
]);

const PLANNED_CAPABILITIES = new Set([
  CAPABILITY.REQUIREMENTS_CLARIFY,
  CAPABILITY.DESIGN_RESOLVE,
  CAPABILITY.PLANNING_SEQUENCE,
  CAPABILITY.TESTING_STRICT_TDD,
  CAPABILITY.NAVIGATION_WAYFIND,
]);

const MUTATING_CAPABILITIES = new Set([
  CAPABILITY.TESTING_DESIGN,
  CAPABILITY.TESTING_TDD,
  CAPABILITY.TESTING_STRICT_TDD,
  CAPABILITY.DEBUG_ROOT_CAUSE,
  CAPABILITY.IMPLEMENTATION_EXECUTE,
]);

const ROUTE_BY_CAPABILITY = new Map([
  [CAPABILITY.DESIGN_RESOLVE, 'design'],
  [CAPABILITY.DEBUG_ROOT_CAUSE, 'debug'],
  [CAPABILITY.REVIEW_STANDARDS_SPEC, 'verify'],
  [CAPABILITY.REVIEW_SPECIALIST, 'verify'],
]);

function bindingContext() {
  const bindings = AIOS_REX_PROVIDER_BINDINGS;
  return Object.freeze({
    providerMode: 'rex-native',
    bindings,
    byCapability: new Map(bindings.map((binding) => [binding.capabilityId, binding.provider])),
  });
}

function coreOptions(options = {}) {
  const {
    providerBindings: _providerBindings,
    ...rest
  } = options;
  return rest;
}

function bindDecision(decision, context) {
  if (!decision) return null;
  const configured = context.byCapability.get(decision.capabilityId) || decision.provider;
  return Object.freeze({
    ...decision,
    provider: resolveAiosAgentProvider(configured, decision.evidenceRefs),
  });
}

function bindWorkflowCommand(workflow, context) {
  const command = workflow?.currentCommand;
  if (!command) return Object.freeze({ ...workflow, aiosProviderMode: context.providerMode });
  const configured = context.byCapability.get(command.capabilityId) || command.provider;
  const provider = resolveAiosAgentProvider(
    configured,
    workflow.currentActivation?.triggerEvidenceRefs || command.triggerEvidenceRefs,
  );
  return Object.freeze({
    ...workflow,
    aiosProviderMode: context.providerMode,
    currentCommand: Object.freeze({ ...command, provider }),
  });
}

export function evaluateAiosSoftwareRequest(options = {}) {
  const context = bindingContext(options);
  const result = evaluateSoftwareRequest(coreOptions(options));
  return Object.freeze({
    ...result,
    providerMode: context.providerMode,
    decision: bindDecision(result.decision, context),
  });
}

// direct/guarded/planned 仍是 AIOS 的宿主策略；这份映射只描述当前语义步骤
// 是否需要持久计划、是否可能改代码，以及应使用哪个通用宿主路由。
export function describeAiosCapability(decision) {
  const capabilityId = decision?.capabilityId || '';
  return Object.freeze({
    plannedByDefault: PLANNED_CAPABILITIES.has(capabilityId),
    mayEdit: MUTATING_CAPABILITIES.has(capabilityId),
    routeHint: ROUTE_BY_CAPABILITY.get(capabilityId) || 'implement',
  });
}

export function startAiosCapabilityActivation(decision, options = {}) {
  const context = bindingContext(options);
  const activation = startActivation(decision, coreOptions(options));
  return Object.freeze({
    activation,
    command: nextCommand(activation, {
      ...coreOptions(options),
      providerBindings: [
        ...context.bindings,
        Object.freeze({ capabilityId: decision.capabilityId, provider: decision.provider }),
      ],
    }),
  });
}

export function advanceAiosCapabilityActivation(activation, evidence = [], options = {}) {
  const context = bindingContext(options);
  const configured = context.byCapability.get(activation.capabilityId);
  const resolved = resolveAiosAgentProvider(configured, activation.triggerEvidenceRefs);
  return advanceActivation(activation, evidence, {
    ...coreOptions(options),
    providerBindings: [
      ...context.bindings,
      Object.freeze({ capabilityId: activation.capabilityId, provider: resolved }),
    ],
  });
}

/**
 * AIOS 只增强可执行绑定；Workflow Activation、续转和执行画像仍由 rex 持有。
 */
export function startAiosSoftwareWorkflow(options = {}) {
  const context = bindingContext(options);
  const request = options.request || {};
  const evaluated = options.decision
    ? Object.freeze({ facts: Object.freeze([]), decision: bindDecision(options.decision, context), promotion: null })
    : evaluateAiosSoftwareRequest(request);
  const workflow = startSoftwareWorkflow({
    ...coreOptions(options),
    request,
    decision: undefined,
    evaluation: evaluated,
    providerBindings: context.bindings,
  });
  return bindWorkflowCommand(workflow, context);
}

export function advanceAiosSoftwareWorkflow(workflow, evidence = [], options = {}) {
  const context = bindingContext();
  const advanced = advanceSoftwareWorkflow(workflow, evidence, {
    ...coreOptions(options),
    providerBindings: context.bindings,
  });
  const boundWorkflow = bindWorkflowCommand(advanced.workflow, context);
  return Object.freeze({
    ...advanced,
    workflow: boundWorkflow,
    nextCapability: advanced.nextCapability
      ? Object.freeze({
        ...advanced.nextCapability,
        command: boundWorkflow.currentCommand,
      })
      : null,
  });
}

function agentRoleForStage(stage) {
  if (stage.capabilityId === CAPABILITY.REVIEW_SPECIALIST && stage.selector === 'risk-domain') {
    return 'risk-selected-specialist';
  }
  if ([CAPABILITY.TESTING_TDD, CAPABILITY.TESTING_STRICT_TDD].includes(stage.capabilityId)) {
    if (stage.recipeStageId === 'green') return 'implementer';
    if (stage.recipeStageId === 'refactor') return 'code-reviewer';
  }
  return DEFAULT_AGENT_ROLE.get(stage.capabilityId) || '';
}

export function buildRexWorkflowDefinitions(options = {}) {
  return Object.freeze(listSoftwareWorkflowRecipes(options).map((recipe) => {
    const { stages, ...metadata } = recipe;
    return Object.freeze({
      ...metadata,
      stages: Object.freeze(stages.map((stage) => Object.freeze({
        ...stage,
        agentRole: agentRoleForStage(stage),
      }))),
      source: 'rex-harness',
    });
  }));
}

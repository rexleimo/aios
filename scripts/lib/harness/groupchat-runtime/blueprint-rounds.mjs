import { getOrchestratorBlueprint, ORCHESTRATOR_BLUEPRINT_NAMES } from '../orchestrator.mjs';

export function resolveBlueprintRounds(blueprintName = 'feature') {
  const name = ORCHESTRATOR_BLUEPRINT_NAMES.includes(blueprintName) ? blueprintName : 'feature';
  const blueprint = getOrchestratorBlueprint(name);
  const rounds = [];
  let currentRound = 0;
  let openParallelGroup = null;

  const flushParallelGroup = () => {
    if (!openParallelGroup) return;
    currentRound += 1;
    rounds.push({
      roundNumber: currentRound,
      roles: [...openParallelGroup.roles],
      mode: 'parallel',
      group: openParallelGroup.group,
    });
    openParallelGroup = null;
  };

  for (const phase of blueprint.phases) {
    if (phase.mode === 'parallel' && phase.group) {
      if (!openParallelGroup || openParallelGroup.group !== phase.group) {
        flushParallelGroup();
        openParallelGroup = { roles: [], group: phase.group };
      }
      openParallelGroup.roles.push(phase.role);
      continue;
    }

    flushParallelGroup();
    currentRound += 1;
    rounds.push({
      roundNumber: currentRound,
      roles: [phase.role],
      mode: phase.mode,
    });
  }

  flushParallelGroup();
  return rounds;
}

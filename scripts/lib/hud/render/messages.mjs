export function formatSuggestedCommands(state) {
  const commands = [
    ...(Array.isArray(state?.harnessSuggestedCommands) ? state.harnessSuggestedCommands : []),
    ...(Array.isArray(state?.suggestedCommands) ? state.suggestedCommands : []),
  ];
  if (commands.length === 0) return [];
  const lines = ['Next:'];
  for (const cmd of commands.slice(0, 4)) {
    lines.push(`- ${cmd}`);
  }
  return lines;
}

export function formatWarnings(state) {
  const warnings = Array.isArray(state?.warnings) ? state.warnings : [];
  if (warnings.length === 0) return [];
  const lines = ['Warnings:'];
  for (const warning of warnings.slice(0, 4)) {
    lines.push(`- ${warning}`);
  }
  return lines;
}

/* 中文注释：doctor 选项只影响诊断入口，和发布/编排参数隔离。 */
export function applyDoctorOption({ command, options, arg }) {
  switch (arg) {
    case '--strict':
      if (command === 'doctor') {
        options.strict = true;
        return 0;
      }
      return null;
    case '--global-security':
      options.globalSecurity = true;
      return 0;
    case '--native':
      if (command !== 'doctor') return null;
      options.nativeOnly = true;
      return 0;
    case '--verbose':
      if (command !== 'doctor') return null;
      options.verbose = true;
      return 0;
    case '--fix':
      if (command !== 'doctor') return null;
      options.fix = true;
      return 0;
    case '--dry-run':
      if (command !== 'doctor') return null;
      options.dryRun = true;
      return 0;
    default:
      return null;
  }
}

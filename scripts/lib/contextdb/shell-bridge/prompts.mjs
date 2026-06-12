export function isInteractivePassthrough(command, passthroughArgs) {
  const first = passthroughArgs[0] || '';
  if (!first) return true;
  if (first === '--help' || first === '-h' || first === '--version' || first === '-v') return false;
  // 有其他参数时按子命令/一次性任务处理，避免误注入交互提示。
  return false;
}

export function extractClaudePrintPrompt(passthroughArgs) {
  const remainingArgs = [];
  let printMode = false;
  let prompt = '';

  for (let i = 0; i < passthroughArgs.length; i += 1) {
    const arg = passthroughArgs[i];
    if (arg === '-p' || arg === '--print') {
      printMode = true;
      continue;
    }
    if (printMode && !prompt) {
      prompt = arg;
      continue;
    }
    remainingArgs.push(arg);
  }

  if (printMode && !prompt) {
    return { printMode, prompt: '', remainingArgs: passthroughArgs };
  }

  return { printMode, prompt, remainingArgs };
}

export function extractOneShotPrompt(command, passthroughArgs) {
  if (command === 'claude') {
    return extractClaudePrintPrompt(passthroughArgs);
  }

  return {
    printMode: false,
    prompt: '',
    remainingArgs: passthroughArgs,
  };
}

import {
  buildRuntimeClientModelArgs as buildRegistryRuntimeClientModelArgs,
  buildTeamProviderRuntimeClientMap,
  getClientUnattendedArgs,
  getClientUnattendedInsertAfterToken,
} from '../clients/registry.mjs';

import { defaultModelRegistry } from './registry.mjs';
import { getModelConfig } from './selection.mjs';
import { normalizeId } from './shared.mjs';

const PROVIDER_CLIENT_MAP = Object.freeze(buildTeamProviderRuntimeClientMap('all'));

// 纯函数：把 provider 标识映射成实际可启动的客户端，隔离 provider/client 的命名差异。
export function providerToClientId(provider) {
  const key = normalizeId(provider);
  return PROVIDER_CLIENT_MAP[key] || '';
}

function cliUnattendedArgs(command = '') {
  return getClientUnattendedArgs(command);
}

function injectCliUnattendedArgs(command = '', template = '') {
  const tokens = String(template || '').trim().split(/\s+/u).filter(Boolean);
  const missing = cliUnattendedArgs(command).filter((arg) => !tokens.includes(arg));
  if (missing.length === 0) return tokens.join(' ');

  const promptFlagIndex = tokens.findIndex((token) => token === '-p' || token === '--print' || token === '--prompt');
  if (promptFlagIndex >= 0) {
    tokens.splice(promptFlagIndex, 0, ...missing);
    return tokens.join(' ');
  }

  const insertAfterToken = getClientUnattendedInsertAfterToken(command);
  if (insertAfterToken && tokens[0] === insertAfterToken) {
    tokens.splice(1, 0, ...missing);
    return tokens.join(' ');
  }

  tokens.push(...missing);
  return tokens.join(' ');
}

// 纯函数：根据模型 CLI 配置拼接无人值守命令，不直接执行，便于路由层只消费字符串。
export function buildCLICommand(modelConfig, rolePrompt, task) {
  if (!modelConfig?.cli) {
    return `claude --dangerously-skip-permissions -p "[${rolePrompt}] ${task}"`;
  }

  const { command, argsTemplate, modelArg, modelValue } = modelConfig.cli;
  const fullPrompt = `"[${rolePrompt}] ${task}"`;
  const parts = [command];
  const template = String(argsTemplate || '').trim();
  const templateAlreadyIncludesModel = modelArg && modelValue
    ? template.includes(modelArg) || template.includes(modelValue)
    : false;

  if (modelArg && modelValue && !templateAlreadyIncludesModel) {
    parts.push(modelArg, modelValue);
  }
  if (template) {
    parts.push(injectCliUnattendedArgs(command, template));
  } else {
    parts.push(...cliUnattendedArgs(command), '-p');
  }
  parts.push(fullPrompt);
  return parts.join(' ');
}

// 纯函数：将路由结果转成各客户端的模型参数，避免调用方继续写 client if/else。
export function buildClientModelArgs(clientId = '', modelRouting = null) {
  const route = modelRouting && typeof modelRouting === 'object' ? modelRouting : null;
  if (!route) return [];
  const modelId = normalizeId(route.modelId);
  const modelConfig = getModelConfig(modelId, defaultModelRegistry()) || null;
  const modelValue = modelConfig?.cli?.modelValue || modelId;
  const client = String(clientId || route.clientId || providerToClientId(route.provider)).trim().toLowerCase();
  return buildRegistryRuntimeClientModelArgs(client, modelValue);
}

import os from 'node:os';

import { getClientHomes } from '../../platform/paths.mjs';

export function resolveClientHomes(clientHomes) {
  return clientHomes && typeof clientHomes === 'object'
    ? clientHomes
    : getClientHomes(process.env, os.homedir());
}

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  AUTO_ROLES,
  ConfigError,
  applyEdits,
  diffEditable,
  migrateTargetRefs,
  parseDocument,
  toAutoPreview,
  toEditable,
  toModelCatalog,
  validateDocument,
} from '../../../../apps/shell/ui/src/lib/config/model-routing.mjs';

const registryText = JSON.stringify({
  activeModel: 'claude-sonnet-5',
  models: {
    'claude-opus-5': { protocols: ['claude'] },
    'claude-sonnet-5': { protocols: ['claude'] },
    'deepseek-v4-pro': { protocols: ['openai-chat'] },
  },
  providers: {
    relay: { baseUrl: 'https://coding.rexai.top', apiKeyEnv: 'env:REXAI_API_KEY', protocols: ['claude'], models: ['claude-opus-5', 'claude-sonnet-5'] },
    openai: { baseUrl: 'https://openai.example.com', protocols: ['openai-chat'], models: ['deepseek-v4-pro'] },
  },
  clientRoleMatrix: { default: { implementer: 'deepseek-v4-pro' }, clients: { claude: { implementer: 'claude-sonnet-5' } } },
});

test('parseDocument accepts a registry object and rejects non-JSON / non-object', () => {
  assert.equal(parseDocument(registryText).activeModel, 'claude-sonnet-5');
  assert.throws(() => parseDocument('{bad'), ConfigError);
  assert.throws(() => parseDocument('[]'), ConfigError);
});

test('toEditable projects providers list + matrix without exposing secrets beyond env refs', () => {
  const editable = toEditable(parseDocument(registryText));
  assert.equal(editable.providers[0].id, 'relay');
  assert.equal(editable.providers[0].apiKeyEnv, 'env:REXAI_API_KEY');
  assert.equal(editable.providers[0].authMode, 'required');
  assert.equal(editable.providers[0].endpointStyle, 'relay');
  assert.equal(Object.hasOwn(editable.providers[0], 'enabled'), false, 'omitted enabled metadata is not materialized');
  assert.equal(editable.matrix.default.implementer, 'deepseek-v4-pro');
  assert.equal(editable.matrix.clients.claude.implementer, 'claude-sonnet-5');
});

test('validateDocument rejects invalid keys, bad env refs, bad baseUrl, unknown protocols', () => {
  const base = parseDocument(registryText);
  assert.throws(() => validateDocument({ ...base, providers: { p: { baseUrl: 'https://x.com', apiKey: 'bad\nkey' } } }), ConfigError);
  assert.throws(() => validateDocument({ ...base, providers: { p: { baseUrl: 'https://x.com', apiKeyEnv: 'NOT_ENV' } } }), ConfigError);
  assert.throws(() => validateDocument({ ...base, providers: { p: { baseUrl: 'ftp://x.com' } } }), ConfigError);
  assert.throws(() => validateDocument({ ...base, providers: { p: { baseUrl: 'https://x.com', protocols: ['bogus'] } } }), ConfigError);
  const inline = structuredClone(base);
  inline.providers.relay.apiKey = 'sk-secret';
  assert.doesNotThrow(() => validateDocument(inline));
  assert.equal(inline.providers.relay.apiKey, 'sk-secret');
  assert.doesNotThrow(() => validateDocument(base));
});

test('applyEdits rebuilds providers + matrix and preserves other registry sections', () => {
  const document = parseDocument(registryText);
  const editable = toEditable(document);
  editable.matrix.default.planner = 'claude-opus-5';
  editable.providers.push({ id: 'custom', baseUrl: 'https://api.example.com', apiKeyEnv: 'env:MY_KEY', protocols: ['openai-chat'], models: ['qwen3.8-flash'] });
  const next = applyEdits(document, editable);
  assert.equal(next.activeModel, 'model:claude-sonnet-5', 'unrelated assignment migrates');
  assert.ok(next.models['claude-opus-5'], 'models preserved');
  assert.equal(next.clientRoleMatrix.default.planner, 'model:claude-opus-5');
  assert.equal(next.providers.custom.baseUrl, 'https://api.example.com');
  assert.doesNotThrow(() => validateDocument(next));
});

test('diffEditable detects provider and matrix changes', () => {
  const before = toEditable(parseDocument(registryText));
  const after = toEditable(parseDocument(registryText));
  assert.deepEqual(diffEditable(before, after), []);
  after.matrix.default.reviewer = 'claude-opus-5';
  assert.deepEqual(diffEditable(before, after), ['clientRoleMatrix']);
  after.providers[0].baseUrl = 'https://other.example.com';
  assert.deepEqual(diffEditable(before, after), ['providers', 'clientRoleMatrix']);
});

test('applyEdits prunes empty role overrides and empty client maps', () => {
  const document = parseDocument(registryText);
  const editable = toEditable(document);
  editable.matrix.clients.claude = { implementer: '', reviewer: 'claude-opus-5' };
  editable.matrix.clients.codex = { implementer: '' };
  editable.matrix.default.planner = '';
  const next = applyEdits(document, editable);
  assert.deepEqual(next.clientRoleMatrix.clients.claude, { reviewer: 'model:claude-opus-5' }, 'empty role pruned, non-empty migrated');
  assert.equal(next.clientRoleMatrix.clients.codex, undefined, 'fully-empty client map removed');
  assert.equal(next.clientRoleMatrix.default.planner, undefined, 'empty default role pruned');
});

const autoRegistry = {
  activeModel: 'claude-sonnet-5',
  models: {
    'claude-opus-5': { label: 'Claude Opus 5', protocols: ['claude'], cost: 'highest', speed: 'slow' },
    'deepseek-v4': { label: 'DeepSeek-V4-Pro', protocols: ['openai-chat'], cost: 'lowest', speed: 'fast' },
    'gpt-6-astra': { label: 'GPT-6-Astra', protocols: ['openai-chat'], cost: 'highest', speed: 'fast' },
  },
  providers: {
    claude: { baseUrl: 'https://claude.example.com', protocols: ['claude'], models: ['claude-opus-5'] },
    openai: { baseUrl: 'https://openai.example.com', protocols: ['openai-chat'], models: ['deepseek-v4', 'gpt-6-astra'] },
  },
  roleDefaults: {
    planner: { taskType: 'planning' },
    implementer: { taskType: 'implementation' },
    reviewer: { taskType: 'code-review' },
    'security-reviewer': { taskType: 'security-review' },
    'team-lead': { taskType: 'planning', preferredModel: 'claude-opus-5' },
    'team-member': { taskType: 'implementation' },
  },
  routingRules: [
    { taskType: 'planning', description: '任务拆解', primary: 'gpt-6-astra', fallback: ['claude-opus-5'] },
    { taskType: 'implementation', description: '写代码', primary: 'deepseek-v4', fallback: [] },
    { taskType: 'code-review', description: '代码审查', primary: 'claude-opus-5', fallback: [] },
    { taskType: 'security-review', description: '安全审计', primary: 'claude-opus-5', fallback: [] },
  ],
  clientRoleMatrix: { default: {}, clients: {} },
};
const previewByRole = (document) => Object.fromEntries(toAutoPreview(document).map((row) => [row.role, row]));

test('toAutoPreview resolves each role from roleDefaults → routingRules (no guessing)', () => {
  const rows = previewByRole(autoRegistry);
  assert.deepEqual(toAutoPreview(autoRegistry).map((row) => row.role), [...AUTO_ROLES]);
  assert.equal(rows.planner.effectiveModelId, 'gpt-6-astra', 'planning rule primary');
  assert.equal(rows.implementer.effectiveModelId, 'deepseek-v4', 'implementation rule primary');
  assert.equal(rows.reviewer.effectiveModelId, 'claude-opus-5');
  assert.equal(rows['team-lead'].effectiveModelId, 'claude-opus-5', 'preferredModel wins over rule primary');
  assert.equal(rows.implementer.label, 'DeepSeek-V4-Pro');
  assert.equal(rows.implementer.cost, 'lowest');
  assert.equal(rows.implementer.speed, 'fast');
  assert.ok(Object.values(rows).every((row) => row.overridden === false), 'no override → all auto');
});

test('toAutoPreview marks a matrix override and keeps the auto choice visible', () => {
  const document = { ...autoRegistry, clientRoleMatrix: { default: { implementer: 'claude-opus-5' }, clients: {} } };
  const rows = previewByRole(document);
  assert.equal(rows.implementer.effectiveModelId, 'claude-opus-5');
  assert.equal(rows.implementer.autoModelId, 'deepseek-v4');
  assert.equal(rows.implementer.overridden, true);
  assert.equal(rows.implementer.cost, 'highest', 'metadata follows the effective model');
  assert.equal(rows.planner.overridden, false, 'other roles stay auto');
});

test('toAutoPreview treats an override equal to the auto choice as not overridden', () => {
  const document = { ...autoRegistry, clientRoleMatrix: { default: { implementer: 'deepseek-v4' }, clients: {} } };
  assert.equal(previewByRole(document).implementer.overridden, false);
});

test('toAutoPreview ignores unbound metadata in activeModel and never throws on a sparse registry', () => {
  for (const document of [
    { activeModel: 'claude-sonnet-5', models: {} },
    { ...autoRegistry, providers: {}, clientRoleMatrix: { default: { planner: 'gpt-6-astra' } } },
  ]) {
    const rows = previewByRole(document);
    assert.deepEqual(toModelCatalog(document), []);
    assert.ok(Object.values(rows).every((row) => !row.available && !row.effectiveModelId && !row.autoModelId));
    assert.equal(rows.planner.cost, 'unknown');
    assert.equal(rows.planner.label, '', 'metadata-only rules and overrides are not routes');
    assert.equal(rows.planner.unavailableModelId, document.clientRoleMatrix?.default.planner || '');
  }
  assert.equal(previewByRole(parseDocument(registryText)).planner.effectiveModelId, 'claude-sonnet-5', 'an explicitly bound active model remains eligible');
});

const intentRegistry = {
  activeModel: 'claude-opus-5',
  models: {
    'glm-5.3-flash': { label: 'GLM-5.3-Flash', protocols: ['openai-chat'], cost: 'lowest' },
    'claude-opus-5': { label: 'Claude Opus 5', protocols: ['claude'], cost: 'highest' },
    'gemini-3.8-flash': { label: 'Gemini-3.8-Flash', protocols: ['gemini'], cost: 'medium' },
  },
  providers: {
    openai: { baseUrl: 'https://openai.example.com', protocols: ['openai-chat'], models: ['glm-5.3-flash'] },
    claude: { baseUrl: 'https://claude.example.com', protocols: ['claude'], models: ['claude-opus-5'] },
    gemini: { baseUrl: 'https://gemini.example.com', protocols: ['gemini'], models: ['gemini-3.8-flash'] },
  },
  intentRouting: {
    enabled: true,
    classifierModel: 'glm-5.3-flash',
    intents: [
      { id: 'quick', description: '快速问答', modelId: 'glm-5.3-flash' },
      { id: 'review', description: '代码审查', modelId: 'claude-opus-5' },
    ],
  },
};

test('toEditable projects intentRouting; absent section projects as disabled empty shape', () => {
  const editable = toEditable(intentRegistry);
  assert.equal(editable.intentRouting.enabled, true);
  assert.equal(editable.intentRouting.classifierModel, 'glm-5.3-flash');
  assert.deepEqual(editable.intentRouting.intents[0], { id: 'quick', description: '快速问答', modelId: 'glm-5.3-flash' });
  editable.intentRouting.intents[0].id = 'mutated';
  assert.equal(intentRegistry.intentRouting.intents[0].id, 'quick', 'projection is a copy');
  const absent = toEditable(parseDocument(registryText));
  assert.deepEqual(absent.intentRouting, { enabled: false, classifierModel: '', intents: [] });
});

test('validateDocument accepts a valid intentRouting section', () => {
  assert.doesNotThrow(() => validateDocument(intentRegistry));
  assert.doesNotThrow(() => validateDocument({ ...intentRegistry, intentRouting: { enabled: false, classifierModel: '', intents: [] } }), 'disabled empty config is valid');
});

test('confidenceThreshold survives the editable round-trip and is validated at the boundary', () => {
  const withGate = { ...intentRegistry, intentRouting: { ...intentRegistry.intentRouting, confidenceThreshold: 0.7 } };
  assert.doesNotThrow(() => validateDocument(withGate));
  assert.equal(toEditable(withGate).intentRouting.confidenceThreshold, 0.7);
  const editable = toEditable(withGate);
  assert.equal(applyEdits(intentRegistry, editable).intentRouting.confidenceThreshold, 0.7, 'a UI save preserves the gate');
  for (const bad of [1.5, -0.1, NaN, 'high']) {
    assert.throws(() => validateDocument({ ...intentRegistry, intentRouting: { ...intentRegistry.intentRouting, confidenceThreshold: bad } }), ConfigError);
  }
});

const singularClassifierRegistry = (protocol) => ({
  models: { classifier: { source: 'discovered', provider: 'relay', protocol, upstreamModel: 'Vendor/Classifier' } },
  providers: { relay: { baseUrl: 'https://relay.example.invalid', protocols: ['openai-chat', 'claude', 'gemini', 'openai-response'], models: [] } },
  intentRouting: { enabled: true, classifierModel: 'classifier', intents: [{ id: 'code', description: 'Coding', modelId: 'classifier' }] },
});

for (const [protocol, normalized] of [
  ['openai', 'openai-chat'], ['compatible', 'openai-chat'], ['chat_completions', 'openai-chat'],
  ['messages', 'claude'], ['anthropic', 'claude'], ['anthropic_messages', 'claude'],
]) {
  test(`classifier accepts singular protocol ${protocol} in snapshots and unchanged or omitted intent edits`, () => {
    for (const source of ['custom', 'discovered', 'curated']) {
      const document = singularClassifierRegistry(protocol);
      document.models.classifier.source = source;
      if (source === 'curated') document.providers.relay.models = ['classifier'];
      const original = structuredClone(document);
      assert.deepEqual(toModelCatalog(document)[0].protocols, [normalized]);
      assert.doesNotThrow(() => validateDocument(document), source);
      for (const editable of [{}, { intentRouting: toEditable(document).intentRouting }, toEditable(document)]) {
        const next = applyEdits(document, editable);
        assert.doesNotThrow(() => validateDocument(next, { previousDocument: document }), source);
        assert.deepEqual(next, migrateTargetRefs(original), 'only assignments migrate; singular protocol metadata stays literal');
      }
      assert.deepEqual(document, original);
    }
  });
}

test('full custom edits preserve singular declarations, omitted fields and provider-list bindings unless explicitly edited', () => {
  for (const protocol of ['openai', 'messages', 'anthropic']) {
    for (const binding of ['explicit', 'provider-list']) {
      const document = singularClassifierRegistry(protocol);
      Object.assign(document.models.classifier, {
        source: 'custom', upstreamModel: ' Vendor/Case-Sensitive ', extension: { keep: ['raw metadata'] },
      });
      if (binding === 'provider-list') {
        delete document.models.classifier.provider;
        document.providers.relay.models = ['classifier'];
      } else document.models.classifier.provider = ' RELAY ';
      const original = structuredClone(document);
      const editable = toEditable(document);
      assert.deepEqual(editable.customModels[0].protocols, [protocol]);
      assert.deepEqual(applyEdits(document, editable), migrateTargetRefs(original), 'only assignments migrate; absent defaults and raw metadata stay unchanged');
      editable.providers[0].baseUrl = 'https://changed.example.invalid';
      let next = applyEdits(document, editable);
      assert.doesNotThrow(() => validateDocument(next, { previousDocument: document }));
      assert.deepEqual(next, { ...migrateTargetRefs(original), providers: { relay: { ...original.providers.relay, baseUrl: editable.providers[0].baseUrl } } });
      editable.customModels[0].label = 'Renamed classifier';
      next = applyEdits(document, editable);
      assert.doesNotThrow(() => validateDocument(next, { previousDocument: document }));
      assert.deepEqual(next.models.classifier, { ...original.models.classifier, label: 'Renamed classifier' });
      assert.deepEqual(document, original);
      editable.customModels[0].protocols = [protocol === 'openai' ? 'messages' : 'openai'];
      if (binding === 'provider-list') assert.throws(() => applyEdits(document, editable), /explicitly configured provider/u);
      editable.customModels[0].provider = 'relay';
      next = applyEdits(document, editable);
      assert.doesNotThrow(() => validateDocument(next, { previousDocument: document }));
      assert.deepEqual(next.models.classifier, {
        ...original.models.classifier,
        ...(binding === 'provider-list' ? { provider: 'relay' } : {}),
        label: 'Renamed classifier', protocols: editable.customModels[0].protocols,
      });
      assert.deepEqual(diffEditable(toEditable(document), toEditable(next)), ['targetRefVersion', 'providers', 'models', 'intentRouting']);
    }
  }
});

test('custom arrays take precedence over singular protocols and full saves never repair invalid declarations implicitly', () => {
  for (const protocols of [['messages'], [], ['gemini'], ['responses'], ['bogus'], null, 'openai']) {
    const document = singularClassifierRegistry('openai');
    Object.assign(document.models.classifier, { source: 'custom', protocols });
    const original = structuredClone(document);
    const editable = toEditable(document);
    if (Array.isArray(protocols)) assert.deepEqual(editable.customModels[0].protocols, protocols);
    for (const enabled of [true, false]) {
      document.intentRouting.enabled = enabled;
      editable.intentRouting.enabled = enabled;
      if (Array.isArray(protocols) && protocols[0] === 'messages') {
        const next = applyEdits(document, editable);
        assert.doesNotThrow(() => validateDocument(next, { previousDocument: document }));
        assert.deepEqual(next.models, original.models);
        assert.deepEqual(toModelCatalog(next)[0].protocols, ['claude']);
      } else {
        for (const check of [() => validateDocument(document), () => applyEdits(document, editable)]) assert.throws(check, ConfigError);
      }
      assert.deepEqual(document.models, original.models);
    }
  }
});

test('unchanged singular custom references still require a valid unambiguous compatible binding', () => {
  for (const kind of ['missing', 'unbound', 'ambiguous', 'incompatible']) {
    const document = singularClassifierRegistry('openai');
    document.models.classifier.source = 'custom';
    delete document.models.classifier.provider;
    if (kind === 'missing') delete document.models.classifier;
    if (kind === 'ambiguous') {
      document.providers.relay.models = ['classifier'];
      document.providers.other = { ...document.providers.relay, enabled: false };
    }
    if (kind === 'incompatible') Object.assign(document.providers.relay, { models: ['classifier'], protocols: ['claude'] });
    for (const enabled of [true, false]) {
      document.intentRouting.enabled = enabled;
      const original = structuredClone(document);
      for (const check of [() => validateDocument(document), () => validateDocument(document, { previousDocument: document }),
        () => applyEdits(document, {}), () => applyEdits(document, toEditable(document))]) {
        assert.throws(check, ConfigError, `${kind}/enabled=${enabled}`);
        assert.deepEqual(document, original);
      }
    }
  }
});

test('classifier uses the catalog protocol intersection and arrays take precedence over singular protocol', () => {
  for (const [protocol, protocols, providerProtocols, expected, valid] of [
    ['responses', ['messages'], ['claude'], ['claude'], true],
    ['messages', ['chat_completions'], ['openai-chat'], ['openai-chat'], true],
    ['openai', ['gemini'], ['gemini'], ['gemini'], false],
    ['messages', ['responses'], ['openai-response'], ['openai-response'], false],
    ['openai', [], ['openai-chat'], [], false],
    ['openai', ['messages', 'responses'], ['openai-response'], ['openai-response'], false],
  ]) {
    const document = singularClassifierRegistry(protocol);
    Object.assign(document.models.classifier, { source: 'curated', protocols });
    Object.assign(document.providers.relay, { models: ['classifier'], protocols: providerProtocols });
    assert.deepEqual(toModelCatalog(document).flatMap((model) => model.protocols), expected);
    for (const enabled of [true, false]) {
      document.intentRouting.enabled = enabled;
      for (const check of [() => validateDocument(document), () => validateDocument(document, { previousDocument: document }),
        () => applyEdits(document, {}), () => applyEdits(document, toEditable(document))]) {
        if (valid) assert.doesNotThrow(check);
        else assert.throws(check, { name: 'ConfigError', path: 'intentRouting.classifierModel' });
      }
    }
  }
});

for (const pause of ['model', 'provider', 'both']) {
  for (const enabled of [true, false]) {
    test(`singular classifier retains valid ${pause}-paused bindings with intent enabled=${enabled} but rejects new assignments`, () => {
      for (const protocol of ['openai', 'messages', 'anthropic']) {
        const document = singularClassifierRegistry(protocol);
        document.intentRouting.enabled = enabled;
        if (pause !== 'provider') document.models.classifier.enabled = false;
        if (pause !== 'model') document.providers.relay.enabled = false;
        assert.deepEqual(toModelCatalog(document), []);
        assert.equal(toModelCatalog(document, { includeDisabled: true }).length, 1);
        assert.doesNotThrow(() => validateDocument(document));
        for (const editable of [{}, toEditable(document)]) {
          const next = applyEdits(document, editable);
          assert.doesNotThrow(() => validateDocument(next, { previousDocument: document }));
          assert.deepEqual(next.intentRouting, migrateTargetRefs(document).intentRouting);
        }
        const unassigned = { ...document, intentRouting: { enabled: false, classifierModel: '', intents: [] } };
        assert.throws(() => validateDocument(document, { previousDocument: unassigned }), /enabled explicit provider binding/u);
        for (const intentRouting of [document.intentRouting, { ...document.intentRouting, enabled: false },
          { ...document.intentRouting, enabled: false, classifierModel: '' }]) {
          assert.throws(() => applyEdits(unassigned, { intentRouting }), /enabled explicit provider binding/u);
        }
        const disabled = { ...document, intentRouting: { ...document.intentRouting, enabled: false } };
        assert.throws(() => applyEdits(disabled, { intentRouting: { ...document.intentRouting, enabled: true } }), /enabled explicit provider binding/u);
      }
    });
  }
}

for (const target of ['classifier', 'intent']) {
  test(`singular protocols never exempt unchanged invalid ${target} references, including disabled intents`, () => {
    for (const kind of ['missing', 'unbound', 'ambiguous', 'incompatible']) {
      const document = singularClassifierRegistry('openai');
      document.models.stale = { protocol: 'openai' };
      if (kind === 'missing') delete document.models.stale;
      if (kind === 'ambiguous') {
        document.providers.relay.models = ['stale'];
        document.providers.other = { ...document.providers.relay, enabled: false };
      }
      if (kind === 'incompatible') document.providers.other = {
        baseUrl: 'https://other.example.invalid', protocols: ['claude'], models: ['stale'],
      };
      if (target === 'classifier') document.intentRouting.classifierModel = 'stale';
      else document.intentRouting.intents[0].modelId = 'stale';
      for (const enabled of [true, false]) {
        document.intentRouting.enabled = enabled;
        const original = structuredClone(document);
        for (const check of [() => validateDocument(document), () => validateDocument(document, { previousDocument: document }),
          () => applyEdits(document, {}), () => applyEdits(document, toEditable(document))]) {
          assert.throws(check, ConfigError, `${target}/${kind}/enabled=${enabled}`);
          assert.deepEqual(document, original, 'invalid references must be explicitly repaired, never silently migrated');
        }
      }
    }
  });
}

test('validateDocument rejects malformed intentRouting at the boundary', () => {
  const withIntent = (intentRouting) => ({ ...intentRegistry, intentRouting });
  assert.throws(() => validateDocument(withIntent('nope')), ConfigError);
  assert.throws(() => validateDocument(withIntent({ ...intentRegistry.intentRouting, enabled: 'yes' })), ConfigError);
  assert.throws(() => validateDocument(withIntent({ ...intentRegistry.intentRouting, classifierModel: '' })), ConfigError);
  assert.throws(() => validateDocument(withIntent({ ...intentRegistry.intentRouting, classifierModel: 'no-such-model' })), ConfigError);
  assert.throws(() => validateDocument(withIntent({ ...intentRegistry.intentRouting, classifierModel: 'gemini-3.8-flash' })), ConfigError, 'classifier must speak openai-chat or claude');
  assert.throws(() => validateDocument(withIntent({ ...intentRegistry.intentRouting, intents: [] })), ConfigError);
  assert.throws(() => validateDocument(withIntent({ ...intentRegistry.intentRouting, intents: [{ id: '', description: 'x', modelId: 'claude-opus-5' }] })), ConfigError);
  assert.throws(() => validateDocument(withIntent({ ...intentRegistry.intentRouting, intents: [{ id: 'x', description: '', modelId: 'claude-opus-5' }] })), ConfigError);
  assert.throws(() => validateDocument(withIntent({ ...intentRegistry.intentRouting, intents: [{ id: 'x', description: 'x', modelId: 'no-such-model' }] })), ConfigError);
  assert.throws(() => validateDocument(withIntent({ ...intentRegistry.intentRouting, intents: [...intentRegistry.intentRouting.intents, { id: 'quick', description: 'dup', modelId: 'claude-opus-5' }] })), ConfigError, 'duplicate intent id');
});

test('applyEdits rebuilds intentRouting: normalizes intent ids, canonicalizes targets, and prunes blank rows', () => {
  const editable = toEditable(intentRegistry);
  editable.intentRouting.classifierModel = ' GLM-5.3-Flash ';
  assert.throws(() => applyEdits(intentRegistry, editable), /classifier must be a concrete model/u, 'classifier IDs are literal, not normalized');
  editable.intentRouting.classifierModel = 'glm-5.3-flash';
  editable.intentRouting.intents.push({ id: ' Tests ', description: ' 写测试 ', modelId: 'claude-opus-5' });
  editable.intentRouting.intents.push({ id: '', description: '', modelId: '' });
  const next = applyEdits(intentRegistry, editable);
  assert.equal(next.intentRouting.classifierModel, 'glm-5.3-flash');
  assert.equal(next.intentRouting.intents.length, 3, 'blank row pruned');
  assert.deepEqual(next.intentRouting.intents[2], { id: 'tests', description: '写测试', modelId: 'model:claude-opus-5' });
  assert.equal(next.activeModel, 'model:claude-opus-5', 'unrelated assignment migrates');
  assert.doesNotThrow(() => validateDocument(next));
  const untouched = applyEdits(intentRegistry, { matrix: { default: {}, clients: {} } });
  assert.deepEqual(untouched.intentRouting, migrateTargetRefs(intentRegistry).intentRouting, 'omitted assignment sections still migrate');
});

test('diffEditable detects intentRouting changes', () => {
  const before = toEditable(intentRegistry);
  const after = toEditable(intentRegistry);
  assert.deepEqual(diffEditable(before, after), []);
  after.intentRouting.enabled = false;
  assert.deepEqual(diffEditable(before, after), ['intentRouting']);
});

test('toModelCatalog projects the model list for selects', () => {
  const catalog = toModelCatalog(intentRegistry);
  assert.deepEqual(catalog.map((m) => m.id), ['glm-5.3-flash', 'claude-opus-5', 'gemini-3.8-flash']);
  assert.deepEqual(catalog[0], { id: 'glm-5.3-flash', label: 'GLM-5.3-Flash', protocols: ['openai-chat'], cost: 'lowest', source: 'curated', provider: 'openai', upstreamModel: 'glm-5.3-flash', generationVerified: false });
});

test('customModels：toEditable 只投影 custom 条目；applyEdits 重建 custom 而保留 curated/discovered 画像', () => {
  const document = {
    models: {
      'curated-x': { protocols: ['claude'], label: 'Curated', cost: 'low', strengths: ['code'], source: 'curated' },
      'disc-y': { protocols: ['gemini'], label: 'disc-y', source: 'discovered' },
      'old-custom': { protocols: ['claude'], label: 'Old', source: 'custom' },
    },
    providers: { relay: { baseUrl: 'https://relay.example.com', protocols: ['openai-chat'], models: [] } },
  };
  const editable = toEditable(document);
  assert.deepEqual(editable.customModels.map((m) => m.id), ['old-custom'], '只投影 custom');
  assert.equal(editable.customModels[0].upstreamModel, 'old-custom', 'an omitted upstream id projects the local id');
  const next = applyEdits(document, { ...editable, customModels: [{ id: 'new-custom', label: 'New', protocols: ['openai-chat'], provider: 'relay', upstreamModel: 'Vendor/New-V1:Latest' }] });
  assert.ok(!next.models['old-custom'], '旧 custom 被替换');
  assert.equal(next.models['new-custom'].source, 'custom');
  assert.deepEqual(next.models['new-custom'].protocols, ['openai-chat']);
  assert.equal(toEditable(next).customModels[0].upstreamModel, 'Vendor/New-V1:Latest', 'upstream ids retain case and punctuation');
  assert.equal(next.models['curated-x'].label, 'Curated', 'curated 保留');
  assert.deepEqual(next.models['curated-x'].strengths, ['code'], 'curated 画像保留');
  assert.equal(next.models['disc-y'].source, 'discovered', 'discovered 保留');
  assert.doesNotThrow(() => validateDocument(next));
  assert.throws(() => validateDocument({ models: { bad: { source: 'custom', protocols: ['nope'] } } }), /unknown protocol/u);
});

test('builtin registry seed starts empty with no implicit gateway provider or route', () => {
  const builtin = parseDocument(fs.readFileSync(new URL('../../../lib/tooling/specs/registry/model-registry.json', import.meta.url), 'utf8'));
  assert.doesNotThrow(() => validateDocument(builtin));
  assert.deepEqual(builtin.providers, {});
  assert.deepEqual(builtin.models, {});
  assert.equal(builtin.activeModel, '');
  assert.deepEqual(builtin.intentRouting, { enabled: false, classifierModel: '', intents: [] });
  assert.deepEqual(toModelCatalog(builtin), []);
  assert.ok(toAutoPreview(builtin).every((row) => !row.available && !row.effectiveModelId));
});

const metadataRegistry = () => ({
  ...parseDocument(registryText),
  providers: { relay: {
    baseUrl: 'https://relay.example.com', apiKeyEnv: 'env:RELAY_KEY', protocols: ['claude', 'openai-chat'], models: ['claude-opus-5', 'claude-sonnet-5', 'deepseek-v4-pro'],
    headers: { 'x-region': 'west' }, protocolBaseUrls: { claude: 'https://claude.example.com', 'openai-chat': 'https://relay.example.com/openai/v1' },
    enabled: false, retryPolicy: { attempts: 3 },
    accounts: [
      { id: 'primary', apiKeyEnv: 'env:PRIMARY_KEY', weight: 3, label: 'Primary' },
      { id: 'backup', apiKeyEnv: 'env:BACKUP_KEY', weight: 1, enabled: false },
    ],
  } },
  routingGroups: { review: {
    id: 'review', models: ['claude-opus-5'], routing: 'weight',
    weights: { 'claude-opus-5': 3 }, accountIds: ['primary'], description: 'Review pool',
  } },
});

test('provider edits preserve optional metadata and match account metadata by id after reorder', () => {
  const document = metadataRegistry();
  const original = structuredClone(document);
  assert.deepEqual(toModelCatalog(document), [], 'paused explicit bindings are not selectable gateway models');
  const editable = toEditable(document);
  editable.providers[0].baseUrl = 'https://new.example.com';
  editable.providers[0].apiKeyEnv = '';
  editable.providers[0].accounts.reverse();
  editable.providers[0].accounts[1].apiKeyEnv = 'env:ROTATED_KEY';
  const provider = applyEdits(document, editable).providers.relay;
  const expected = {
    ...document.providers.relay, baseUrl: 'https://new.example.com',
    accounts: [document.providers.relay.accounts[1], { ...document.providers.relay.accounts[0], apiKeyEnv: 'env:ROTATED_KEY' }],
  };
  delete expected.apiKeyEnv;
  assert.deepEqual(provider, expected);
  assert.deepEqual(applyEdits(document, editable).routingGroups, document.routingGroups, 'unedited group metadata survives unrelated edits');
  assert.deepEqual(applyEdits(document, editable).clientRoleMatrix, migrateTargetRefs(document).clientRoleMatrix, 'paused explicit assignments survive migration and unrelated provider edits');
  assert.deepEqual(document, original, 'applying edits does not mutate the source');
});

test('omitted accounts preserve old-client metadata; an explicit empty list clears accounts', () => {
  const document = metadataRegistry();
  const editable = toEditable(document);
  delete editable.providers[0].accounts;
  assert.deepEqual(applyEdits(document, editable).providers.relay.accounts, document.providers.relay.accounts);
  editable.providers[0].accounts = [];
  assert.equal(applyEdits(document, editable).providers.relay.accounts, undefined);
});

test('group-only changes are detected and persisted without dropping weights or provider metadata', () => {
  const document = metadataRegistry();
  const before = toEditable(document);
  const editable = toEditable(document);
  editable.routingGroups[0].routing = 'order';
  const next = applyEdits(document, editable);
  assert.deepEqual(diffEditable(before, toEditable(next)), ['targetRefVersion', 'activeModel', 'clientRoleMatrix', 'routingGroups']);
  assert.deepEqual(next.routingGroups.review, { ...document.routingGroups.review, routing: 'order' });
  assert.deepEqual(next.providers, document.providers);
  assert.doesNotThrow(() => validateDocument(next));
});

test('omitted routingGroups preserve legacy configuration; explicit deletion and additions are detected', () => {
  const document = metadataRegistry();
  const editable = toEditable(document);
  delete editable.routingGroups;
  assert.deepEqual(applyEdits(document, editable).routingGroups, document.routingGroups);
  editable.routingGroups = [];
  const cleared = applyEdits(document, editable);
  assert.deepEqual(cleared.routingGroups, {});
  assert.deepEqual(diffEditable(toEditable(document), toEditable(cleared)), ['targetRefVersion', 'activeModel', 'clientRoleMatrix', 'routingGroups']);
  editable.routingGroups = [{ id: 'new', models: [], routing: 'smart' }];
  const added = applyEdits(cleared, editable);
  assert.deepEqual(diffEditable(toEditable(cleared), toEditable(added)), ['routingGroups']);
  assert.doesNotThrow(() => validateDocument(added), 'group storage permits empty groups');
});

test('applyEdits rejects duplicate provider, custom model, and group ids before object conversion', () => {
  const document = metadataRegistry();
  for (const [section, row] of [
    ['providers', toEditable(document).providers[0]],
    ['customModels', { id: 'custom', provider: 'relay', protocols: ['claude'] }],
    ['routingGroups', toEditable(document).routingGroups[0]],
  ]) {
    const editable = toEditable(document);
    editable[section] = [row, { ...row, id: ` ${row.id.toUpperCase()} ` }];
    assert.throws(() => applyEdits(document, editable), { name: 'ConfigError', path: section, message: /duplicate/u });
    editable[section] = [{ ...row, id: '' }];
    assert.throws(() => applyEdits(document, editable), ConfigError, `${section} requires an id`);
    editable[section] = {};
    assert.throws(() => applyEdits(document, editable), ConfigError, `${section} must be a list`);
  }
});

test('group validation checks structure and references while treating mode names as stored metadata', () => {
  const document = metadataRegistry();
  for (const routingGroups of [null, [], { bad: null }, { bad: { models: 'claude-opus-5' } },
    { bad: { models: [''] } }, { bad: { models: ['missing'] } },
    { bad: { models: [], routing: 123 } }, { bad: { models: [], routing: ' ' } }]) {
    assert.throws(() => validateDocument({ ...document, routingGroups }), ConfigError);
  }
  for (const routing of ['smart', 'order', 'rotate', 'usage', 'drain', 'pace', 'weight', 'fast', 'cheap', 'future-mode']) {
    assert.doesNotThrow(() => validateDocument({ ...document, routingGroups: { pool: { models: [], routing } } }));
  }
  const editable = toEditable(document);
  for (const models of ['not-a-list', null]) {
    editable.routingGroups[0].models = models;
    assert.throws(() => validateDocument(applyEdits(document, editable)), ConfigError, 'invalid input must not be silently coerced to an empty list');
  }
});

test('custom models cannot overwrite curated, discovered, or implicit curated ids', () => {
  for (const source of ['curated', 'discovered', undefined]) {
    const document = { models: { protected: { source, protocols: ['claude'], strengths: ['code'] } } };
    const editable = toEditable(document);
    editable.customModels = [{ id: ' PROTECTED ', provider: 'relay', protocols: ['claude'] }];
    assert.throws(() => applyEdits(document, editable), { name: 'ConfigError', path: 'models.protected', message: /overwrite/u });
  }
});

test('custom edits retain non-editable metadata and reject implicit relay provider references', () => {
  const document = metadataRegistry();
  document.models.custom = { source: 'custom', protocols: ['claude'], provider: 'relay', label: 'Old', cost: 'low', speed: 'fast', contextWindow: 200000, strengths: ['code'] };
  const editable = toEditable(document);
  editable.customModels[0].label = 'Renamed';
  const next = applyEdits(document, editable);
  assert.deepEqual(next.models.custom, { ...document.models.custom, label: 'Renamed' });
  next.providers.custom = { baseUrl: 'https://custom.example.com', protocols: ['claude'] };
  next.models.custom.provider = 'custom';
  assert.doesNotThrow(() => validateDocument(next), 'configured providers can be referenced');
  next.models.custom.provider = 'relay';
  assert.throws(() => validateDocument({ ...next, providers: {} }), { name: 'ConfigError', path: 'models.custom.provider', message: /unknown provider/u });
  assert.doesNotThrow(() => validateDocument({ models: { legacy: { source: 'custom' } } }), 'legacy missing provider remains valid');
  next.models.custom.provider = 'missing';
  assert.throws(() => validateDocument(next), { name: 'ConfigError', path: 'models.custom.provider', message: /unknown provider/u });
  next.models.custom.provider = 'relay';
  next.models.custom.protocols = ['bogus'];
  assert.throws(() => validateDocument(next), /unknown protocol/u);
});

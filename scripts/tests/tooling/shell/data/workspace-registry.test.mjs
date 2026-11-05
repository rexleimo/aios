import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
	ALLOWED_KEYS,
	listWorkspaces,
	recordWorkspace,
	registryDisabled,
	registryPath,
} from '../../../../../scripts/lib/foundation/workspaces/registry.mjs';

function sandbox() {
	const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-registry-'));
	const project = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-project-'));
	fs.mkdirSync(path.join(project, '.aios', 'memo', 'file'), { recursive: true });
	return { home, project };
}

test('每个工作区一个文件，字段只有白名单里的那几个', () => {
	const { home, project } = sandbox();
	const file = recordWorkspace({ rootDir: project, homeDir: home, aiosVersion: '7.0.1' });
	assert.ok(file && fs.existsSync(file));
	assert.equal(file, registryPath(project, home));
	const entry = JSON.parse(fs.readFileSync(file, 'utf8'));
	for (const key of Object.keys(entry)) assert.ok(ALLOWED_KEYS.includes(key), `未允许的键：${key}`);
	assert.equal(entry.path, path.resolve(project));
});

test('两个项目互不覆盖', () => {
	const { home, project } = sandbox();
	const other = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-project-'));
	recordWorkspace({ rootDir: project, homeDir: home });
	recordWorkspace({ rootDir: other, homeDir: home });
	const list = listWorkspaces({ homeDir: home });
	assert.equal(list.length, 2);
	assert.notEqual(registryPath(project, home), registryPath(other, home));
});

test('关闭开关时不写任何文件', () => {
	const { home, project } = sandbox();
	const written = recordWorkspace({ rootDir: project, homeDir: home, env: { AIOS_NO_WORKSPACE_REGISTRY: '1' } });
	assert.equal(written, null);
	assert.equal(fs.existsSync(path.join(home, '.aios', 'workspaces')), false);
	assert.equal(registryDisabled({ AIOS_NO_WORKSPACE_REGISTRY: '1' }), true);
});

test('项目被删掉后标记 missing，超期标记 stale，都不删条目', () => {
	const { home, project } = sandbox();
	recordWorkspace({ rootDir: project, homeDir: home });
	const [fresh] = listWorkspaces({ homeDir: home });
	assert.equal(fresh.missing, false);
	assert.equal(fresh.stale, false);

	// 超期：最后见到的时间拨回 100 天前，项目仍在
	const old = new Date(Date.now() - 100 * 24 * 3600_000);
	recordWorkspace({ rootDir: project, homeDir: home, now: old });
	assert.equal(listWorkspaces({ homeDir: home })[0].stale, true);
	assert.equal(listWorkspaces({ homeDir: home })[0].missing, false);

	// 消失：目录被删，条目保留并标记
	fs.rmSync(project, { recursive: true, force: true });
	const [gone] = listWorkspaces({ homeDir: home });
	assert.equal(gone.missing, true);
	assert.equal(listWorkspaces({ homeDir: home }).length, 1, '条目不因为目录消失而被删');
});

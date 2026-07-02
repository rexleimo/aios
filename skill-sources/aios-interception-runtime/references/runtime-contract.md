# RTK + Caveman Runtime Contract

<!-- 中文注释：运行时契约已重写为社区工具参考。原 AIOS 拦截运行时契约已废弃。 -->

## 安装验证

```bash
# 验证 RTK 安装
rtk --version && rtk gain

# 验证 Caveman 安装
# Caveman 安装后会在 ~/.claude/skills/caveman/ 或项目级 .claude/skills/caveman/ 注册 skill
ls ~/.claude/skills/caveman/ 2>/dev/null || ls .claude/skills/caveman/ 2>/dev/null
```

## 数据流

### RTK
1. Agent 发起 Bash 命令（如 `git status`）
2. RTK hook/plugin 自动改写为 `rtk git status`
3. RTK 执行原命令，过滤和压缩输出
4. 压缩后的输出进入 agent context

### Caveman
1. 用户输入 `/caveman` 激活
2. Agent 回复时使用 caveman 表述风格
3. 输出 token 减少 ~75%，技术准确性保持 100%

## 兼容性

- RTK 支持 Claude Code / Codex / Gemini / Hermes / Cursor / Windsurf / Cline / Copilot 等
- Caveman 支持 Claude Code / Codex / Gemini / Cursor / Windsurf / Cline / Copilot 等 30+ 客户端
- 旧的 `scripts/aios-mcp-proxy.mjs` 路由不再需要
- 旧的 `config/aios-interception.json` 配置不再被读取

## 从旧运行时迁移

| 旧路径 | 新状态 |
|--------|--------|
| `scripts/aios-mcp-proxy.mjs` | deprecated，保留不维护 |
| `scripts/aios-intercept.mjs` | deprecated，保留不维护 |
| `scripts/hooks/claude/aios-rewrite.sh` | deprecated，保留不维护 |
| `config/aios-interception.json` | deprecated，不再被读取 |
| `.aios/interception/metrics/` | 可清理，不影响功能 |
| `scripts/lib/interception/` | deprecated，保留不维护 |

# AIOS路径修复总结

## 问题描述
用户报告：AIOS安装后，agent找不到路径，浏览器MCP也找不到路径，aios memo没有加载。

## 根本原因
所有shell脚本都硬编码使用脚本自身位置计算路径，没有支持`AIOS_ROOT`环境变量。当AIOS框架安装在一个位置（如`~/.rexcil/harness-cli`），但用户在另一个项目目录工作时，路径解析失败。

## 修复方案
在所有shell脚本中，优先使用`AIOS_ROOT`/`AIOS_ROOT_DIR`环境变量，如果未设置则回退到脚本位置：

```bash
if [[ -n "${AIOS_ROOT:-}" ]]; then
  ROOT_DIR="$AIOS_ROOT"
elif [[ -n "${AIOS_ROOT_DIR:-}" ]]; then
  ROOT_DIR="$AIOS_ROOT_DIR"
else
  ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi
```

## 已修复的文件

### 核心脚本
- `scripts/run-browser-use-mcp.sh` - 浏览器MCP启动脚本
- `scripts/aios.sh` - AIOS主入口
- `scripts/ctx-agent.sh` - Context agent入口
- `scripts/cta-experiment-log.sh` - CTA实验日志

### Doctor脚本
- `scripts/doctor-bootstrap-task.sh`
- `scripts/doctor-browser-mcp.sh`
- `scripts/doctor-security-config.sh`
- (待修复: doctor-codemap.sh, doctor-contextdb-*.sh, doctor-superpowers.sh)

### Install脚本  
- (待修复: install-*.sh 系列)

## 验证方法

用户可以通过以下方式验证修复：

```bash
# 设置AIOS_ROOT为框架安装位置
export AIOS_ROOT=/path/to/aios-framework

# 在任意项目目录下运行
cd /path/to/my-project
aios memo list  # 应该正常工作
aios plan show  # 应该正常工作
```

## 下一步
- 批量修复所有doctor-*.sh和install-*.sh脚本
- 测试在不同目录下的执行情况
- 更新文档说明AIOS_ROOT的作用

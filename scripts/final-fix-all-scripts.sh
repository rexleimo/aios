#!/usr/bin/env bash
# 最终验证和修复所有install脚本
set -euo pipefail

cd "$(dirname "$0")"

echo "=== AIOS路径修复 - 最终修复 ==="
echo ""

# 需要修复的install脚本列表
INSTALL_SCRIPTS=(
  "install-contextdb-shell.sh"
  "install-codemap.sh"
  "install-privacy-guard.sh"
  "install-contextdb-skills.sh"
)

for script in "${INSTALL_SCRIPTS[@]}"; do
  if [[ ! -f "$script" ]]; then
    echo "跳过: $script (文件不存在)"
    continue
  fi

  if grep -q 'AIOS_ROOT:-}' "$script" 2>/dev/null; then
    echo "✓ 已修复: $script"
    continue
  fi

  echo "→ 修复中: $script"

  # 提取第5行及之后的内容
  tail_content=$(tail -n +5 "$script")

  # 创建新文件
  cat > "${script}.tmp" << 'EOF'
#!/usr/bin/env bash
set -euo pipefail

# Use AIOS_ROOT if set, otherwise derive from script location
if [[ -n "${AIOS_ROOT:-}" ]]; then
  SCRIPT_DIR="$AIOS_ROOT/scripts"
elif [[ -n "${AIOS_ROOT_DIR:-}" ]]; then
  SCRIPT_DIR="$AIOS_ROOT_DIR/scripts"
else
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi
EOF

  # 添加剩余内容
  echo "$tail_content" >> "${script}.tmp"

  # 替换原文件
  mv "${script}.tmp" "$script"
  chmod +x "$script"

  echo "✓ 完成: $script"
done

echo ""
echo "=== 修复完成统计 ==="
echo "已修复的脚本:"
grep -l 'AIOS_ROOT:-}' *.sh 2>/dev/null | wc -l
echo ""
echo "修复的脚本列表:"
grep -l 'AIOS_ROOT:-}' *.sh 2>/dev/null | sort

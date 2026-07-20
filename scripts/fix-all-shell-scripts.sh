#!/usr/bin/env bash
# 批量修复所有需要AIOS_ROOT支持的脚本
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 需要修复的脚本列表（使用 SCRIPT_DIR 并调用其他脚本的）
SCRIPTS_TO_FIX=(
  "doctor-codemap.sh"
  "doctor-contextdb-shell.sh"
  "doctor-contextdb-skills.sh"
  "doctor-security-config.sh"
  "install-browser-mcp.sh"
  "install-codemap.sh"
  "install-contextdb-skills.sh"
  "install-contextdb-shell.sh"
  "install-privacy-guard.sh"
)

for script in "${SCRIPTS_TO_FIX[@]}"; do
  filepath="$SCRIPT_DIR/$script"
  if [[ ! -f "$filepath" ]]; then
    echo "跳过: $script (文件不存在)"
    continue
  fi

  echo "修复: $script"

  # 创建临时文件
  tmpfile=$(mktemp)

  # 替换SCRIPT_DIR定义
  awk '
    /^SCRIPT_DIR=/ {
      print "# Use AIOS_ROOT if set, otherwise derive from script location"
      print "if [[ -n \"${AIOS_ROOT:-}\" ]]; then"
      print "  SCRIPT_DIR=\"$AIOS_ROOT/scripts\""
      print "elif [[ -n \"${AIOS_ROOT_DIR:-}\" ]]; then"
      print "  SCRIPT_DIR=\"$AIOS_ROOT_DIR/scripts\""
      print "else"
      print "  SCRIPT_DIR=\"$(cd \"$(dirname \"${BASH_SOURCE[0]}\")\" && pwd)\""
      print "fi"
      next
    }
    { print }
  ' "$filepath" > "$tmpfile"

  # 替换原文件
  mv "$tmpfile" "$filepath"
  chmod +x "$filepath"
done

echo "修复完成！"

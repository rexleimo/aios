#!/usr/bin/env bash
# 批量修复所有shell脚本以支持AIOS_ROOT
set -euo pipefail

cd "$(dirname "$0")/.."

fix_script() {
  local file="$1"
  local tmpfile="${file}.tmp"

  if [[ ! -f "$file" ]]; then
    echo "跳过: $file (不存在)"
    return
  fi

  # 检查是否已经修复
  if grep -q "AIOS_ROOT:-}" "$file"; then
    echo "已修复: $file (跳过)"
    return
  fi

  echo "修复: $file"

  # 替换SCRIPT_DIR定义
  awk '
    BEGIN { in_shebang = 0; in_set = 0; done = 0 }
    /^#!/ { print; in_shebang = 1; next }
    /^set -euo pipefail/ && in_shebang { print; in_set = 1; next }
    /^SCRIPT_DIR=/ && !done {
      print ""
      print "# Use AIOS_ROOT if set, otherwise derive from script location"
      print "if [[ -n \"${AIOS_ROOT:-}\" ]]; then"
      print "  SCRIPT_DIR=\"$AIOS_ROOT/scripts\""
      print "elif [[ -n \"${AIOS_ROOT_DIR:-}\" ]]; then"
      print "  SCRIPT_DIR=\"$AIOS_ROOT_DIR/scripts\""
      print "else"
      print "  SCRIPT_DIR=\"$(cd \"$(dirname \"${BASH_SOURCE[0]}\")\" && pwd)\""
      print "fi"
      done = 1
      next
    }
    /^ROOT_DIR=/ && !done {
      print ""
      print "# Use AIOS_ROOT if set, otherwise derive from script location"
      print "if [[ -n \"${AIOS_ROOT:-}\" ]]; then"
      print "  ROOT_DIR=\"$AIOS_ROOT\""
      print "elif [[ -n \"${AIOS_ROOT_DIR:-}\" ]]; then"
      print "  ROOT_DIR=\"$AIOS_ROOT_DIR\""
      print "else"
      print "  ROOT_DIR=\"$(cd \"$(dirname \"${BASH_SOURCE[0]}\")/.." && pwd)\""
      print "fi"
      done = 1
      next
    }
    { print }
  ' "$file" > "$tmpfile"

  mv "$tmpfile" "$file"
  chmod +x "$file"
}

# 修复所有相关脚本
for script in scripts/doctor-*.sh scripts/install-*.sh; do
  if [[ -f "$script" ]]; then
    fix_script "$script"
  fi
done

echo ""
echo "修复完成！已修复的脚本:"
grep -l "AIOS_ROOT:-}" scripts/doctor-*.sh scripts/install-*.sh 2>/dev/null || echo "(无)"

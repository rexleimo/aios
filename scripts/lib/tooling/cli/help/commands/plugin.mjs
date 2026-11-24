export function getPluginHelpText() {
  return `Usage:
  aios plugin list [--json]
  aios plugin install github:owner/repo[#ref] [--ref <branch|tag|sha>] [--id <id>] [--json]
  aios plugin add github:owner/repo[#ref] [options]
  aios plugin install --id <id> --dir <path> [--json]
  aios plugin enable|disable|remove <id> [--json]
  aios plugin providers|models [--json]

Description:
  Install and manage project-local AIOS plugins. GitHub sources are cloned into
  .aios/plugins/<id>, validated, and pinned to the resolved commit. AIOS never
  runs repository build, prepare, or install scripts.

Options:
  --ref <branch|tag|sha>       Git ref to install (default: repository default branch)
  --id <id>                    Override or verify the manifest id
  --dir <path>                 Local plugin directory for the legacy install form
  --json                       Output as JSON
  -h, --help

Examples:
  aios plugin install github:acme/demo
  aios plugin add github:acme/demo#v1.2.3
  aios plugin install --id demo-plugin --dir ./plugins/demo
`;
}

#!/usr/bin/env bash
# 把 Windows 安装包发布到 ECHO（https://echo.voee.de/nexo/）。
# 用法：scripts/release-echo.sh <安装包目录> [更新说明]
#   安装包目录里要有 nexo-windows-<版本>-x64-setup.exe 与同名 .sha256（CI 产物）。
# 先上传安装包，再原子替换 latest.json，客户端不会读到指向半个文件的清单。
set -euo pipefail

ECHO_ASSET="${ECHO_ASSET:-T5iFBVdjZkrtuVCf}"
REMOTE_DIR=/srv/nexo-updates/nexo
KEEP=3

dir="${1:?usage: release-echo.sh <dir> [notes]}"
notes="${2:-}"
exe=$(ls "$dir"/nexo-windows-*-x64-setup.exe | head -1)
name=$(basename "$exe")
version=$(echo "$name" | sed -E 's/^nexo-windows-([0-9]+\.[0-9]+\.[0-9]+)-x64-setup\.exe$/\1/')
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "cannot read version from $name" >&2; exit 1; }

sha=$(shasum -a 256 "$exe" | awk '{print $1}')
expected=$(awk '{print $1}' "$exe.sha256")
[[ "$sha" == "$expected" ]] || { echo "sha256 mismatch for $name" >&2; exit 1; }
size=$(stat -f%z "$exe" 2>/dev/null || stat -c%s "$exe")

manifest=$(mktemp)
python3 - "$version" "$notes" "$name" "$sha" "$size" > "$manifest" <<'PY'
import json, sys
from datetime import datetime, timezone
version, notes, name, sha, size = sys.argv[1:]
print(json.dumps({
    "version": version,
    "notes": notes,
    "releasedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "assets": {"win32": {"x64": {"file": name, "sha256": sha, "size": int(size)}}},
}, ensure_ascii=False, indent=2))
PY

termark upload "$ECHO_ASSET" "$exe" "$REMOTE_DIR/$name.part" >/dev/null
termark upload "$ECHO_ASSET" "$manifest" "$REMOTE_DIR/latest.json.part" >/dev/null
rm -f "$manifest"
result=$(termark exec "$ECHO_ASSET" "set -e; cd $REMOTE_DIR
echo '$sha  $name.part' | sha256sum -c --quiet
mv -f '$name.part' '$name'
chmod 644 '$name' latest.json.part
mv -f latest.json.part latest.json
ls -1t nexo-windows-*-setup.exe | tail -n +$((KEEP + 1)) | xargs -r rm -f
ls -l")
# termark exec 以 JSON 返回远端结果，退出码在 exitCode 字段里
echo "$result" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d["output"],end="");sys.exit(d["exitCode"])' \
  || { echo "remote publish step failed" >&2; exit 1; }

code=$(curl -sS -o /dev/null -w '%{http_code}' "https://echo.voee.de/nexo/$name" -r 0-0)
remote=$(curl -sS https://echo.voee.de/nexo/latest.json | python3 -c 'import json,sys;print(json.load(sys.stdin)["version"])')
[[ "$code" =~ ^20[06]$ && "$remote" == "$version" ]] || { echo "verification failed ($code, $remote)" >&2; exit 1; }
echo "published nexo $version → https://echo.voee.de/nexo/$name"

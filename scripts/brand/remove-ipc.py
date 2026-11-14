#!/usr/bin/env python3
"""Remove IPC channels everywhere they are declared.

Usage: remove-ipc.py <channel> [...]
Touches: src/main/utils/ipc.ts (handler maps), src/preload/index.ts (whitelists),
src/renderer/src/utils/ipc.ts (IpcApi interface + exported wrappers).
Imports in src/main/utils/ipc.ts are left for the type checker / linter to flag.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2] / 'src'


def drop_member(text: str, name: str) -> str:
    """Remove `  name: <type>` (possibly multi-line) from an interface body."""
    lines = text.split('\n')
    out, i = [], 0
    pat = re.compile(rf'^  {re.escape(name)}\??: ')
    while i < len(lines):
        if pat.match(lines[i]):
            depth = 0
            while True:
                depth += lines[i].count('(') + lines[i].count('{') + lines[i].count('<')
                depth -= lines[i].count(')') + lines[i].count('}') + lines[i].count('>')
                depth += lines[i].count('=>')  # '=>' contains '>' that is not a bracket
                i += 1
                if depth <= 0 or i >= len(lines):
                    break
            continue
        out.append(lines[i])
        i += 1
    return '\n'.join(out)


def main(names: list[str]) -> None:
    main_ipc = ROOT / 'main' / 'utils' / 'ipc.ts'
    preload = ROOT / 'preload' / 'index.ts'
    renderer = ROOT / 'renderer' / 'src' / 'utils' / 'ipc.ts'
    m, p, r = (f.read_text('utf-8') for f in (main_ipc, preload, renderer))
    for n in names:
        m = re.sub(rf'\n  {re.escape(n)}(: [^\n]*)?,?(?=\n)', '', m)
        p = re.sub(rf"\n  '{re.escape(n)}',(?=\n)", '', p)
        r = drop_member(r, n)
        r = re.sub(rf'\n  {re.escape(n)},(?=\n)', '', r)
    # 空分组注释（后面紧跟另一个注释或结尾）一并去掉
    comment_only = r'\n  // [^\n]*(?=\n  //|\n\}|\n\] as const)'
    m, p, r = (re.sub(comment_only, '', t) for t in (m, p, r))
    main_ipc.write_text(m, 'utf-8')
    preload.write_text(p, 'utf-8')
    renderer.write_text(r, 'utf-8')


if __name__ == '__main__':
    main(sys.argv[1:])

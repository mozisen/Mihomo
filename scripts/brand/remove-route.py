#!/usr/bin/env python3
"""Remove lazy-loaded pages from the renderer router.

Usage: remove-route.py <ExportName>:<route-path>:<module> [...]
e.g.   remove-route.py SubStore:/substore:substore
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2] / 'src' / 'renderer' / 'src' / 'routes'


def main(specs: list[str]) -> None:
    pages = (ROOT / 'route-pages.tsx').read_text('utf-8')
    index = (ROOT / 'index.tsx').read_text('utf-8')
    for spec in specs:
        export, route, module = spec.split(':')
        var = re.search(
            rf"const (\w+) = createPreloadablePage\(\(\) => import\('@renderer/pages/{re.escape(module)}'\)\)\n",
            pages,
        )
        if not var:
            sys.exit(f'page module {module} not found')
        name = var.group(1)
        pages = pages.replace(var.group(0), '')
        pages = re.sub(rf"export const {export} = {name}\.Page\n", '', pages)
        pages = re.sub(rf"  {name}\.preload,?\n", '', pages)
        index = re.sub(rf"\n  {export},", '', index, count=1)
        index = re.sub(
            rf"  \{{\n    path: '{re.escape(route)}',\n    element: <{export} />\n  \}},?\n", '', index
        )
    (ROOT / 'route-pages.tsx').write_text(pages, 'utf-8')
    (ROOT / 'index.tsx').write_text(index, 'utf-8')


if __name__ == '__main__':
    main(sys.argv[1:])

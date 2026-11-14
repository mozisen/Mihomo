#!/usr/bin/env python3
"""Remove locale keys that match the given prefixes from every renderer locale file.

Usage: prune-locales.py <prefix> [<prefix> ...]
Keys are matched with str.startswith; key order and formatting of the rest are preserved.
"""
import collections
import json
import pathlib
import sys

LOCALES = pathlib.Path(__file__).resolve().parents[2] / 'src' / 'renderer' / 'src' / 'locales'


def main(prefixes: list[str]) -> None:
    if not prefixes:
        sys.exit('usage: prune-locales.py <prefix> [...]')
    for path in sorted(LOCALES.glob('*.json')):
        data = json.loads(path.read_text('utf-8'), object_pairs_hook=collections.OrderedDict)
        kept = collections.OrderedDict(
            (k, v) for k, v in data.items() if not any(k.startswith(p) for p in prefixes)
        )
        removed = len(data) - len(kept)
        path.write_text(json.dumps(kept, ensure_ascii=False, indent=2) + '\n', 'utf-8')
        print(f'{path.name}: removed {removed}')


if __name__ == '__main__':
    main(sys.argv[1:])

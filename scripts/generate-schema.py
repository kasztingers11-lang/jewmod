import argparse
import re
import json
from pathlib import Path
from lupa.lua54 import LuaRuntime

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description='Export the public editor schema from the runtime defaults.')
parser.add_argument('--source', type=Path, default=root.parent / 'mysite')
source = parser.parse_args().source
lua = LuaRuntime()
defaults = lua.execute((source / 'neoperro-src/defaults.lua').read_text(encoding='utf-8'))

def convert(value, path=()):
    if not hasattr(value, 'items'):
        return value
    items = dict(value.items())
    if path == ('Whitelist', 'Players'):
        return []
    if items and set(items) == set(range(1, len(items)+1)):
        return [convert(items[i], path+(str(i-1),)) for i in range(1, len(items)+1)]
    return {str(k): convert(v, path+(str(k),)) for k, v in sorted(items.items(), key=lambda x:str(x[0]))}

runtime = (source / 'neoperro-src/runtime.lua').read_text(encoding='utf-8')
version = re.search(r"Version = '([^']+)'", runtime)[1]
data = {'version': version, 'defaults': {'Web connect': False, **convert(defaults)}}
(root / 'public/config-schema.json').write_text(json.dumps(data, indent=2)+'\n', encoding='utf-8', newline='\n')
print('Exported public runtime defaults; no private config or runtime source included.')

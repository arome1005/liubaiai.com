import os
import re

_repo = os.path.dirname(os.path.abspath(__file__))
src_file = os.path.join(_repo, "design", "v0-ui-reference", "components", "modules", "tuiyan-module.tsx")
dst_file = os.path.join(_repo, "src", "pages", "V0TuiyanPage.tsx")

with open(src_file, 'r', encoding='utf-8') as f:
    content = f.read()

# Modify imports
content = content.replace('@/components/', '../components/')
content = content.replace('@/lib/', '../lib/')

# Modify component name
content = content.replace('export default function TuiYanModule() {', 'export default function V0TuiyanPage() {')
content = content.replace('export function TuiYanModule() {', 'export default function V0TuiyanPage() {')

# Remove `"use client"`
content = content.replace('"use client"\n', '')

with open(dst_file, 'w', encoding='utf-8') as f:
    f.write(content)
print("done rewriting to V0TuiyanPage.tsx")

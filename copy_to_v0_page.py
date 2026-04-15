import os
import re

src_file = '/Users/arome/Desktop/留白写作/v0UI设计参考v-2.0/components/modules/tuiyan-module.tsx'
dst_file = '/Users/arome/Desktop/留白写作/src/pages/V0TuiyanPage.tsx'

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

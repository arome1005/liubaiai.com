import os
import re
import shutil

_repo = os.path.dirname(os.path.abspath(__file__))
src_file = os.path.join(_repo, "design", "v0-ui-reference", "components", "modules", "tuiyan-module.tsx")
dst_file = os.path.join(_repo, "src", "pages", "LogicPage.tsx")

with open(src_file, 'r', encoding='utf-8') as f:
    content = f.read()

# Modify imports
content = content.replace('@/components/', '../components/')
content = content.replace('@/lib/', '../lib/')

# Modify component name to LogicPage to match App.tsx export
content = content.replace('export function TuiYanModule() {', 'export function LogicPage() {')
content = content.replace('export default function TuiYanModule() {', 'export function LogicPage() {')

# Remove `"use client"` since Vite doesn't need it or use it like Next.js does
content = content.replace('"use client"\n', '')

with open(dst_file, 'w', encoding='utf-8') as f:
    f.write(content)

# We also need to copy any missing UI components to src/components/ui/
v0_ui_dir = os.path.join(_repo, "design", "v0-ui-reference", "components", "ui")
src_ui_dir = os.path.join(_repo, "src", "components", "ui")

if not os.path.exists(src_ui_dir):
    os.makedirs(src_ui_dir)

# Find all required UI components in the tuiyan-module.tsx
ui_components_needed = re.findall(r'ui/([^"\']+)', content)
# It fetches 'button', etc.
extracted = [c.split('/')[-1] for c in ui_components_needed if '/' not in c]
# Wait, some might just match import paths. Let's just list the directory and copy.
import glob
v0_uis = [os.path.basename(p) for p in glob.glob(os.path.join(v0_ui_dir, '*.tsx')) + glob.glob(os.path.join(v0_ui_dir, '*.ts'))]

copied = []
for file in v0_uis:
    # Only copy if the file does not exist in the destination or we want to overwrite
    src_path = os.path.join(v0_ui_dir, file)
    dst_path = os.path.join(src_ui_dir, file)
    if not os.path.exists(dst_path):
        with open(src_path, 'r', encoding='utf-8') as f:
            ui_content = f.read()
        # Transform imports in UI components as well
        ui_content = ui_content.replace('@/components/', '../../components/')
        ui_content = ui_content.replace('@/lib/', '../../lib/')
        with open(dst_path, 'w', encoding='utf-8') as f:
            f.write(ui_content)
        copied.append(file)

print(f"Copied and transformed module. Copied UI components: {', '.join(copied)}")

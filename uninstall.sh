#!/bin/sh
# SPDX-License-Identifier: GPL-2.0-or-later
set -eu

data_root=${XDG_DATA_HOME:-"$HOME/.local/share"}
extension_dir="$data_root/cinnamon/extensions/active-window-highlight@claudiu.local"

if [ -d "$extension_dir" ]; then
    rm -f -- "$extension_dir/extension.js" \
        "$extension_dir/metadata.json" \
        "$extension_dir/settings-schema.json" \
        "$extension_dir/icon.png" \
        "$extension_dir/README.md" \
        "$extension_dir/ATTRIBUTION.md" \
        "$extension_dir/LICENSE"
    rmdir -- "$extension_dir" 2>/dev/null || true
fi

printf '%s\n' "Active Window Highlight removed; Cinnamon settings were retained."

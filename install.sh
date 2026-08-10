#!/bin/sh
# SPDX-License-Identifier: GPL-2.0-or-later
set -eu

project_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
data_root=${XDG_DATA_HOME:-"$HOME/.local/share"}
uuid=active-window-highlight@claudiu.local
extension_dir="$data_root/cinnamon/extensions/$uuid"

mkdir -p "$extension_dir"
for file in extension.js metadata.json settings-schema.json icon.png README.md ATTRIBUTION.md LICENSE; do
    install -m 0644 "$project_dir/$file" "$extension_dir/$file"
done

printf '%s\n' "Active Window Highlight installed. Re-enable it in Cinnamon Extensions."

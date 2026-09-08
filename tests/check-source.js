/* global imports, ARGV */

const ByteArray = imports.byteArray;
const GLib = imports.gi.GLib;

let [ok, contents] = GLib.file_get_contents(ARGV[0]);
if (!ok) {
    throw new Error(`Cannot read ${ARGV[0]}`);
}
let source = ByteArray.toString(contents);
new Function(source);

for (let required of [
    "global.display.connect(\n            'restacked'",
    'focusWindow.get_compositor_private()',
    'global.window_group.set_child_above_sibling(actor, sibling)',
    '!window.is_fullscreen()',
    'this.isFullyMaximized(focusWindow)',
    'window.maximized_horizontally && window.maximized_vertically',
    'this.updateFrame(rect, suppressFrame);',
    'if (suppressFrame || !this.showFrame)',
    "this.settings.bind('frame-radius', 'frameRadius', update)",
    "this.settings.bind('round-top-corners', 'roundTopCorners', update)",
    'this.roundTopCorners ? Math.max('
]) {
    if (!source.includes(required)) {
        throw new Error(`Missing stack-aware highlight behavior: ${required}`);
    }
}

if (source.includes('.raise_top()')) {
    throw new Error('Highlight actors must not be raised above all windows');
}

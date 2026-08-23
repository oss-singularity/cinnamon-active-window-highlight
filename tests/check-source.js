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
    'global.window_group.set_child_above_sibling(actor, sibling)'
]) {
    if (!source.includes(required)) {
        throw new Error(`Missing stack-aware highlight behavior: ${required}`);
    }
}

if (source.includes('.raise_top()')) {
    throw new Error('Highlight actors must not be raised above all windows');
}

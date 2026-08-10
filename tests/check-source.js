const ByteArray = imports.byteArray;
const GLib = imports.gi.GLib;

let [ok, contents] = GLib.file_get_contents(ARGV[0]);
if (!ok) {
    throw new Error(`Cannot read ${ARGV[0]}`);
}
new Function(ByteArray.toString(contents));

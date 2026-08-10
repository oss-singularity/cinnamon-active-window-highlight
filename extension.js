// SPDX-License-Identifier: GPL-2.0-or-later
// Top-bar design derived from Active Window Indicator by fabiodamio.

const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Meta = imports.gi.Meta;
const Main = imports.ui.main;
const Settings = imports.ui.settings;
const Cairo = imports.cairo;
const Mainloop = imports.mainloop;
const GLib = imports.gi.GLib;

let extension = null;

function parseColor(colorValue) {
    let color = String(colorValue || '');
    if (color.startsWith('rgb')) {
        let matches = color.match(/[0-9.]+/g);
        if (matches && matches.length >= 3) {
            return [
                Math.min(255, Number(matches[0])) / 255,
                Math.min(255, Number(matches[1])) / 255,
                Math.min(255, Number(matches[2])) / 255
            ];
        }
    }

    if (color.startsWith('#')) {
        let hex = color.slice(1);
        if (hex.length === 3) {
            hex = hex.split('').map(character => character + character).join('');
        }
        if (/^[0-9a-fA-F]{6}$/.test(hex)) {
            return [
                parseInt(hex.slice(0, 2), 16) / 255,
                parseInt(hex.slice(2, 4), 16) / 255,
                parseInt(hex.slice(4, 6), 16) / 255
            ];
        }
    }

    return [0, 0.75, 1];
}

function interpolateColor(first, second, factor) {
    return [
        first[0] + (second[0] - first[0]) * factor,
        first[1] + (second[1] - first[1]) * factor,
        first[2] + (second[2] - first[2]) * factor
    ];
}

class ActiveWindowHighlight {
    constructor(metadata) {
        this.uuid = metadata.uuid;

        this.settings = null;
        this.focusSignal = 0;
        this.workspaceSignal = 0;
        this.positionSignal = 0;
        this.sizeSignal = 0;
        this.stateSignal = 0;
        this.currentWindow = null;

        this.barActor = null;
        this.barCanvas = null;
        this.frameActor = null;

        this.animationId = 0;
        this.animationProgress = 0;
        this.animationDirection = 1;

        this.showTopBar = true;
        this.lineHeight = 4;
        this.widthPercent = 80;
        this.slantPercent = 10;
        this.alphaPercent = 80;
        this.animSpeed = 5;
        this.colorStart = 'rgb(0, 210, 255)';
        this.colorEnd = 'rgb(58, 123, 213)';

        this.showFrame = true;
        this.frameWidth = 1;
        this.frameRadius = 10;
        this.frameAlphaPercent = 95;
        this.frameColor = 'rgb(0, 190, 255)';
    }

    enable() {
        this.settings = new Settings.ExtensionSettings(this, this.uuid);
        let update = this.update.bind(this);

        this.settings.bind('show-top-bar', 'showTopBar', update);
        this.settings.bind('line-height', 'lineHeight', update);
        this.settings.bind('width-percent', 'widthPercent', update);
        this.settings.bind('slant-percent', 'slantPercent', update);
        this.settings.bind('alpha-percent', 'alphaPercent', update);
        this.settings.bind('anim-speed', 'animSpeed', update);
        this.settings.bind('color-start', 'colorStart', update);
        this.settings.bind('color-end', 'colorEnd', update);
        this.settings.bind('show-frame', 'showFrame', update);
        this.settings.bind('frame-width', 'frameWidth', update);
        this.settings.bind('frame-radius', 'frameRadius', update);
        this.settings.bind('frame-alpha-percent', 'frameAlphaPercent', update);
        this.settings.bind('frame-color', 'frameColor', update);

        this.focusSignal = global.display.connect(
            'notify::focus-window',
            this.onFocusChanged.bind(this)
        );
        this.workspaceSignal = global.workspace_manager.connect(
            'active-workspace-changed',
            update
        );

        this.startAnimation();
        this.onFocusChanged();
    }

    disable() {
        this.stopAnimation();

        if (this.focusSignal) {
            global.display.disconnect(this.focusSignal);
            this.focusSignal = 0;
        }
        if (this.workspaceSignal) {
            global.workspace_manager.disconnect(this.workspaceSignal);
            this.workspaceSignal = 0;
        }

        this.cleanupWindowSignals();

        if (this.barActor) {
            this.barActor.destroy();
            this.barActor = null;
        }
        this.barCanvas = null;

        if (this.frameActor) {
            this.frameActor.destroy();
            this.frameActor = null;
        }

        if (this.settings) {
            this.settings.finalize();
            this.settings = null;
        }
    }

    cleanupWindowSignals() {
        if (!this.currentWindow) {
            return;
        }

        for (let signalName of ['positionSignal', 'sizeSignal', 'stateSignal']) {
            if (this[signalName]) {
                this.currentWindow.disconnect(this[signalName]);
                this[signalName] = 0;
            }
        }
        this.currentWindow = null;
    }

    onFocusChanged() {
        this.cleanupWindowSignals();

        let focusWindow = global.display.focus_window;
        if (focusWindow && this.isSupportedWindow(focusWindow)) {
            this.currentWindow = focusWindow;
            this.positionSignal = focusWindow.connect(
                'position-changed',
                this.update.bind(this)
            );
            this.sizeSignal = focusWindow.connect(
                'size-changed',
                this.update.bind(this)
            );
            try {
                this.stateSignal = focusWindow.connect(
                    'window-state-changed',
                    this.update.bind(this)
                );
            } catch (error) {
                this.stateSignal = 0;
            }
        }

        this.update();
    }

    isSupportedWindow(window) {
        let supportedTypes = [
            Meta.WindowType.NORMAL,
            Meta.WindowType.DIALOG,
            Meta.WindowType.MODAL_DIALOG,
            Meta.WindowType.UTILITY
        ];
        return supportedTypes.indexOf(window.window_type) !== -1;
    }

    shouldShowFor(window) {
        if (!window || !this.isSupportedWindow(window)) {
            return false;
        }
        let activeWorkspace = global.workspace_manager.get_active_workspace();
        return !window.is_override_redirect() &&
            !window.is_fullscreen() &&
            !window.minimized &&
            window.located_on_workspace(activeWorkspace);
    }

    hideAll() {
        if (this.barActor) {
            this.barActor.hide();
        }
        if (this.frameActor) {
            this.frameActor.hide();
        }
    }

    update() {
        let focusWindow = global.display.focus_window;
        if (!this.shouldShowFor(focusWindow)) {
            this.hideAll();
            return;
        }

        let rect = focusWindow.get_frame_rect();
        if (rect.width <= 0 || rect.height <= 0) {
            this.hideAll();
            return;
        }

        this.updateFrame(rect);
        this.updateTopBar(rect);
    }

    ensureFrameActor() {
        if (this.frameActor) {
            return;
        }

        this.frameActor = new St.Widget({
            name: 'ActiveWindowFrame',
            reactive: false
        });
        // Above application windows, below Cinnamon's own menus and panels.
        global.window_group.add_actor(this.frameActor);
    }

    updateFrame(rect) {
        if (!this.showFrame) {
            if (this.frameActor) {
                this.frameActor.hide();
            }
            return;
        }

        this.ensureFrameActor();
        let thickness = Math.max(
            1,
            Math.min(Math.round(this.frameWidth), rect.width, rect.height)
        );
        let radius = Math.max(
            0,
            Math.min(
                Math.round(this.frameRadius),
                Math.floor(Math.min(rect.width, rect.height) / 2)
            )
        );
        let opacity = Math.round(
            255 * Math.max(0, Math.min(100, this.frameAlphaPercent)) / 100
        );
        let [red, green, blue] = parseColor(this.frameColor).map(
            channel => Math.round(channel * 255)
        );
        let style = [
            'background-color: transparent',
            `border: ${thickness}px solid rgb(${red}, ${green}, ${blue})`,
            `border-radius: ${radius}px ${radius}px 0 0`
        ].join('; ') + ';';

        this.frameActor.set_style(style);
        this.frameActor.set_opacity(opacity);
        this.frameActor.set_position(rect.x, rect.y);
        this.frameActor.set_size(rect.width, rect.height);
        this.frameActor.show();
        this.frameActor.raise_top();
    }

    updateTopBar(rect) {
        if (!this.showTopBar) {
            if (this.barActor) {
                this.barActor.hide();
            }
            return;
        }

        let height = Math.max(1, Math.round(this.lineHeight));
        let width = Math.max(
            1,
            Math.round(rect.width * Math.max(10, Math.min(100, this.widthPercent)) / 100)
        );
        let offsetX = Math.round((rect.width - width) / 2);

        if (!this.barCanvas) {
            this.barCanvas = new Clutter.Canvas();
            this.barCanvas.connect('draw', this.drawTopBar.bind(this));
        }
        if (!this.barActor) {
            this.barActor = new St.Widget({
                name: 'ActiveWindowTopBar',
                reactive: false
            });
            this.barActor.set_content(this.barCanvas);
            global.window_group.add_actor(this.barActor);
        }

        this.barCanvas.set_size(width, height);
        this.barActor.set_position(rect.x + offsetX, rect.y);
        this.barActor.set_size(width, height);
        this.barCanvas.invalidate();
        this.barActor.show();
        this.barActor.raise_top();
    }

    drawTopBar(_canvas, context, width, height) {
        context.save();
        context.setOperator(Cairo.Operator.CLEAR);
        context.paint();
        context.restore();

        if (width <= 0 || height <= 0) {
            return GLib.SOURCE_CONTINUE;
        }

        let slant = Math.min(Math.max(0, this.slantPercent), width / 2);
        let alpha = Math.max(0, Math.min(100, this.alphaPercent)) / 100;

        context.moveTo(0, 0);
        context.lineTo(width, 0);
        context.lineTo(width - slant, height);
        context.lineTo(slant, height);
        context.closePath();

        let first = parseColor(this.colorStart);
        let second = parseColor(this.colorEnd);
        let currentFirst = interpolateColor(
            first,
            second,
            this.animationProgress
        );
        let currentSecond = interpolateColor(
            second,
            first,
            this.animationProgress
        );
        let gradient = new Cairo.LinearGradient(0, 0, width, 0);
        gradient.addColorStopRGBA(
            0,
            currentFirst[0],
            currentFirst[1],
            currentFirst[2],
            alpha
        );
        gradient.addColorStopRGBA(
            1,
            currentSecond[0],
            currentSecond[1],
            currentSecond[2],
            alpha
        );
        context.setSource(gradient);
        context.fill();
        return true;
    }

    startAnimation() {
        if (this.animationId) {
            return;
        }

        this.animationId = Mainloop.timeout_add(33, () => {
            let speed = Math.max(1, Math.min(20, this.animSpeed));
            this.animationProgress += speed * 0.005 * this.animationDirection;

            if (this.animationProgress >= 1) {
                this.animationProgress = 1;
                this.animationDirection = -1;
            } else if (this.animationProgress <= 0) {
                this.animationProgress = 0;
                this.animationDirection = 1;
            }

            if (this.barCanvas && this.barActor && this.barActor.visible) {
                this.barCanvas.invalidate();
            }
            return true;
        });
    }

    stopAnimation() {
        if (this.animationId) {
            Mainloop.source_remove(this.animationId);
            this.animationId = 0;
        }
    }
}

function init(metadata) {
    extension = new ActiveWindowHighlight(metadata);
}

function enable() {
    extension.enable();
}

function disable() {
    extension.disable();
}

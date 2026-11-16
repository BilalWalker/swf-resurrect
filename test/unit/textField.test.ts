// TextField, InteractiveObject and the Hit_Target of a TextField (as3-coverage task 16.1, 16.2).
// Validates: Requirements 15.1 to 15.4, 15.7, 15.9
import { afterEach, describe, expect, it } from 'vitest';
import { ManualClock } from '../../template/runtime/clock';
import { Player } from '../../template/runtime/player';
import type { DisplayListEntry, SceneJson } from '../../template/runtime/scene';
import { takeNamedLimits } from '../../template/shim/errorSink';
import { Stage } from '../../template/shim/Stage';
import { MouseEvent } from '../../template/shim/events';
import { InteractiveObject } from '../../template/shim/InteractiveObject';
import { DisplayObjectContainer, Sprite } from '../../template/shim/Sprite';
import { TextField } from '../../template/shim/TextField';
import { setTextMeasure } from '../../template/shim/textMeasure';
import { FakeBackend } from '../support/fakeBackend';
afterEach(() => setTextMeasure(null));
describe('TextField shim', () => {
  it('has the defaults of Requirement 15.4', () => {
    const t = new TextField();
    expect([t.text, t.textColor, t.width, t.height, t.selectable, t.textWidth]).toEqual(['', 0, 100, 100, true, 0]);
  });
  it('width and height set the box and never the scale', () => {
    const t = new TextField();
    t.width = 250;
    t.height = 40;
    expect([t.width, t.height, t.scaleX, t.scaleY]).toEqual([250, 40, 1, 1]);
  });
  it('textWidth is valid in the same call as the text, from the injected function', () => {
    setTextMeasure((text, font) => text.length * 7 + (font.includes('Times New Roman') ? 0 : 1000));
    const t = new TextField();
    t.text = 'Score 10';
    expect(t.textWidth).toBe(56);
    t.text = '';
    expect(t.textWidth).toBe(0);
  });
  it('is an InteractiveObject, as is a container', () => {
    expect(new TextField()).toBeInstanceOf(InteractiveObject);
    expect(new Sprite()).toBeInstanceOf(InteractiveObject);
    expect(new Sprite()).toBeInstanceOf(DisplayObjectContainer);
  });
  it('records the device-font Named_Limit', () => {
    takeNamedLimits();
    new TextField();
    expect(takeNamedLimits().map((l) => l.id)).toContain('device-font-metrics');
  });
});
const ID_CT: DisplayListEntry['colorTransform'] = [1, 1, 1, 1, 0, 0, 0, 0];
describe('TextField on the Player', () => {
  const scene: SceneJson = {
    formatVersion: 2,
    stage: { width: 200, height: 100, backgroundColor: '#ffffff', frameRate: 10 },
    rootSymbolId: 0,
    symbols: { '0': { type: 'sprite', frameCount: 1, frames: [[]], labels: [] } },
  };
  function rig() {
    const backend = new FakeBackend();
    const player = new Player({ scene, backend, clock: new ManualClock(), classRegistry: {}, shapeBounds: new Map() });
    const tf = new TextField();
    tf.x = 10;
    tf.y = 10;
    tf.width = 50;
    tf.height = 20;
    tf.text = 'Hi';
    tf.textColor = 0xff0000;
    const holder = new Sprite();
    holder.addChild(tf);
    (player.root as Sprite).addChild(holder);
    return { backend, player, tf, holder };
  }
  it('draws its text through the backend and clears it', () => {
    const { backend, player, tf } = rig();
    player.update();
    const node = backend.liveNodes.find((n) => n.text !== null);
    expect(node?.text).toEqual({ text: 'Hi', color: 0xff0000, width: 50, height: 20 });
    tf.text = '';
    player.update();
    expect(node?.text).toBeNull();
  });
  it('a click on it targets the TextField and bubbles to its parent', () => {
    const { player, tf, holder } = rig();
    const seen: [unknown, unknown][] = [];
    holder.addEventListener(MouseEvent.CLICK, (e) => seen.push([e.target, e.currentTarget]));
    player.dispatchClick(20, 15);
    expect(seen).toEqual([[tf, holder]]);
  });
  it('with mouseEnabled false the click goes to the parent', () => {
    const { player, tf, holder } = rig();
    tf.mouseEnabled = false;
    const seen: unknown[] = [];
    holder.addEventListener(MouseEvent.CLICK, (e) => seen.push(e.target));
    player.dispatchClick(20, 15);
    expect(seen).toEqual([holder]);
  });
});
describe('TextField on the Stage', () => {
  it('records textfield-on-stage-not-hit when it becomes a direct Stage child, not when inside a Sprite', () => {
    takeNamedLimits();
    const stage = new Stage();
    stage._children.push(new Sprite()); // the root clip slot
    new Sprite().addChild(new TextField());
    takeNamedLimits();
    stage.addChild(new Sprite());
    expect(takeNamedLimits()).toEqual([]);
    stage.addChild(new TextField());
    stage.addChild(new TextField());
    expect(takeNamedLimits().map((l) => l.id)).toEqual(['device-font-metrics', 'textfield-on-stage-not-hit']);
  });
});

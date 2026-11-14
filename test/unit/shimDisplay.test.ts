import fc from 'fast-check';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serialiseScene } from '../../src/convert/sceneJson';
import { planEmitDetailed } from '../../src/emit/planEmit';
import type { TemplateFile } from '../../src/emit/planEmit';
import { planTranslate } from '../../src/translate/planTranslate';
import { tsSyntaxCheck } from '../../src/translate/tsSyntaxCheck';
import { typeCheckProject } from '../../src/translate/typeCheckGate';
import type { SceneJson } from '../../template/runtime/scene';
import { describe, expect, it } from 'vitest';
import { DisplayObject } from '../../template/shim/DisplayObject';
import { Event, EventDispatcher, MouseEvent } from '../../template/shim/events';
import { setPointerPosition } from '../../template/shim/internal';
import { Sprite } from '../../template/shim/Sprite';

describe('EventDispatcher', () => {
  it('calls listeners in registration order and registers a duplicate once', () => {
    const d = new EventDispatcher();
    const log: string[] = [];
    const a = () => log.push('a');
    const b = () => log.push('b');
    d.addEventListener(MouseEvent.CLICK, a);
    d.addEventListener(MouseEvent.CLICK, b);
    d.addEventListener(MouseEvent.CLICK, a);
    d.dispatchEvent(new MouseEvent(MouseEvent.CLICK));
    expect(log).toEqual(['a', 'b']);
  });

  it('removal during dispatch applies from the next dispatch', () => {
    const d = new EventDispatcher();
    const log: string[] = [];
    const b = () => log.push('b');
    const a = () => {
      log.push('a');
      d.removeEventListener(Event.ENTER_FRAME, b);
    };
    d.addEventListener(Event.ENTER_FRAME, a);
    d.addEventListener(Event.ENTER_FRAME, b);
    d.dispatchEvent(new Event(Event.ENTER_FRAME));
    d.dispatchEvent(new Event(Event.ENTER_FRAME));
    expect(log).toEqual(['a', 'b', 'a']);
  });

  it('listener added during dispatch is not called in that dispatch', () => {
    const d = new EventDispatcher();
    const log: string[] = [];
    d.addEventListener('x', () => {
      log.push('first');
      d.addEventListener('x', () => log.push('late'));
    });
    d.dispatchEvent(new Event('x'));
    expect(log).toEqual(['first']);
  });

  it('sets target and currentTarget', () => {
    const d = new EventDispatcher();
    const e = new Event('x');
    d.dispatchEvent(e);
    expect(e.target).toBe(d);
    expect(e.currentTarget).toBe(d);
  });
});

describe('DisplayObject', () => {
  it('has defaults', () => {
    const o = new DisplayObject();
    expect([o.x, o.y, o.scaleX, o.scaleY, o.rotation, o.alpha, o.visible, o.name]).toEqual([
      0, 0, 1, 1, 0, 1, true, '',
    ]);
    expect(o.parent).toBeNull();
  });

  it('clamps alpha to [0, 1]', () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true }), (v) => {
        const o = new DisplayObject();
        o.alpha = v;
        expect(o.alpha).toBe(Math.min(1, Math.max(0, v)));
      }),
    );
  });

  it('width and height follow intrinsic size and scale; setters adjust scale', () => {
    const o = new DisplayObject();
    o._intrinsicWidth = 10;
    o._intrinsicHeight = 20;
    o.scaleX = 2;
    expect(o.width).toBe(20);
    o.height = 40;
    expect(o.scaleY).toBe(2);
  });
});

describe('Sprite', () => {
  it('appends children, counts direct children and finds by name', () => {
    const s = new Sprite();
    const a = new Sprite();
    const b = new DisplayObject();
    a.name = 'a';
    b.name = 'b';
    expect(s.addChild(a)).toBe(a);
    s.addChild(b);
    expect(s.numChildren).toBe(2);
    expect(s._children).toEqual([a, b]);
    expect(a.parent).toBe(s);
    expect(s.getChildByName('b')).toBe(b);
    expect(s.getChildByName('zzz')).toBeNull();
    a.addChild(new DisplayObject()).name = 'deep';
    expect(s.getChildByName('deep')).toBeNull();
  });

  it('removeChild clears parent; re-adding moves between parents', () => {
    const p = new Sprite();
    const q = new Sprite();
    const c = new DisplayObject();
    p.addChild(c);
    q.addChild(c);
    expect(p.numChildren).toBe(0);
    expect(c.parent).toBe(q);
    q.removeChild(c);
    expect(c.parent).toBeNull();
    expect(() => q.removeChild(c)).toThrow();
  });

  it('rejects adding itself or an ancestor', () => {
    const p = new Sprite();
    const c = new Sprite();
    p.addChild(c);
    expect(() => c.addChild(p)).toThrow();
    expect(() => p.addChild(p)).toThrow();
  });
});

describe('mouseX / mouseY', () => {
  it('equal the stage position at the top level and after a pointer update', () => {
    const o = new Sprite();
    setPointerPosition(30, 40);
    expect([o.mouseX, o.mouseY]).toEqual([30, 40]);
  });
  it('map through translation, scale and rotation of the parent chain', () => {
    const p = new Sprite();
    const c = new Sprite();
    p.addChild(c);
    p.x = 10;
    p.scaleX = 2;
    c.x = 5;
    setPointerPosition(30, 7);
    expect(c.mouseX).toBeCloseTo(5, 9);
    expect(c.mouseY).toBeCloseTo(7, 9);
    p.rotation = 90;
    setPointerPosition(10, 20);
    expect(p.mouseX).toBeCloseTo(20 / 2, 9);
    expect(p.mouseY).toBeCloseTo(0, 9);
  });
  it('are 0 when a scale on the chain is 0', () => {
    const p = new Sprite();
    const c = new Sprite();
    p.addChild(c);
    p.scaleY = 0;
    setPointerPosition(12, 13);
    expect([c.mouseX, c.mouseY]).toEqual([0, 0]);
  });
});


describe('mouse flags and cursor flags', () => {
  it('defaults: mouseEnabled and mouseChildren true, buttonMode false, useHandCursor true', () => {
    const s = new Sprite();
    expect([s.mouseEnabled, s.mouseChildren, s.buttonMode, s.useHandCursor]).toEqual([true, true, false, true]);
  });
  it('stores the assigned values per instance', () => {
    const s = new Sprite();
    const t = new Sprite();
    s.mouseEnabled = false;
    s.mouseChildren = false;
    s.buttonMode = true;
    s.useHandCursor = false;
    expect([s.mouseEnabled, s.mouseChildren, s.buttonMode, s.useHandCursor]).toEqual([false, false, true, false]);
    expect([t.mouseEnabled, t.mouseChildren, t.buttonMode, t.useHandCursor]).toEqual([true, true, false, true]);
  });
});

// Hand-written equivalents of the ComponentEvent and SliderEvent shapes of slider_component (Requirement 29.6, Task 26.3).
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
function readTemplates(dir = join(repoRoot, 'template'), prefix = ''): TemplateFile[] {
  const out: TemplateFile[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...readTemplates(full, `${prefix}${name}/`));
    else out.push({ path: `${prefix}${name}`, content: readFileSync(full, 'utf8') });
  }
  return out;
}
const COMPONENT_EVENT = `package fl.events
{
   import flash.events.Event;
   public class ComponentEvent extends Event
   {
      public static const HIDE:String = "hide";
      public function ComponentEvent(param1:String, param2:Boolean = false, param3:Boolean = false)
      {
         super(param1,param2,param3);
      }
      override public function toString() : String
      {
         return formatToString("ComponentEvent","type","bubbles","cancelable");
      }
      override public function clone() : Event
      {
         return new ComponentEvent(type,bubbles,cancelable);
      }
   }
}
`;
const SLIDER_EVENT = `package fl.events
{
   import flash.events.Event;
   public class SliderEvent extends Event
   {
      public static const CHANGE:String = "change";
      private var _value:Number;
      public function SliderEvent(param1:String, param2:Number, param3:Boolean = false, param4:Boolean = false)
      {
         super(param1,param3,param4);
         this._value = param2;
      }
      public function get value() : Number
      {
         return this._value;
      }
      override public function toString() : String
      {
         return formatToString("SliderEvent","type","bubbles","cancelable","value");
      }
      override public function clone() : Event
      {
         return new SliderEvent(type,this._value,bubbles,cancelable);
      }
   }
}
`;
describe('ComponentEvent and SliderEvent shapes through the real gate (Requirement 29.6)', { timeout: 30_000 }, () => {
  it('give no TS4113 and no TS2339 for clone or formatToString', () => {
    const scene: SceneJson = {
      formatVersion: 1,
      stage: { width: 550, height: 400, backgroundColor: '#ffffff', frameRate: 24 },
      rootSymbolId: 0,
      symbols: {
        '0': { type: 'sprite', className: 'fl.events.ComponentEvent', frameCount: 1, labels: [], frames: [[]] },
        '1': { type: 'sprite', className: 'fl.events.SliderEvent', frameCount: 1, labels: [], frames: [[]] },
      },
    };
    const artifact = planTranslate(
      [
        { className: 'fl.events.ComponentEvent', source: COMPONENT_EVENT },
        { className: 'fl.events.SliderEvent', source: SLIDER_EVENT },
      ],
      scene,
      tsSyntaxCheck,
    );
    const emitted = planEmitDetailed(
      { scene, sceneJson: serialiseScene(scene), templates: readTemplates(), translated: artifact.classes, handwritten: [] },
      [],
    );
    const { errors } = typeCheckProject({ files: new Map(emitted.files.map((f) => [f.path, f.content])), repoRoot });
    const own = errors.filter((e) => e.file.startsWith('src/fl/events/'));
    expect(own.filter((e) => e.code === 4113 || e.code === 2339)).toEqual([]);
    expect(own).toEqual([]);
  });
});

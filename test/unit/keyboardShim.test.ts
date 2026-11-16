// Validates: Requirements 4.1, 4.2, 4.3, 4.6
import { describe, expect, it } from 'vitest';
import { Event, KeyboardEvent } from '../../template/shim/events';
import { Keyboard } from '../../template/shim/Keyboard';
import * as shim from '../../template/shim/index';
import { SHIM_AS3_NAMES } from '../../src/translate/shimNames';
import { translateCore } from '../../src/translate/translate';
import { tsSyntaxCheck } from '../../src/translate/tsSyntaxCheck';
import { fixtureTables } from '../support/tables';

describe('KeyboardEvent and Keyboard (design D3)', () => {
  it('holds the event types and a numeric keyCode, and extends Event', () => {
    expect(KeyboardEvent.KEY_DOWN).toBe('keyDown');
    expect(KeyboardEvent.KEY_UP).toBe('keyUp');
    const e = new KeyboardEvent(KeyboardEvent.KEY_DOWN, true, false, 38);
    expect(e).toBeInstanceOf(Event);
    expect(e.keyCode).toBe(38);
    expect(new KeyboardEvent('keyUp').keyCode).toBe(0);
    expect((e.clone() as KeyboardEvent).keyCode).toBe(38);
  });
  it('exports the seven key codes of flash.ui.Keyboard', () => {
    expect([Keyboard.UP, Keyboard.DOWN, Keyboard.LEFT, Keyboard.RIGHT, Keyboard.ENTER, Keyboard.ESCAPE, Keyboard.SPACE]).toEqual([
      38, 40, 37, 39, 13, 27, 32,
    ]);
  });
  it('is exported from the Shim index and listed as a Shim name', () => {
    expect(shim.KeyboardEvent).toBe(KeyboardEvent);
    expect(shim.Keyboard).toBe(Keyboard);
    expect(SHIM_AS3_NAMES.has('KeyboardEvent')).toBe(true);
    expect(SHIM_AS3_NAMES.has('Keyboard')).toBe(true);
  });
  it('translates a Fixture_Class so KeyboardEvent and Keyboard import from the Shim', () => {
    const src =
      'package\n{\n  import flash.display.Sprite;\n  import flash.events.KeyboardEvent;\n  import flash.ui.Keyboard;\n  public class KeyFix extends Sprite\n  {\n' +
      '    public function KeyFix()\n    {\n      super();\n      this.addEventListener(KeyboardEvent.KEY_DOWN,this.onKey);\n    }\n' +
      '    private function onKey(e:KeyboardEvent) : void\n    {\n      if(e.keyCode == Keyboard.SPACE)\n      {\n        trace("space");\n      }\n    }\n  }\n}\n';
    const out = translateCore(src, {
      shimNames: SHIM_AS3_NAMES,
      tables: fixtureTables('test/fixtures/clickgoto', [['KeyFix', src]]),
      selfQualified: 'KeyFix',
      siblingClasses: new Set(['KeyFix']),
      syntaxCheck: tsSyntaxCheck,
    }).text;
    expect(out).toMatch(/import \{[^}]*\bKeyboardEvent\b[^}]*\} from '\.\.\/shim';/);
    expect(out).toMatch(/import \{[^}]*\bKeyboard\b[^}]*\} from '\.\.\/shim';/);
    expect(out).toContain('KeyboardEvent.KEY_DOWN');
  });
});

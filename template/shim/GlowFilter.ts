// Filters (as3-coverage task 16.3, Requirement 16). Stored, not drawn.
import { registerClassName } from './classNames';

export class GlowFilter {
  constructor(
    public color = 0xff0000,
    public alpha = 1,
    public blurX = 6,
    public blurY = 6,
    public strength = 2,
  ) {}
}
registerClassName(GlowFilter, 'GlowFilter');

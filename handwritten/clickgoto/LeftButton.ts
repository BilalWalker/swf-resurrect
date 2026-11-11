import { Event, MouseEvent, MovieClip } from '../shim';

interface ClickStage extends MovieClip {
  r_button: MovieClip;
}

export class LeftButton extends MovieClip {
  constructor() {
    super();
    this.addEventListener(MouseEvent.CLICK, this.clicked);
    this.stop();
  }

  clicked = (_event: Event): void => {
    this.gotoAndStop(2);
    (this.parent as unknown as ClickStage).r_button.gotoAndStop(1);
  };
}

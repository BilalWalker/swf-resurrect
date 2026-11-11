import { Event, MouseEvent, MovieClip } from '../shim';

interface ClickStage extends MovieClip {
  l_button: MovieClip;
}

export class RightButton extends MovieClip {
  constructor() {
    super();
    this.addEventListener(MouseEvent.CLICK, this.clicked);
    this.stop();
  }

  clicked = (_event: Event): void => {
    this.gotoAndPlay(1);
    (this.parent as unknown as ClickStage).l_button.gotoAndPlay(2);
  };
}

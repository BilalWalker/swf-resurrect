package
{
   import flash.events.*;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol3")]
   public class RightButton extends EventWatcher
   {
      
      public function RightButton()
      {
         addFrameScript(0,this.frame1,1,this.frame2);
         super();
         this.addEventListener(MouseEvent.CLICK,this.clicked);
         this.stop();
      }
      
      public function clicked(event:Event) : *
      {
         trace("///(RightButton clicked...)");
         trace("///this.gotoAndPlay(1);");
         this.gotoAndPlay(1);
         trace("///this.parent.l_button.gotoAndPlay(2);");
         this.parent.l_button.gotoAndPlay(2);
      }
      
      internal function frame1() : *
      {
         trace("///RightButton Frame 1");
      }
      
      internal function frame2() : *
      {
         trace("///RightButton Frame 2");
      }
   }
}


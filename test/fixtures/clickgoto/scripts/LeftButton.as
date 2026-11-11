package
{
   import flash.events.*;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol6")]
   public class LeftButton extends EventWatcher
   {
      
      public function LeftButton()
      {
         addFrameScript(0,this.frame1,1,this.frame2);
         super();
         this.addEventListener(MouseEvent.CLICK,this.clicked);
         this.stop();
      }
      
      public function clicked(event:Event) : *
      {
         trace("///(LeftButton clicked...)");
         trace("///this.gotoAndStop(2);");
         this.gotoAndStop(2);
         trace("///this.parent.r_button.gotoAndStop(1);");
         this.parent.r_button.gotoAndStop(1);
      }
      
      internal function frame1() : *
      {
         trace("///LeftButton Frame 1");
      }
      
      internal function frame2() : *
      {
         trace("///LeftButton Frame 2");
      }
   }
}


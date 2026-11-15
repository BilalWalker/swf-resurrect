package test_fla
{
   import adobe.utils.*;
   import flash.accessibility.*;
   import flash.desktop.*;
   import flash.display.*;
   import flash.errors.*;
   import flash.events.*;
   import flash.external.*;
   import flash.filters.*;
   import flash.geom.*;
   import flash.globalization.*;
   import flash.media.*;
   import flash.net.*;
   import flash.net.drm.*;
   import flash.printing.*;
   import flash.profiler.*;
   import flash.sampler.*;
   import flash.sensors.*;
   import flash.system.*;
   import flash.text.*;
   import flash.text.engine.*;
   import flash.text.ime.*;
   import flash.ui.*;
   import flash.utils.*;
   import flash.xml.*;
   
   [SWF(width="550", height="400", backgroundColor="#ffffff", frameRate="24")]
   public dynamic class MainTimeline extends MovieClip
   {
      
      public var click_mc:MovieClip;
      
      public function MainTimeline()
      {
         super();
         addFrameScript(0,this.frame1);
      }
      
      public function clickHandler(e:*) : *
      {
         trace("Clicked at " + mouseX + ", " + mouseY + " target: " + e.target + " " + e.target.name);
      }
      
      internal function frame1() : *
      {
         this.click_mc.stage.addEventListener(MouseEvent.CLICK,this.clickHandler);
      }
   }
}


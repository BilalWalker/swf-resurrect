package slider1_fla
{
   import adobe.utils.*;
   import fl.controls.Slider;
   import fl.events.SliderEvent;
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
      
      public var aSlider:Slider;
      
      public var bSlider:Slider;
      
      public function MainTimeline()
      {
         super();
         addFrameScript(0,this.frame1);
         this.__setProp_bSlider_Scene1_Layer1_0();
         this.__setProp_aSlider_Scene1_Layer1_0();
      }
      
      public function changeHandler(param1:SliderEvent) : void
      {
         trace("changeHandler: " + param1.value);
      }
      
      internal function __setProp_bSlider_Scene1_Layer1_0() : *
      {
         try
         {
            this.bSlider["componentInspectorSetting"] = true;
         }
         catch(e:Error)
         {
         }
         this.bSlider.direction = "vertical";
         this.bSlider.enabled = true;
         this.bSlider.liveDragging = false;
         this.bSlider.maximum = 10;
         this.bSlider.minimum = 0;
         this.bSlider.snapInterval = 0;
         this.bSlider.tickInterval = 2;
         this.bSlider.value = 0;
         this.bSlider.visible = true;
         try
         {
            this.bSlider["componentInspectorSetting"] = false;
         }
         catch(e:Error)
         {
         }
      }
      
      internal function __setProp_aSlider_Scene1_Layer1_0() : *
      {
         try
         {
            this.aSlider["componentInspectorSetting"] = true;
         }
         catch(e:Error)
         {
         }
         this.aSlider.direction = "horizontal";
         this.aSlider.enabled = true;
         this.aSlider.liveDragging = false;
         this.aSlider.maximum = 300;
         this.aSlider.minimum = 0;
         this.aSlider.snapInterval = 0;
         this.aSlider.tickInterval = 15;
         this.aSlider.value = 0;
         this.aSlider.visible = true;
         try
         {
            this.aSlider["componentInspectorSetting"] = false;
         }
         catch(e:Error)
         {
         }
      }
      
      internal function frame1() : *
      {
         trace("addEventListener");
         this.aSlider.addEventListener(SliderEvent.CHANGE,this.changeHandler);
      }
   }
}


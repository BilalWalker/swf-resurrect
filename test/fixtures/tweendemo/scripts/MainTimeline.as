package
{
   import flash.display.*;
   import flash.events.*;
   
   [SWF(width="550", height="400", backgroundColor="#ffffff", frameRate="24")]
   public class MainTimeline extends EventWatcher
   {
      
      public var l_button:LeftButton;
      
      public var r_button:RightButton;
      
      internal var invocation:* = 0;
      
      internal var destroy_me:* = false;
      
      public function MainTimeline()
      {
         addFrameScript(0,this.frame1,1,this.frame2,2,this.frame3);
         super();
         this.addEventListener(Event.ENTER_FRAME,this.enter_frame_controller);
         this.addEventListener(Event.EXIT_FRAME,this.exit_frame_controller);
      }
      
      internal function inspect(from:DisplayObject) : *
      {
         var child:* = undefined;
         var num_children:* = undefined;
         var i:* = undefined;
         if(from instanceof DisplayObjectContainer)
         {
            num_children = 0;
            for(i = 0; i < from.numChildren; i += 1)
            {
               if(from.getChildAt(i))
               {
                  num_children += 1;
               }
            }
            trace("/// (Container:",from.name,"with",num_children,"children)");
            for(i = 0; i < from.numChildren; i += 1)
            {
               child = from.getChildAt(i);
               if(child)
               {
                  this.inspect(child);
               }
            }
         }
         else if(!(from instanceof Shape))
         {
            trace("/// (Unknown:",from.name,")");
         }
      }
      
      internal function enter_frame_controller(evt:Event) : *
      {
         ++this.invocation;
         if(this.invocation == 30)
         {
            this.destroy_me = true;
         }
         this.inspect(this);
      }
      
      internal function exit_frame_controller(evt:Event) : *
      {
         this.inspect(this);
         if(this.destroy_me)
         {
            this.destroy();
            this.l_button.destroy();
            this.r_button.destroy();
            this.removeEventListener(Event.ENTER_FRAME,this.enter_frame_controller);
            this.removeEventListener(Event.EXIT_FRAME,this.exit_frame_controller);
            this.stop();
         }
      }
      
      internal function frame1() : *
      {
         trace("//MainTimeline frame 1");
      }
      
      internal function frame2() : *
      {
         trace("//MainTimeline frame 2");
      }
      
      internal function frame3() : *
      {
         trace("//MainTimeline frame 3");
      }
   }
}


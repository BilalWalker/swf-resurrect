package code
{
   import flash.display.*;
   import flash.events.*;

   // Hand-written probe with the shape of a class whose constructor body
   // reads a timeline child and registers listeners on it (Requirement 24.7).
   public class Interactivity3 extends MovieClip
   {
      public var joystick:MovieClip;
      public var initx:Number = 0;
      public var presses:int = 0;

      public function Interactivity3()
      {
         super();
         initx = joystick.x;
         joystick.addEventListener(MouseEvent.MOUSE_DOWN,pressHandler);
         stage.addEventListener(MouseEvent.MOUSE_UP,pressHandler);
      }

      protected function pressHandler(e:MouseEvent):void
      {
         presses++;
      }
   }
}

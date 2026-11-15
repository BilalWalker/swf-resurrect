package
{
   import flash.display.*;
   
   [SWF(width="150", height="150", backgroundColor="#ffffff", frameRate="24")]
   public class Main extends Sprite
   {
      
      public var mask1:DisplayObject;
      
      public var maskee1:DisplayObject;
      
      public var mask2:DisplayObject;
      
      public var maskee2:DisplayObject;
      
      public function Main()
      {
         super();
         maskee1.mask = mask1;
         mask2.mask = maskee2;
         trace("Masks reapplied");
      }
   }
}


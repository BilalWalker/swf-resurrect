package
{
   import flash.display.*;

   // Hand-written probe with the shape of a document class that assigns
   // properties of its timeline children in the constructor (Requirement 24.7).
   public class Main extends Sprite
   {
      public var mask1:DisplayObject;
      public var maskee1:DisplayObject;
      public var seen:Object;

      public function Main()
      {
         super();
         maskee1.mask = mask1;
         seen = maskee1;
      }
   }
}

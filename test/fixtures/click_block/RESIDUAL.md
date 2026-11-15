# click_block residual attribution (breadth task 16.5)

Every differing region of every compared frame (frames 1, 2, 4, 5, 6, 7, 9, 10), found with the Pipeline --verify run (Overall_Match 95.75). Text regions: the reference draws the dynamic text "Text" (orange 255,153,51 on green) that the render omits (DefineEditText, Named_Limit text). Region 5: the pink morph square that the render omits (DefineMorphShape, Named_Limit morph-shape); it shrinks from frame 1 to frame 9 and is gone in frame 10. Outcome ecorded means a Known_Visual_Limit in samples/click_block/residual-causes.json; nothing was fixed. Per-region pixel breakdowns are in the messages of that file.

| Frame | Region | bbox x0,y0-x1,y1 | Pixels | Cause | Outcome |
|---|---|---|---|---|---|
| 1 | 1 | 222,183-243,210 | 142 | text | recorded |
| 1 | 2 | 288,184-297,211 | 104 | text | recorded |
| 1 | 3 | 247,191-264,211 | 190 | text | recorded |
| 1 | 4 | 268,191-285,210 | 145 | text | recorded |
| 1 | 5 | 419,282-533,382 | 11615 | morph-shape | recorded |
| 1 | total | | 12196 (= 12196) | | |
| 2 | 1 | 222,183-243,210 | 142 | text | recorded |
| 2 | 2 | 288,184-297,211 | 104 | text | recorded |
| 2 | 3 | 247,191-264,211 | 190 | text | recorded |
| 2 | 4 | 268,191-285,210 | 145 | text | recorded |
| 2 | 5 | 419,281-533,382 | 10943 | morph-shape | recorded |
| 2 | total | | 11524 (= 11524) | | |
| 4 | 1 | 222,183-243,210 | 142 | text | recorded |
| 4 | 2 | 288,184-297,211 | 104 | text | recorded |
| 4 | 3 | 247,191-264,211 | 190 | text | recorded |
| 4 | 4 | 268,191-285,210 | 145 | text | recorded |
| 4 | 5 | 420,278-533,382 | 9883 | morph-shape | recorded |
| 4 | total | | 10464 (= 10464) | | |
| 5 | 1 | 222,183-243,210 | 142 | text | recorded |
| 5 | 2 | 288,184-297,211 | 104 | text | recorded |
| 5 | 3 | 247,191-264,211 | 190 | text | recorded |
| 5 | 4 | 268,191-285,210 | 145 | text | recorded |
| 5 | 5 | 420,277-533,382 | 9544 | morph-shape | recorded |
| 5 | total | | 10125 (= 10125) | | |
| 6 | 1 | 222,183-243,210 | 142 | text | recorded |
| 6 | 2 | 288,184-297,211 | 104 | text | recorded |
| 6 | 3 | 247,191-264,211 | 190 | text | recorded |
| 6 | 4 | 268,191-285,210 | 145 | text | recorded |
| 6 | 5 | 421,276-533,382 | 9335 | morph-shape | recorded |
| 6 | total | | 9916 (= 9916) | | |
| 7 | 1 | 222,183-243,210 | 142 | text | recorded |
| 7 | 2 | 288,184-297,211 | 104 | text | recorded |
| 7 | 3 | 247,191-264,211 | 190 | text | recorded |
| 7 | 4 | 268,191-285,210 | 145 | text | recorded |
| 7 | 5 | 421,275-533,382 | 9280 | morph-shape | recorded |
| 7 | total | | 9861 (= 9861) | | |
| 9 | 1 | 222,183-243,210 | 142 | text | recorded |
| 9 | 2 | 288,184-297,211 | 104 | text | recorded |
| 9 | 3 | 247,191-264,211 | 190 | text | recorded |
| 9 | 4 | 268,191-285,210 | 145 | text | recorded |
| 9 | 5 | 422,273-533,382 | 9532 | morph-shape | recorded |
| 9 | total | | 10113 (= 10113) | | |
| 10 | 1 | 222,183-243,210 | 142 | text | recorded |
| 10 | 2 | 288,184-297,211 | 104 | text | recorded |
| 10 | 3 | 247,191-264,211 | 190 | text | recorded |
| 10 | 4 | 268,191-285,210 | 145 | text | recorded |
| 10 | total | | 581 (= 581) | | |

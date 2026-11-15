# slider_component residual attribution (breadth task 17.5)
Every differing region of the one compared frame (frame 1), found with the Pipeline --verify run (exit code 0, Overall_Match 99.93, 165 differing pixels in 6 regions). Regions are 8-connected components of the pixels over the Verify_Tolerance. Outcome recorded means an entry in samples/slider_component/residual-causes.json; nothing was fixed. All six regions have one cause, stroke-scaling: the shapes draw a rectangle outline with stroke width 1 (shape 1, symbol 2) and the instances scale it non-uniformly (aSlider 3.75 in x, symbol 2 0.1363678 in y, bSlider rotated and reflected). The render (PixiJS Graphics) applies the instance matrix to the stroke width, so an edge is 3.75 px or 0.136 px wide depending on its direction. The reference line is about 1 px wide on every edge. The full message per entry, with pixel values, is in the register.
| Frame | Region | bbox x0,y0-x1,y1 | Pixels | Cause | Outcome |
|---|---|---|---|---|---|
| 1 | 1 | 18,20-18,22 | 3 | stroke-scaling | recorded |
| 1 | 2 | 321,20-321,22 | 3 | stroke-scaling | recorded |
| 1 | 3 | 21,21-21,21 | 1 | stroke-scaling | recorded |
| 1 | 4 | 318,21-318,21 | 1 | stroke-scaling | recorded |
| 1 | 5 | 175,110-175,187 | 78 | stroke-scaling | recorded |
| 1 | 6 | 178,110-178,188 | 79 | stroke-scaling | recorded |
| 1 | total | | 165 (= 165) | | |
By cause (regions, pixels): stroke-scaling 6, 165
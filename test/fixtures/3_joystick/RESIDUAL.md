# 3_joystick residual attribution (breadth task 17.2)
Every differing region of the one compared frame (frame 1), found with the Pipeline --verify run (exit code 0, Overall_Match 98.86, 1225 differing pixels in 59 regions). Regions are 8-connected components of the pixels over the Verify_Tolerance. Outcome recorded means a Known_Visual_Limit in samples/3_joystick/residual-causes.json; nothing was fixed. Causes: subpixel-strips (panel frame of stacked strips under 1.15 px), ring-edge (outer edge and shadow of the ring), sphere-edge (red sphere outline), gradient-step (quantised reference gradient against continuous render), gradient-phase (shaft ramp sampled half a pixel apart), edge-antialiasing (thin edges and tips). The 1,241 pixel figure of the first pass is the old count; this run measures 1225 (the first pass was a different renderer). The full message per entry is in the register.

| Frame | Region | bbox x0,y0-x1,y1 | Pixels | Cause | Outcome |
|---|---|---|---|---|---|
| 1 | 1 | 115,9-115,9 | 1 | edge-antialiasing | recorded |
| 1 | 2 | 239,9-454,10 | 414 | subpixel-strips | recorded |
| 1 | 3 | 239,32-239,34 | 3 | subpixel-strips | recorded |
| 1 | 4 | 239,37-239,42 | 6 | subpixel-strips | recorded |
| 1 | 5 | 77,54-77,54 | 1 | edge-antialiasing | recorded |
| 1 | 6 | 99,58-100,58 | 2 | ring-edge | recorded |
| 1 | 7 | 129,58-129,58 | 1 | ring-edge | recorded |
| 1 | 8 | 96,59-97,59 | 2 | ring-edge | recorded |
| 1 | 9 | 132,59-133,59 | 2 | ring-edge | recorded |
| 1 | 10 | 136,59-136,60 | 2 | ring-edge | recorded |
| 1 | 11 | 93,60-93,60 | 1 | ring-edge | recorded |
| 1 | 12 | 91,61-91,61 | 1 | ring-edge | recorded |
| 1 | 13 | 138,61-138,61 | 1 | ring-edge | recorded |
| 1 | 14 | 140,61-140,62 | 2 | ring-edge | recorded |
| 1 | 15 | 239,61-239,65 | 5 | subpixel-strips | recorded |
| 1 | 16 | 87,62-89,63 | 3 | ring-edge | recorded |
| 1 | 17 | 142,63-142,63 | 1 | ring-edge | recorded |
| 1 | 18 | 85,64-85,64 | 1 | ring-edge | recorded |
| 1 | 19 | 144,64-144,64 | 1 | ring-edge | recorded |
| 1 | 20 | 82,65-83,66 | 2 | ring-edge | recorded |
| 1 | 21 | 146,65-150,67 | 7 | ring-edge | recorded |
| 1 | 22 | 78,78-110,107 | 166 | sphere-edge | recorded |
| 1 | 23 | 112,79-112,80 | 2 | gradient-step | recorded |
| 1 | 24 | 163,81-175,98 | 49 | ring-edge | recorded |
| 1 | 25 | 64,83-65,84 | 2 | ring-edge | recorded |
| 1 | 26 | 62,87-62,87 | 1 | ring-edge | recorded |
| 1 | 27 | 61,89-61,89 | 1 | ring-edge | recorded |
| 1 | 28 | 60,91-60,92 | 2 | ring-edge | recorded |
| 1 | 29 | 79,97-79,97 | 1 | sphere-edge | recorded |
| 1 | 30 | 159,101-194,106 | 207 | gradient-phase | recorded |
| 1 | 31 | 153,104-155,104 | 3 | sphere-edge | recorded |
| 1 | 32 | 56,106-56,106 | 1 | ring-edge | recorded |
| 1 | 33 | 384,107-384,107 | 1 | edge-antialiasing | recorded |
| 1 | 34 | 79,109-80,109 | 2 | gradient-step | recorded |
| 1 | 35 | 365,109-365,109 | 1 | gradient-step | recorded |
| 1 | 36 | 75,111-75,111 | 1 | sphere-edge | recorded |
| 1 | 37 | 80,111-80,111 | 1 | gradient-step | recorded |
| 1 | 38 | 365,111-366,112 | 2 | gradient-step | recorded |
| 1 | 39 | 369,114-369,114 | 1 | gradient-step | recorded |
| 1 | 40 | 378,123-378,123 | 1 | edge-antialiasing | recorded |
| 1 | 41 | 348,124-348,124 | 1 | gradient-step | recorded |
| 1 | 42 | 352,124-352,124 | 1 | gradient-step | recorded |
| 1 | 43 | 372,124-382,139 | 57 | edge-antialiasing | recorded |
| 1 | 44 | 56,125-56,126 | 2 | ring-edge | recorded |
| 1 | 45 | 331,128-331,128 | 1 | gradient-step | recorded |
| 1 | 46 | 164,133-176,152 | 68 | ring-edge | recorded |
| 1 | 47 | 385,145-387,147 | 4 | edge-antialiasing | recorded |
| 1 | 48 | 155,155-161,162 | 19 | ring-edge | recorded |
| 1 | 49 | 158,163-158,163 | 1 | ring-edge | recorded |
| 1 | 50 | 128,165-151,177 | 80 | ring-edge | recorded |
| 1 | 51 | 80,166-87,170 | 11 | ring-edge | recorded |
| 1 | 52 | 89,171-102,178 | 25 | ring-edge | recorded |
| 1 | 53 | 104,174-105,178 | 6 | ring-edge | recorded |
| 1 | 54 | 125,174-125,174 | 1 | ring-edge | recorded |
| 1 | 55 | 109,176-121,177 | 23 | ring-edge | recorded |
| 1 | 56 | 125,176-125,178 | 3 | ring-edge | recorded |
| 1 | 57 | 237,190-237,194 | 5 | subpixel-strips | recorded |
| 1 | 58 | 237,199-237,204 | 6 | subpixel-strips | recorded |
| 1 | 59 | 237,206-237,212 | 7 | subpixel-strips | recorded |
| 1 | total | | 1225 (= 1225) | | |

By cause (regions, pixels): edge-antialiasing 6, 65; subpixel-strips 7, 446; ring-edge 32, 324; sphere-edge 4, 171; gradient-step 9, 12; gradient-phase 1, 207

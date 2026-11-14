# Simple Lamp carrier board

A 3D-printed plate that takes the place of a PCB: 85.1 x 62.2 x 4 mm. Parts sit on the top face with their legs through holes. On the bottom face every connection is a channel 2 mm wide and 2 mm deep; you lay bare wire in the channels and solder it to the legs.

| File | What it is |
|---|---|
| `carrier_board.stl` | The board, already turned over for printing (channels up) |
| `carrier_board.png` | Top view (where parts go) and bottom view (which channel is which) |
| `carrier_wiring.md` | Every channel and the pads it joins, with wire lengths |
| `make_board.py` | Generates all three. Edit the part positions and run it again |

**Nothing has been printed or fitted yet.** The channels were routed and checked by the script (no channel touches another connection or a foreign hole, the STL is a closed solid, channels measure 2 mm deep and 2 mm wide in the file). The module footprints are from typical dimensions, not from your parts: **check the three modules against the table below before printing.**

## Parts it is laid out for

I had to assume the exact parts. If yours differ, change the hole positions in `place()` in `make_board.py` and run it again.

| Ref | Part | Assumed footprint |
|---|---|---|
| U1 | ESP32-C3 SuperMini on pin headers | 2 rows of 8 pins, 2.54 mm pitch, rows 15.24 mm apart |
| M1 | TP4056 charger module with protection | 28 x 17 mm; OUT+ and OUT- holes 12.7 mm apart, 1.9 mm from the end; IN+ 2.5 mm from the USB end |
| M2 | 5 V boost module, MT3608 size | 36.8 x 17 mm; holes 33 mm apart along the length, 12.7 mm across |
| U2 | 74AHCT125, DIP-14 (not the SMD one) | 7.62 mm row spacing |
| Q1 | 2N7000, TO-92 (through-hole twin of the 2N7002) | legs spread to 2.54 mm |
| Q2 | Logic-level P-channel MOSFET, TO-220 (for example NDP6020P) | legs G-D-S at 2.54 mm |
| Q3, Q4 | IRLZ44N, TO-220. Strip lamps only | legs G-D-S at 2.54 mm |
| D1 | 1N5817 Schottky diode | 10.2 mm between holes |
| R1, R2 | 220k | R1 10.2 mm, R2 12.7 mm between holes |
| R3 | 10k | 12.7 mm |
| R4 | 20k | 12.7 mm |
| R5 | 330R | 10.2 mm |
| R6, R7 | 100k | 10.2 mm |

Two things differ from your XIAO lamps, both because SMD parts can't go on a printed board:

- **Q2 must switch fully on at 3.3 V on its gate** (a "logic-level" part). An ordinary P-channel MOSFET will only half turn on from a 1S battery and the LEDs will be dim or the part will get hot. If you'd rather keep the AO3401 + 2N7002, put them on a small SOT-23 breakout and tell me its pin spacing.
- **D1 is new.** The C3 is fed from the battery through its 5V pin, and the diode stops the C3's own USB socket from pushing current back into the battery while you program it.

Leave Q3 and Q4 out on pixel lamps. Leave U2 and R5 out on plain-strip lamps.

## Layout notes

- **The C3's USB socket faces the left edge, the charger's faces the top edge.** They are on different edges. If the lamp body needs them on the same side, say so; it means a re-arrangement, not just a parameter.
- **Battery** wires solder straight onto the charger module's B+ and B- pads. They don't go through the board.
- **Boost module:** only VIN- is wired for ground, because the two minus pads are joined on the module. There is no hole for VOUT-.
- **Charging status (CHRG) is not on the board.** The module doesn't bring it out. The firmware works without it (see the firmware README).
- **Wires off the board** (1.8 mm holes, named on the top face): SWITCH x2 (the hidden on/off switch), LAMP, GRP and a shared GND for the two buttons, LED 5V, DATA and GND for pixels, WARM- and COOL- for a plain strip (its + goes to LED 5V).
- LED 5V sits about 18 mm from DATA and GND; it couldn't be brought next to them without a crossing.
- Three M3 mounting holes (3.4 mm). They are where there was room, not in the corners.
- No wire links were needed: every connection is a channel.

## Printing

- Print it as it comes: channels facing up, part names on the bed. No supports.
- PETG or ABS/ASA rather than PLA. A soldering iron softens PLA in a second; even with PETG, solder quickly and let joints cool.
- 0.4 mm nozzle, 0.2 mm layers. The thinnest wall, between channels of neighbouring pins, is 0.54 mm (one line wide). That is the 2 mm channel on a 2.54 mm pin pitch; it can't be thicker without narrowing the channel.
- The part outlines and names are 0.4 mm deep in the first layers. If they come out mushy, set `ENGRAVE = 0` in the script.
- Holes are 1.4 mm for legs and 1.8 mm for wires. Printed holes come out small; run a drill through them if needed.

## Assembly

1. Push the parts in from the top, lowest first: resistors and diode, DIP, transistors, then the modules. Note D1's band (marked on the board) and U2's pin 1 dot.
2. Turn the board over. Use `carrier_board.png` (bottom view) and `carrier_wiring.md`.
3. For each channel, lay one piece of bare solid wire along it (0.8 to 1 mm copper suits a 2 mm channel) and solder every leg it passes. Short hops between neighbouring legs can be the bent-over legs themselves.
4. The modules have pads, not legs: solder a short wire stub into each pad, down through the hole, and into its channel.
5. The C3's header pins are longer than the board is thick and will stick out about 2 mm. Trim them flush after soldering if the board sits on something.
6. Ground is one long run around three edges with branches (230 mm in all). Do it first.

Before powering from a battery, check with a meter that the VSW and GND channels are not shorted, and that neighbouring header-pin channels are not bridged.

## Changing it

Everything is on a 0.635 mm grid, seen from the top. `place()` lists every hole; `guide()` lines fix the main runs (ground, the five connections that leave between the C3's rows, the supply under the boost module) and the rest is routed automatically. `python3 make_board.py` stops with a message if a connection no longer fits. It needs `numpy shapely trimesh manifold3d matplotlib`.

Channel width, depth and board thickness are the constants at the top (`CH_W`, `CH_D`, `T_FLOOR`).

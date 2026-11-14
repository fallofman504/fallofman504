# Simple Lamp firmware 0.1.0

The plain-white line: ESP32-C3 board, white or warm/cool LEDs, two push buttons, 1S LiPo. Lamps work on their own, and lamps that have been paired control each other over ESP-NOW (no router needed).

One firmware for every lamp. Light type, LED count and brightness limit are set on the Maker page.

**Not yet run on real hardware.** It compiles for the ESP32-C3 against esp32 core 3.3.x and Adafruit NeoPixel 1.15.5, the button-combination order has a test, and the panel page was exercised in a browser against a fake lamp. Radio timing, sleep current and pairing between real boards still need a bench session; see "Check on the bench first".

## Buttons

| Lamp button | |
|---|---|
| Tap | This lamp on / off |
| Hold | Dims; let go and hold again to go the other way. From off, it starts dim and rises |
| Double tap | Next warm/cool setting: warm, neutral, cool (warm/cool lamps only) |

| Group button | |
|---|---|
| Tap | All paired lamps on |
| Keep tapping | Steps through every combination: each lamp alone (the other lamps first, this one last), then every pair, and so on, ending with all off |
| Tap after a 5 s pause | Starts over at all on. If everything is already on, it turns everything off |
| Hold 3 s | Pairing mode: the lamp pulses for 30 s. Tap to stop early |
| Hold 10 s | Leave the group (3 blinks) |

| Both buttons | |
|---|---|
| Hold 2 s | Wi-Fi panel on (2 blinks) or off (1 blink) |

On a lamp that isn't paired with anything, the group button just switches that lamp.

With 2 lamps there are 4 combinations, with 3 there are 8, with 4 there are 16. Beyond 4 or 5 lamps the panel is the quicker way to pick a combination. A group holds up to 8 lamps.

## Pairing

1. Hold the group button on both lamps for 3 seconds. Both pulse.
2. When they find each other they blink twice. They stay in pairing mode until the 30 s runs out, so a third lamp can join in the same go.
3. To add a lamp to an existing group, pair it with any one lamp of the group. The rest of the group learns about it by itself.

Pairing two lamps that are each already in a group joins the two groups together.

## Wi-Fi panel

Hold both buttons for 2 seconds on any lamp, then join the network named like `Lamps-3F2A`. The page opens by itself; if not, go to `http://192.168.4.1`. A brand-new board opens the panel by itself on its first power-up.

- Every lamp in the group is listed: on/off, brightness, warm/cool, rename, battery, remove from the group.
- All on, All off, and Pair a lamp (same as holding the group button on this lamp).
- The lamp hosting the panel passes commands to the others by radio. A lamp shows "Out of reach" if it hasn't answered for 45 s.
- The Wi-Fi password is unique per board. It is shown under Maker settings, for the card under the base.
- The panel turns off after 5 minutes with no phone connected, or with both buttons again. It uses about as much power as a dim lamp, so don't leave it on.

**Maker settings** (password `lampmaker`, set by `MAKER_PASS` in `config.h`; change it): light type, number of LEDs, brightness limit, and firmware update. Both apply to the lamp you are connected to.

| Light type | Use for |
|---|---|
| Pixels: SK6812 RGBW, white only | RGBW pixels where only the white chip is wanted |
| Pixels: warm/cool (cool, warm) | SK6812 WWA and similar. If warm and cool are swapped, pick the next one |
| Pixels: warm/cool (warm, cool) | Same pixels wired the other way round |
| Pixels: white only, 3 channels | Addressable white strips with three white channels per pixel |
| Plain strip: white | Non-addressable strip on one MOSFET |
| Plain strip: warm + cool | Non-addressable CCT strip on two MOSFETs |

## Pin map (ESP32-C3)

| Function | GPIO |
|---|---|
| Lamp button (to GND) | 3 |
| Group button (to GND) | 4 |
| Pixel data (via level shifter + 330 Ω) | 10 |
| Plain strip, white or warm (MOSFET gate) | 5 |
| Plain strip, cool (MOSFET gate) | 6 |
| LED power enable, HIGH = on (high-side switch) | 7 |
| Battery sense (220k/220k divider) | 0 |

Buttons use the chip's internal pull-ups. Pins 2, 8 and 9 are left alone because the chip reads them at power-up.

If a lamp has no battery divider, set `PIN_BATT_ADC` to `-1` in `config.h` (or tie GPIO0 to GND). A floating pin can read like a flat battery and lock the light off. Same for `PIN_LED_EN` if there is no LED power switch, though for pixels the switch matters: each pixel draws about 1 mA while "off".

The LED switch is assumed to be on the high side, as on the XIAO lamps. The low-side variant from the Lamp Controller (data line held high while off) is not carried over.

## Battery life and response time

A paired lamp has to listen for the other lamps even when it is off. To save battery it naps with the radio off and listens for 15 ms every 300 ms. A lamp sending a command repeats it for 450 ms so every napping lamp catches one copy. So:

- The first group tap reaches the other lamps within about a third of a second. After that they stay fully awake for 3 s, so further taps are instant.
- Rough standby estimate for a paired lamp: 4 to 5 mA on a bare C3 module, about 2 to 3 weeks on 2000 mAh. This is a calculation, not a measurement.
- An unpaired lamp that is off does not listen at all and only wakes for its buttons.
- `SLEEP_MS` in `config.h` trades one for the other: 1000 gives roughly three times the standby with up to a second of delay. Every lamp in a group must be built with the same value.

Small C3 boards with a power LED or an inefficient regulator will draw more than the bare module.

## First-time setup (Arduino IDE 2.x)

1. **Board support:** esp32 by Espressif, version 3.3 or newer (same as the Lamp Controller).
2. **Library:** Adafruit NeoPixel. (ArduinoJson is not needed.)
3. **Board settings:** Board **ESP32C3 Dev Module**, USB CDC On Boot **Enabled**, partition scheme default.
4. Open `SimpleLamp.ino` (keep all the files in the same folder) and Upload.
5. The lamp blinks twice and opens its Wi-Fi panel. Set the light type and LED count under Maker settings, Save.

For a log on the Serial Monitor (115200), set `LAMP_DEBUG` to 1 in `config.h`. That also stops the lamp from sleeping, because USB serial drops out when it sleeps, so set it back to 0 for finished lamps.

Firmware updates over Wi-Fi: Sketch > Export Compiled Binary, then upload `SimpleLamp.ino.bin` under Maker settings on each lamp.

## Check on the bench first

These are the parts that could only be reasoned about, not run:

1. **Napping radio.** Turn the group on from one lamp while the other has been off for a minute. If it misses commands, raise `LISTEN_MS` (try 25).
2. **Standby current** with a meter in the battery lead, lamp off and paired.
3. **Buttons waking the lamp** from its nap on the first press.
4. **Warm/cool order and dim end** on your actual pixels.
5. **Range** between rooms. ESP-NOW usually reaches about as far as Wi-Fi does.

## Known limits

- Radio commands are not encrypted. A lamp only obeys lamps in its own group, but someone determined with their own ESP32 nearby could imitate one. Fine for a lamp; say so if it matters to a customer.
- No USB-present or charging sense yet, so no charging brightness cap like the Lamp Controller has.
- All lamps use Wi-Fi channel 1 (`RADIO_CHANNEL`).
- The lamp always starts off after power is connected.

## Files

| File | What it does |
|---|---|
| `SimpleLamp.ino` | Setup, main loop, buttons, battery protection, sleep |
| `config.h` | Pins, timings and fixed limits |
| `settings.cpp/.h` | Maker settings in flash, Wi-Fi password |
| `light.cpp/.h` | Brightness, warm/cool mix, fades, output to pixels or MOSFETs |
| `net.cpp/.h` | ESP-NOW: pairing, group commands, status between lamps |
| `combos.h` | The order the group button steps through combinations |
| `web.cpp/.h` | Wi-Fi network, panel API, firmware update |
| `web_ui.h` | The panel page, compressed (generated) |
| `ui/index.html` | The panel page source. After editing, run `python3 ui/build_ui.py` |

`../platformio.ini` and `../test/test_combos.cpp` are only for building and testing from the command line; the Arduino IDE ignores them.

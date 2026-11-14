# Simple Lamp firmware 0.2.0

The plain-white line: ESP32-C3 board, white or warm/cool LEDs (pixels or plain strips), two push buttons, 1S LiPo. Built on the same architecture as the Lamp Controller, without colors and effects, and with one addition: lamps can be paired and control each other by radio (ESP-NOW, no router).

One firmware for every lamp. Light type, LED count and current limit are set on the Maker page.

**Not yet run on real hardware.** It compiles for the ESP32-C3 against esp32 core 3.3.0, Adafruit NeoPixel 1.15.5 and ArduinoJson 7.4.2. The app page was exercised in a browser against a fake lamp, and the order of the group-button combinations has a test. Radio timing between real boards, nap current and button wake-up still need a bench session; see "Check on the bench first".

## What carried over from the Lamp Controller, and what didn't

Same: file layout, settings storage, the app (preview / Save / Undo / Done, tabs, favorites, timers, sunrise, maker page with export / import / reset, firmware update), Wi-Fi rules, battery handling (calibration, sag compensation, low-battery step, cutoff, charging limit), brightness steps and how limits squeeze them, the Serial Monitor reports.

Gone: colors, palette, effects, the touch pad and its calibration.

New or different:

- **Warm/cool steps** take the place of the color list on warm/cool lamps. Three taps step through them.
- **Lamps tab** in the app, and the group button on the lamp.
- **Buttons instead of touch.** One tap is on/off, and it acts at once instead of waiting to see if more taps follow.
- **Holding the lamp button** starts the sleep timer (the hold-to-turn-off gesture isn't needed when a tap turns the lamp off).
- **Signals are white**: with no colors, the lamp says things with blinks and pulses (table below).
- **Naps instead of deep sleep.** An off lamp that is paired has to keep listening for the others, so it naps and wakes briefly several times a second. See "Battery life".
- **Turning the lamp off does not close the app.** A lamp hosting the app for its group is often off itself.
- **Low-side LED switch option is not carried over.** The LED switch is assumed to be on the high side, as on the XIAO lamps.

## Pin map (ESP32-C3)

| Function | GPIO |
|---|---|
| Battery sense (220k/220k divider) | 0 |
| USB-present sense (10k/20k divider) | 1 |
| Lamp button (to GND) | 3 |
| Group button (to GND) | 4 |
| Plain strip: white, or warm (MOSFET gate) | 5 |
| Plain strip: cool (MOSFET gate) | 6 |
| LED power enable, HIGH = on | 7 |
| Pixel data (via 74AHCT125 + 330 Ω) | 10 |
| Charging status (TP4056 CHRG) | 20 |

Buttons use the chip's internal pull-ups. GPIO 2, 8 and 9 are left alone because the chip reads them at power-up. GPIO 20 is the board's serial RX pin; it is free because the log goes over USB.

The firmware expects the battery divider and USB sense to be wired, as on your other lamps. On a bare bench board, tie GPIO0 and GPIO1 to GND: floating, they can read like a flat battery or a USB cable going in and out.

## First-time setup (Arduino IDE 2.x)

1. **Board support:** esp32 by Espressif, version 3.3 or newer.
2. **Libraries:** Adafruit NeoPixel and ArduinoJson (version 7).
3. **Board settings:** Board **ESP32C3 Dev Module**, USB CDC On Boot **Enabled**, partition scheme default.
4. Open `SimpleLamp.ino` (keep all the files in the same folder) and Upload.
5. Open Serial Monitor at 115200 to read the lamp's Wi-Fi password.

**Serial Monitor and naps:** USB serial drops out every time the chip naps, which is whenever the lamp is off and quiet. To read the log on the bench, set `DEBUG_STAY_AWAKE` to 1 in `config.h`, and set it back to 0 for finished lamps.

## Setting up each new lamp

After the first upload, the lamp opens its Wi-Fi for 2 minutes (slow pulse).

1. Join the network named like `Lamp-3F2A` with the password from Serial Monitor. The control page opens by itself; if not, go to `http://192.168.4.1`.
2. Settings > Maker settings (password `lampmaker`; change it).
3. Set **Light type** and **Number of LEDs**, then Save. The lamp restarts and comes back on Wi-Fi.
4. Copy the Wi-Fi network name and password from the **Wi-Fi card** section onto the card under the base.
5. Optional: calibrate the battery reading against a multimeter.

| Light type | Use for |
|---|---|
| Pixels: RGBW, white only | SK6812 RGBW pixels where only the white chip is wanted |
| Pixels: warm/cool (cool, warm) | SK6812 WWA and similar. If warm and cool come out swapped, pick the next one |
| Pixels: warm/cool (warm, cool) | The same pixels wired the other way round |
| Pixels: white only, 3 channels | Addressable white strips with three white channels per pixel |
| Plain strip: white | Non-addressable strip on one MOSFET |
| Plain strip: warm + cool | Non-addressable warm/cool strip on two MOSFETs |

For plain strips, the Maker page's current field holds what the strip draws at full brightness. It feeds the battery estimates; nothing limits a plain strip's current.

**Faster for a batch:** set up one lamp, then Maker > Export settings. On each new lamp, Maker > Import settings. (The Wi-Fi password and the paired lamps are never exported.)

## Buttons

| Lamp button | |
|---|---|
| 1 tap | On / off |
| 2 taps | Next brightness step |
| 3 taps | Next warm/cool step (warm/cool lamps) |
| 4 taps | Battery: 1 blink 0-30%, 2 blinks 31-60%, 3 blinks 61-100%. Pulses while charging, steady when full |
| 5 taps | Wi-Fi app on/off |
| Hold 1 s | Sleep timer: one blink, then the lamp fades out slowly and turns off |

A tap during the auto-off fade, sleep timer or sunrise cancels that and does nothing else.

Because the first tap acts at once, a 2- or 3-tap series on a lit lamp starts to fade off for a moment and comes straight back. From off, any number of taps up to 3 just turns it on.

| Group button | |
|---|---|
| Tap | All paired lamps on |
| Keep tapping | Steps through every combination: each lamp alone (the other lamps first, this one last), then every pair, and so on, ending with all off |
| Tap after a 5 s pause | Starts over at all on. If everything is already on, it turns everything off |
| Hold 3 s | Pairing mode: quick pulse for 30 s. A tap ends it early |
| Hold 10 s | Leave the group (3 blinks) |

On a lamp that isn't paired with anything, the group button just switches that lamp.

2 lamps have 4 combinations, 3 have 8, 4 have 16. Past 4 or 5 lamps the app's Lamps tab is the quicker way. A group holds up to 8 lamps.

## What the blinks mean

| Light | Meaning |
|---|---|
| Slow pulse (2 s) | Wi-Fi is open, waiting for a phone |
| Two soft pulses | Wi-Fi app turned on |
| Quick pulse (under 1 s) | Pairing mode |
| 2 blinks during pairing | Found another lamp |
| 2 blinks, lamp drops to lowest step | Battery low |
| 3 blinks | Battery too low to turn on, or empty; or this lamp left / was removed from its group |
| 1 blink | Sleep timer started |
| Gentle pulse when USB goes in | Charging (steady = full) |

## Pairing

1. Hold the group button on both lamps for 3 seconds. Both pulse quickly.
2. When they find each other they blink twice. They stay in pairing mode until the 30 s runs out, so a third lamp can join in the same go.
3. To add a lamp to an existing group, pair it with any one lamp of the group. The rest learn about it by themselves.

Pairing two lamps that are each already in a group joins the two groups. The app can start pairing too (Lamps > Start pairing).

## The app

Same app as the Lamp Controller: 5 taps on the lamp button, join its Wi-Fi, the page opens.

- **Light:** brightness step, warm/cool step, favorites.
- **Lamps:** every lamp in the group with on/off, next brightness step, next warm/cool step, rename, battery, and remove. All on / All off. Start pairing. The lamp you are connected to passes these on by radio; a lamp shows "Out of reach" if it hasn't answered for 45 s.
- **Steps:** edit the brightness steps, the warm/cool steps, and the brightness limit.
- **Timers:** auto-off, sleep timer (and how long the hold gesture runs), sunrise wake-up, what the lamp starts with.
- **Settings:** battery, name, Wi-Fi password, firmware update, Maker.

Steps, timers, favorites, firmware and maker settings belong to the lamp you are connected to. To change them on another lamp, join that lamp's Wi-Fi.

## Wi-Fi rules

- 2 minutes to connect, then Wi-Fi turns off.
- Once connected it stays on until **Done**, disconnecting, 5 taps, or **15 minutes without activity** in the app.
- When Wi-Fi turns off, unsaved changes are discarded and the lamp goes back to its last saved settings.
- Phones may say the network has no internet. Choose to stay connected.
- Every fresh power-up (hidden power switch off and on) opens Wi-Fi for 2 minutes.

## Firmware updates over Wi-Fi

1. Arduino IDE: Sketch > **Export Compiled Binary**. Use `SimpleLamp.ino.bin` from the `build` folder (not the `merged` or `bootloader` file).
2. In the app: Settings > Firmware, choose the file, Install. Each lamp is updated over its own Wi-Fi.
3. The lamp needs 30% battery or USB power. If the upload is interrupted, the lamp keeps running its old firmware.

Paired lamps must run firmware that speaks the same radio format. If a later version changes it, update every lamp in a group.

## Battery life

A paired lamp has to hear the other lamps even when it is off. It naps with the radio off, wakes every 300 ms and listens for 15 ms. A lamp sending a command repeats it for 450 ms so every napping lamp catches one copy.

- The first group tap reaches the other lamps within about a third of a second. They then stay fully awake for 3 s, so further taps are instant.
- Estimated standby for a paired lamp: 4 to 5 mA on a bare C3 module, about 2 to 3 weeks on 2000 mAh. This is a calculation, not a measurement. The Lamp Controller's deep sleep is far lower; that is the price of listening.
- An unpaired lamp that is off doesn't listen at all. It only wakes for a button, USB, or the sunrise alarm, and should draw well under 1 mA on a bare module.
- `NAP_MS` in `config.h` trades standby for response: 1000 gives roughly three times the standby with up to a second of delay. Every lamp in a group must be built with the same value.
- While a lamp is on, its radio still only listens in short windows.

Small C3 boards with a power LED or a wasteful regulator draw more than the bare module, as with the dev boards.

## Behavior details

- Brightness steps are perceptual (gamma-corrected), and limits squeeze the steps the same way as on the Lamp Controller.
- Warm/cool mixes the two whites at constant total power, so brightness doesn't jump between steps.
- On pixels, the lowest brightness is smoothed by spreading the leftover fraction across neighbouring pixels.
- USB plugged in: LED power capped (default 50%, Maker page).
- Battery 10% or less: drops to the lowest step and blinks twice. Below 3.3 V under load for 5 s: saves and turns off with 3 blinks. Below 3.4 V it won't turn on.
- Brownout resets don't open Wi-Fi.
- The clock for the sunrise alarm comes from the phone and is lost when the power switch is turned off.

## Check on the bench first

These could only be reasoned about, not run:

1. **Napping radio.** Turn the group on from one lamp after the other has been off for a minute. If commands get missed, raise `LISTEN_MS` (try 25).
2. **Nap current** with a meter in the battery lead: lamp off and paired, then off and unpaired.
3. **Buttons waking the lamp** from a nap on the first press, and the tap counts feeling right (`tapGapMs` on the Maker page).
4. **App and radio together:** with the app open on one lamp, switch another lamp from the Lamps tab.
5. **Warm/cool order and the dim end** on your actual pixels.
6. **Range** between rooms.

## Known limits

- Radio commands are not encrypted. A lamp only obeys lamps in its own group, but someone determined, nearby, with their own ESP32 could imitate one.
- All lamps use Wi-Fi channel 6 (`RADIO_CHANNEL`), for both the radio and the app network.
- Removing a lamp that is out of reach: the others forget it, but it still thinks it is paired until its group button is held for 10 s.

## Files

| File | What it does |
|---|---|
| `SimpleLamp.ino` | Setup, main loop, button actions, timers, battery protection, naps |
| `config.h` | Pins and fixed limits |
| `lamp.h` | Shared types and declarations |
| `settings.cpp` | Defaults, flash storage, JSON |
| `buttons.cpp` | Debounce, tap series, holds |
| `leds.cpp` | Brightness, warm/cool mix, fades, signals, current limit, output |
| `power.cpp` | Battery, USB/charging, LED power switch, naps |
| `net.cpp` | Lamp-to-lamp radio: pairing, group commands, status |
| `combos.h` | The order the group button steps through combinations |
| `web.cpp` | Wi-Fi network, captive portal, API, updates |
| `web_ui.h` | The app page, compressed (generated) |
| `ui/index.html` | The app page source. After editing, run `python3 ui/build_ui.py` |

`../platformio.ini` and `../test/test_combos.cpp` are only for building and testing from the command line; the Arduino IDE ignores them.

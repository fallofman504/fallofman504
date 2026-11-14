// =====================================================================
//  config.h  -  pins and fixed constants
//
//  Per-lamp values (light type, LED count, current limit...) are NOT set
//  here. Set them on the Maker page of the Wi-Fi app; they are stored in
//  flash and survive firmware updates. The defaults below are only used
//  the very first time a board boots (or after factory reset).
// =====================================================================
#pragma once

#define FIRMWARE_VERSION   "0.2.0"

// 1 = never nap. USB serial drops out whenever the chip naps, so set this
// while reading the Serial Monitor on the bench. Leave at 0 for finished
// lamps: without naps a paired lamp drains its battery in about a day.
#define DEBUG_STAY_AWAKE   0

// ---- Pins ---------------------------------------------------------------
// ESP32-C3 (Tools > Board > ESP32C3 Dev Module). Pins 2, 8 and 9 are left
// alone: the chip reads them at power-up to decide how to start.
#if defined(CONFIG_IDF_TARGET_ESP32C3)
  #define BOARD_NAME     "ESP32-C3"
  // These match the 3D-printed carrier board in ../carrier.
  #define PIN_BATT_ADC    0   // battery via 220k/220k divider
  #define PIN_USB_SENSE   1   // TP4056 IN+ via 10k/20k divider (HIGH = USB in)
  #define PIN_BTN_LAMP    3   // push button to GND: this lamp
  #define PIN_BTN_GROUP   4   // push button to GND: paired lamps
  #define PIN_LED_EN      5   // HIGH = LED power on (2N7000 -> P-channel MOSFET)
  #define PIN_LED_DATA    6   // pixels: to 74AHCT125 input -> 330R -> DIN
  #define PIN_PWM_A       7   // plain strip: white, or warm white (MOSFET gate)
  #define PIN_PWM_B      20   // plain strip: cool white (MOSFET gate)
  // TP4056 CHRG (LOW = charging). Not on the carrier board: the module doesn't
  // bring it out. To use it, solder a wire from the module's charge-LED pad to
  // a free pin (GPIO10 is free) and put that pin number here. -1 = not wired:
  // the lamp then shows "charging" whenever USB power is present.
  #define PIN_CHRG       -1
#else
  #error "Unsupported board. Choose Tools > Board > ESP32C3 Dev Module."
#endif

// ---- First-boot defaults for the Maker page ---------------------------
#define DEFAULT_LED_COUNT     16
#define DEFAULT_LIGHT_TYPE    1      // see LightType in lamp.h
#define DEFAULT_MAX_CURRENT   1200   // mA at 5 V, whole lamp
#define DEFAULT_MAKER_PASS    "lampmaker"
#define DEFAULT_MODEL         "Simple Lamp"

// ---- Limits -------------------------------------------------------------
#define MAX_LEDS          300
#define MAX_LEVELS        6
#define MAX_TEMPS         6
#define MAX_FAVORITES     8
#define MAX_GROUP         8      // lamps in a group, including this one

// ---- Button timing ------------------------------------------------------
#define BTN_DEBOUNCE_MS   25
#define HOLD_MS           1000   // lamp button held this long = a hold, not a tap
#define PAIR_HOLD_MS      3000   // group button: pairing mode
#define LEAVE_HOLD_MS     10000  // group button: leave the group
#define PAIR_WINDOW_MS    30000  // how long pairing mode lasts
#define GROUP_RESTART_MS  5000   // pause after which the group button starts over at "all on"

// ---- Light behavior -----------------------------------------------------
#define FADE_MS           300    // crossfade between brightness / warm-cool steps
#define POWER_FADE_MS     500
#define DEFAULT_CHARGE_LIMIT 50  // % of full LED power allowed while USB power is sensed (Maker page; 100 = no limit)
#define MA_PER_CHANNEL    12.0f  // approx current per pixel channel at full
#define MA_IDLE_PER_LED   1.0f

// ---- Battery ------------------------------------------------------------
#define BATT_MIN_TO_TURN_ON   3.40f  // volts (resting), below this: blink, stay off
#define BATT_CUTOFF_V         3.30f  // volts under load, shut down after 5 s
#define BATT_LOW_PCT          10     // drop to lowest step + warn

// ---- Radio between lamps (ESP-NOW) --------------------------------------
// A paired lamp that is off still has to hear the others. It naps with the
// radio off for NAP_MS, listens for LISTEN_MS, and repeats. A lamp sending a
// command repeats it for BURST_MS so every napping lamp catches one copy.
// Longer NAP_MS = longer standby, slower first response. Every lamp in a
// group must be built with the same values.
#define RADIO_CHANNEL     6      // also the channel of the Wi-Fi app network
#define NAP_MS            300
#define LISTEN_MS         15
#define BURST_MS          (NAP_MS + 150)
#define BURST_GAP_MS      4
#define STAY_AWAKE_MS     3000   // after a group command: stay listening for the next taps

// ---- Wi-Fi --------------------------------------------------------------
#define WIFI_TX_POWER           WIFI_POWER_17dBm
#define WIFI_CONNECT_WINDOW_S   120    // time to join before Wi-Fi turns off
#define WIFI_IDLE_TIMEOUT_S     900    // 15 min with no activity in the app
#define WIFI_DISCONNECT_GRACE_S 30     // phones drop briefly; wait before closing
#define AUTO_OFF_FADE_S         30

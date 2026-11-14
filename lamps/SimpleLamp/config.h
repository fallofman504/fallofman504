// =====================================================================
//  config.h  -  pins and fixed constants
//
//  Per-lamp values (light type, number of LEDs, brightness limit) are NOT
//  set here. Set them on the Maker page of the Wi-Fi panel; they are stored
//  in flash and survive firmware updates. The defaults below are only used
//  the first time a board boots.
// =====================================================================
#pragma once

#define FIRMWARE_VERSION "0.1.0"

// 1 = print an event log on the Serial Monitor and never sleep (USB serial
// drops out when the chip sleeps). Leave at 0 for finished lamps.
#define LAMP_DEBUG 0

// ---- Pins (ESP32-C3; avoids the boot-mode pins 2, 8 and 9) ----------------
#define PIN_BTN_LAMP    3    // push button to GND: this lamp
#define PIN_BTN_GROUP   4    // push button to GND: paired lamps
#define PIN_LED_DATA   10    // pixels: to level shifter -> 330R -> DIN
#define PIN_PWM_A       5    // plain strip: white, or warm white (MOSFET gate)
#define PIN_PWM_B       6    // plain strip: cool white (MOSFET gate)
#define PIN_LED_EN      7    // HIGH = LED power on (high-side switch). -1 = not fitted
#define PIN_BATT_ADC    0    // battery via 220k/220k divider. -1 = not fitted

// ---- First-boot defaults for the Maker page -------------------------------
#define DEFAULT_LIGHT_TYPE   1     // see LightType in settings.h
#define DEFAULT_LED_COUNT    16
#define DEFAULT_MAX_PCT      100   // brightness limit, % of full LED power
#define MAKER_PASS           "lampmaker"   // change this before selling lamps
#define MAX_LEDS             300

// ---- Battery --------------------------------------------------------------
#define BATT_CUTOFF_MV       3300  // under load: lamp turns off and stays off
#define BATT_MIN_TO_TURN_ON  3400  // must recover to this before it lights again

// ---- Radio ----------------------------------------------------------------
#define RADIO_CHANNEL 1            // every lamp must use the same channel
// A lamp listens for LISTEN_MS, then turns its radio off for SLEEP_MS.
// Longer SLEEP_MS = longer battery life, slower response to other lamps.
#define SLEEP_MS      300
#define LISTEN_MS     15
#define BURST_MS      (SLEEP_MS + 150)   // commands repeat this long so napping lamps hear one
#define BURST_GAP_MS  4
#define MAX_GROUP     8            // lamps per group, including this one

// ---- Buttons --------------------------------------------------------------
#define HOLD_MS          450       // longer than this is a hold, not a tap
#define DOUBLE_TAP_MS    350
#define RAMP_MS          2500      // hold: time to dim across the full range
#define PAIR_HOLD_MS     3000
#define LEAVE_HOLD_MS    10000
#define PANEL_HOLD_MS    2000      // both buttons
#define PAIR_WINDOW_MS   30000
#define GROUP_RESTART_MS 5000      // pause after which the group button starts over

// ---- Wi-Fi panel ----------------------------------------------------------
#define PANEL_IDLE_S     300       // panel turns itself off after 5 quiet minutes
#define FADE_MS          300

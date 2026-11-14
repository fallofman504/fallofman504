// =====================================================================
//  lamp.h  -  shared types, settings and function declarations
//  Simple white lamp controller for ESP32-C3: white or warm/cool light,
//  two buttons, lamps paired over ESP-NOW
// =====================================================================
#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include "config.h"

// Time since `since`, never negative. Timestamps can be taken a few ms after
// `now` was read (inside a web request, for example); plain `now - since`
// would then wrap around to ~49 days and fire every timer at once.
static inline uint32_t elapsedMs(uint32_t since, uint32_t now) {
  int32_t d = (int32_t)(now - since);
  return d > 0 ? (uint32_t)d : 0;
}

// Event log on the Serial Monitor (115200), with seconds since boot.
// Note: the lamp naps while it is off, and USB serial drops out during naps.
#define LOG(fmt, ...) do { Serial.printf("[%7.1fs] " fmt "\n", millis() / 1000.0f, ##__VA_ARGS__); } while (0)

// ---------------------------------------------------------------------
//  Light types (Maker page)
// ---------------------------------------------------------------------
enum LightType : uint8_t {
  LT_PIXEL_RGBW_WHITE = 0,  // SK6812 RGBW pixels, only the white chip is used
  LT_PIXEL_COOL_WARM,       // warm/cool pixels (SK6812 WWA): cool, warm, amber
  LT_PIXEL_WARM_COOL,       // same, for pixels wired warm first
  LT_PIXEL_WHITE3,          // white-only pixels, three white channels
  LT_STRIP_WHITE,           // plain white strip, one MOSFET
  LT_STRIP_WARM_COOL,       // plain warm + cool strip, two MOSFETs
  LT_COUNT
};

struct Favorite {
  char name[16];
  uint8_t level, temp;
  bool used;
};

// ---------------------------------------------------------------------
//  Settings (persisted in flash / NVS)
// ---------------------------------------------------------------------
struct UserSettings {
  uint8_t levelCount;
  uint8_t levels[MAX_LEVELS];      // perceived brightness %, e.g. 25/50/75/100
  uint8_t tempCount;
  uint8_t temps[MAX_TEMPS];        // warm/cool steps: 0 = warmest, 100 = coolest
  uint8_t maxBrightness;           // % cap on everything
  uint16_t autoOffMin;             // 0 = never
  uint8_t sleepFadeMin;            // sleep-timer length used by holding the lamp button
  bool alarmOn;                    // sunrise wake-up
  uint8_t alarmHour, alarmMin;
  uint8_t sunriseMin;              // fade-up length
  int8_t powerOnFav;               // -1 = last state, else favorite index
  Favorite fav[MAX_FAVORITES];
  char lampName[24];
  char wifiPass[33];
};

struct MakerSettings {
  uint16_t ledCount;               // pixels only
  uint8_t lightType;               // LightType
  uint16_t maxCurrentmA;           // pixels: current limit. Plain strips: what the strip draws at full
  uint8_t chargeLimitPct;          // % of full LED power allowed while USB power is sensed (100 = no limit)
  uint16_t tapGapMs;               // quiet time that ends a tap series
  float battCal;                   // ADC calibration multiplier
  float battRintOhm;               // battery + wiring resistance (sag compensation)
  uint16_t battmAh;                // pack capacity, for runtime estimates
  char makerPass[33];
  char model[24];
};

struct LampState {                 // what the buttons change
  uint8_t level;
  uint8_t temp;
};

extern UserSettings user;          // live (may hold unsaved preview changes)
extern UserSettings userSaved;     // last saved copy
extern MakerSettings maker;
extern LampState st;

// settings.cpp
void settingsDefaults(UserSettings &u);
void makerDefaults(MakerSettings &m);
void settingsLoad();
void settingsSaveUser();
void settingsSaveMaker();
void stateSave();
void settingsFactoryReset();
void userToJson(const UserSettings &u, JsonObject o);
void userFromJson(UserSettings &u, JsonObjectConst o);
void makerToJson(const MakerSettings &m, JsonObject o, bool includeSecrets);
void makerFromJson(MakerSettings &m, JsonObjectConst o);
void clampState();
String defaultWifiPassword();
bool lightHasTemp();               // this lamp can change warm/cool

// ---------------------------------------------------------------------
//  Buttons (buttons.cpp)
// ---------------------------------------------------------------------
enum ButtonEventType : uint8_t {
  B_NONE,
  B_TAP,          // a tap was released; `taps` = how many so far in this series
  B_SERIES_END,   // no more taps came; `taps` = final count
  B_HOLD,         // held past a threshold; `heldMs` = which one (fires once per threshold)
};
struct ButtonEvent { ButtonEventType type; uint8_t taps; uint32_t heldMs; };

namespace Buttons {
  void begin();
  ButtonEvent updateLamp(uint32_t now);
  ButtonEvent updateGroup(uint32_t now);
  bool busy();                     // a button is down or a tap series is still open
  void armWake();                  // either button wakes the lamp from a nap
}

// ---------------------------------------------------------------------
//  LEDs (leds.cpp)
// ---------------------------------------------------------------------
enum OverlayKind : uint8_t {
  OV_NONE, OV_BATTERY, OV_BLINK, OV_WIFI_ON, OV_WIFI_WAIT,
  OV_CHARGE, OV_IDENTIFY, OV_UPDATE, OV_PAIRING
};

namespace Leds {
  void begin();
  void render(uint32_t now);
  void overlay(OverlayKind k, uint32_t durMs, uint8_t param = 0);
  OverlayKind overlayActive();
  void clearOverlay();
  void startCrossfade(uint32_t ms = FADE_MS);
  bool settled();                 // nothing is fading: the output is steady
  float currentmA();
  float wantedmA();               // what the light would draw without the current limit
  bool currentLimited();          // the current limit is holding the brightness back
  float brightnessLimit();        // 0..1 on the brightness-step scale: brightness-limit setting and charging limit
  float limitLevel(float level);  // a brightness step (0..1) as it is shown under that limit
  void allOff();
  extern float autoOffFade, sleepFade, powerFade, sunriseFade;
  extern bool lowBattery;         // battery low: hold brightness at the lowest step
}

// ---------------------------------------------------------------------
//  Power (power.cpp)
// ---------------------------------------------------------------------
namespace Power {
  void begin();
  void update(uint32_t now);
  float voltage();           // load-compensated, filtered
  float rawVoltage();        // as measured under load
  uint8_t percent();
  bool usbPresent();
  bool batteryPresent();
  bool externalPower();      // USB sensed, or no battery wired (bench)
  bool charging();
  bool chargeFull();
  void ledPower(bool on);
  bool ledPowered();
  float estimateRuntimeHours();
  void nap(uint32_t ms);     // light sleep; 0 = until a button or USB change
}

// ---------------------------------------------------------------------
//  Lamp-to-lamp radio (net.cpp)
// ---------------------------------------------------------------------
namespace Net {
  // Another lamp in this lamp's group, with the last state it reported.
  struct Peer {
    uint8_t mac[6];
    bool known;                    // has reported at least once since this lamp started
    bool on, hasTemp;
    uint8_t level, levelCount, levelPct;
    uint8_t temp, tempCount;
    uint8_t battPct;               // 255 = on USB / no battery
    char name[24];
    uint32_t seen;                 // millis() of the last report
  };
  enum : uint8_t { SET_ON = 1, SET_LEVEL = 2, SET_TEMP = 4, SET_NAME = 8 };

  void begin();
  void update(uint32_t now);
  void restart();                  // set ESP-NOW up again after a Wi-Fi mode change
  void radio(bool on);
  bool radioIsOn();
  bool busy();                     // something is waiting to be sent
  bool wantsAwake();               // heard from the group a moment ago; keep listening
  void keepAwake(uint32_t ms);
  const uint8_t *selfMac();
  uint8_t peerCount();
  const Peer &peer(uint8_t i);
  void startPairing();
  void stopPairing();
  bool pairing();
  void leaveGroup();               // forget everyone, and tell them to forget this lamp
  void kick(const uint8_t *mac);   // remove another lamp from the group
  void groupTap();                 // the group button
  void groupAll(bool on);
  void sendSet(const uint8_t *mac, uint8_t fields, bool on, uint8_t level, uint8_t temp, const char *name);
  void query();                    // ask every lamp to report
  void statusChanged();            // this lamp's state changed: tell the group
}

// ---------------------------------------------------------------------
//  Wi-Fi / web app (web.cpp)
// ---------------------------------------------------------------------
namespace Web {
  void start(bool silent);
  void stop(const char *reason);
  bool active();
  void update(uint32_t now);
  bool hasClient();
  uint32_t secondsLeft();
  const char *networkName();
}

// ---------------------------------------------------------------------
//  Lamp control (SimpleLamp.ino)
// ---------------------------------------------------------------------
extern bool lampOn;
extern bool timeValid;
void lampTurnOn(bool fromAlarm = false);
void lampTurnOff(bool save = true);
void noteActivity();
void noteLightChanged();           // prints, a moment later, what brightness is really being shown and why
void startSleepTimer(uint8_t minutes);
void cancelTimers();
uint32_t sleepTimerSecondsLeft();
uint32_t autoOffSecondsLeft();
void setClock(uint32_t epoch, int16_t tzOffsetMin);
void requestRebootToWifi();        // next start: lamp on + Wi-Fi open (after maker changes / updates)
bool lampLocalTime(int &hour, int &minute);

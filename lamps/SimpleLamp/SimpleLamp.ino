// =====================================================================
//  SimpleLamp.ino
//  Simple networked lamp - ESP32-C3, white or warm/cool light, two buttons.
//
//  One firmware for every lamp. Per-lamp values (light type, number of
//  LEDs, brightness limit) are set on the Maker page of the Wi-Fi panel.
//
//  Lamp button    tap  = on/off           hold = dim down/up
//                 double tap = next warm/cool setting (warm/cool lamps)
//  Group button   tap  = all paired lamps on; keep tapping to step through
//                        every combination; ends with all off
//                 hold 3 s  = pairing mode (lamp pulses)
//                 hold 10 s = leave the group (3 blinks)
//  Both buttons   hold 2 s  = Wi-Fi panel on (2 blinks) / off (1 blink)
// =====================================================================
#include <Arduino.h>
#include <Preferences.h>
#include <driver/gpio.h>
#include <esp_sleep.h>

#include "config.h"
#include "light.h"
#include "settings.h"
#include "net.h"
#include "web.h"

struct Button {
  uint8_t pin;
  explicit Button(uint8_t p) : pin(p) {}
  bool raw = false, down = false, swallowed = false;
  bool tapped = false;  // true for one loop after a short press is released
  uint32_t changedAt = 0, downAt = 0;

  void begin() {
    pinMode(pin, INPUT_PULLUP);
    gpio_sleep_sel_dis((gpio_num_t)pin);  // keep the pull-up during light sleep
  }
  void poll() {
    tapped = false;
    uint32_t now = millis();
    bool r = digitalRead(pin) == LOW;
    if (r != raw) { raw = r; changedAt = now; }
    if (raw != down && now - changedAt >= 25) {
      down = raw;
      if (down) { downAt = now; swallowed = false; }
      else if (!swallowed && now - downAt < HOLD_MS) tapped = true;
    }
  }
  uint32_t heldMs() const { return down && !swallowed ? millis() - downAt : 0; }
  bool busy() const { return raw || down; }
};

static Button btnLamp{PIN_BTN_LAMP};
static Button btnGroup{PIN_BTN_GROUP};
static Preferences settings;

static uint32_t lastLampTap = 0;
static bool ramping = false;
static int8_t rampDir = -1;
static float rampValue = 0;
static uint32_t rampAt = 0;

static uint8_t groupHoldStage = 0;
static bool combo = false, comboFired = false;
static uint32_t comboAt_ = 0;

static uint32_t settingsDirtyAt = 0;
static uint32_t nextListen = 0;
static uint32_t nextBattery = 0;
static uint8_t lowReadings = 0;
static bool batteryFlat = false;

static void saveSettings() {
  settingsDirtyAt = 0;
  if (settings.getUChar("bri", 0) != light::brightness()) settings.putUChar("bri", light::brightness());
  if (settings.getUChar("cct", 0) != light::cct()) settings.putUChar("cct", light::cct());
}

static void lampButton() {
  uint32_t now = millis();

  if (btnLamp.tapped) {
    bool doubleTap = light::hasCct() && now - lastLampTap < DOUBLE_TAP_MS;
    lastLampTap = now;
    if (doubleTap) {
      // The first tap already toggled; undo that and change colour instead.
      uint8_t c = light::cct();
      light::setCct(c < 64 ? 128 : c < 192 ? 255 : 0);
      light::setOn(true);
      lastLampTap = 0;
    } else {
      light::setOn(!light::isOn());
    }
  }

  if (btnLamp.heldMs() >= HOLD_MS) {
    if (!ramping) {
      ramping = true;
      rampAt = now;
      if (!light::isOn()) {            // holding from off: start dim and rise
        light::setBrightness(1);
        light::setOn(true);
        rampDir = 1;
      } else if (light::brightness() >= 255) rampDir = -1;
      else if (light::brightness() <= 1) rampDir = 1;
      else rampDir = -rampDir;          // otherwise alternate direction each hold
      rampValue = light::brightness();
    }
    rampValue += rampDir * (float)(now - rampAt) * 255.0f / RAMP_MS;
    rampAt = now;
    rampValue = constrain(rampValue, 1.0f, 255.0f);
    light::setBrightness((uint8_t)rampValue);
  } else {
    ramping = false;
  }
}

static void groupButton() {
  if (btnGroup.tapped) {
    if (net::pairing()) net::stopPairing();
    else net::groupTap();
  }
  uint32_t held = btnGroup.heldMs();
  if (held >= PAIR_HOLD_MS && groupHoldStage == 0) {
    groupHoldStage = 1;
    net::startPairing();
  }
  if (held >= LEAVE_HOLD_MS && groupHoldStage == 1) {
    groupHoldStage = 2;
    net::stopPairing();
    net::leaveGroup();
    light::blink(3);
  }
  if (!btnGroup.down) groupHoldStage = 0;
}

static void bothButtons() {
  if (btnLamp.down && btnGroup.down) {
    if (!combo) {
      combo = true;
      comboFired = false;
      comboAt_ = millis();
      btnLamp.swallowed = btnGroup.swallowed = true;  // no tap/hold actions from this press
    }
    if (!comboFired && millis() - comboAt_ >= PANEL_HOLD_MS) {
      comboFired = true;
      if (web::active()) { web::stop(); light::blink(1); }
      else { web::start(); light::blink(2); }
    }
  } else if (!btnLamp.down && !btnGroup.down) {
    combo = false;
  }
}

static void battery() {
#if PIN_BATT_ADC >= 0
  uint32_t now = millis();
  if ((int32_t)(now - nextBattery) < 0) return;
  nextBattery = now + 5000;
  uint32_t sum = 0;
  for (int i = 0; i < 8; i++) sum += analogReadMilliVolts(PIN_BATT_ADC);
  uint16_t mv = (uint16_t)(sum / 8 * 2);        // 220k/220k divider
  net::setBatteryMv(mv);
  if (mv < 2500) return;                        // no battery wired (bench power)
  if (!batteryFlat) {
    lowReadings = mv < BATT_CUTOFF_MV ? lowReadings + 1 : 0;
    if (lowReadings >= 2) {                     // flat: warn, then stay dark until recharged
      batteryFlat = true;
      LOG("Battery flat (%u mV), light locked off", mv);
      light::lockOff(true);
      light::blink(3);
    }
  } else if (mv >= BATT_MIN_TO_TURN_ON) {
    batteryFlat = false;
    lowReadings = 0;
    light::lockOff(false);
  }
#endif
}

// Nap with the radio off. Wakes on either button, or after ms (0 = buttons only).
static void nap(uint32_t ms) {
  net::radio(false);
  gpio_wakeup_enable((gpio_num_t)PIN_BTN_LAMP, GPIO_INTR_LOW_LEVEL);
  gpio_wakeup_enable((gpio_num_t)PIN_BTN_GROUP, GPIO_INTR_LOW_LEVEL);
  esp_sleep_enable_gpio_wakeup();
  if (ms) esp_sleep_enable_timer_wakeup((uint64_t)ms * 1000);
  else esp_sleep_disable_wakeup_source(ESP_SLEEP_WAKEUP_TIMER);
  esp_light_sleep_start();
}

// Decide whether the radio and CPU need to be awake right now.
static void powerManage() {
  uint32_t now = millis();
  bool paired = net::peerCount() > 0;

  if (net::busy() || net::pairing() || web::active() || net::wantsAwake() || now < 1500) {
    net::radio(true);
    return;
  }

  bool idle = light::dark() && !btnLamp.busy() && !btnGroup.busy();
#if LAMP_DEBUG          // keeps USB serial alive
  idle = false;
#endif

  if (idle) {
    if (settingsDirtyAt) saveSettings();
    nap(paired ? SLEEP_MS : 0);
    if (paired) {                 // open a short listening window
      net::radio(true);
      net::keepAwake(LISTEN_MS);
    }
    return;
  }

  // Lamp is lit (or a button is down): CPU stays up, radio still naps between windows.
  if (net::radioIsOn()) {
    net::radio(false);
    nextListen = now + SLEEP_MS;
  } else if (paired && (int32_t)(now - nextListen) >= 0) {
    net::radio(true);
    net::keepAwake(LISTEN_MS);
  }
}

void setup() {
#if LAMP_DEBUG
  Serial.begin(115200);
  delay(300);
#endif
  btnLamp.begin();
  btnGroup.begin();

  makerLoad();
  settings.begin("light", false);
  light::begin();
  light::setBrightness(settings.getUChar("bri", 160));
  light::setCct(settings.getUChar("cct", 0));
  light::changed();

  net::begin();
  LOG("SimpleLamp %s, light type %u, %u LEDs, %u paired lamps, Wi-Fi password %s",
      FIRMWARE_VERSION, maker.lightType, maker.ledCount, net::peerCount(),
      wifiPassword().c_str());

  // A new board has nothing set up yet: open the panel so the Maker page is reachable.
  if (!settings.getBool("setup", false)) {
    settings.putBool("setup", true);
    web::start();
    light::blink(2);
  }
}

void loop() {
  btnLamp.poll();
  btnGroup.poll();
  bothButtons();
  lampButton();
  groupButton();
  battery();

  if (light::changed()) {
    net::statusChanged();
    settingsDirtyAt = millis() | 1;
  }
  if (settingsDirtyAt && millis() - settingsDirtyAt > 5000) saveSettings();

  net::loop();
  web::loop();
  light::update();
  powerManage();
  delay(1);
}

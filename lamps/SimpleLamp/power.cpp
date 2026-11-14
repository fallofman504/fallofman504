// =====================================================================
//  power.cpp  -  battery measurement, USB/charge sensing, LED power
//                switch, and napping (light sleep) with wake sources
// =====================================================================
#include "lamp.h"
#include <driver/gpio.h>
#include "esp_sleep.h"

namespace {
  float vRaw = 0, vComp = 0;
  bool haveReading = false;
  uint32_t lastRead = 0;
  bool ledOn = false;
  bool usbState = false;
  uint32_t usbChangeAt = 0;      // when the USB-sense pin first read differently (0 = it agrees)

  // Resting LiPo voltage -> state of charge
  const float curveV[] = {3.30, 3.45, 3.68, 3.74, 3.77, 3.79, 3.82, 3.87, 3.92, 4.00, 4.10, 4.20};
  const uint8_t curveP[] = {0, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100};

  uint8_t voltsToPercent(float v) {
    if (v <= curveV[0]) return 0;
    for (int i = 1; i < 12; i++) {
      if (v < curveV[i]) {
        float t = (v - curveV[i - 1]) / (curveV[i] - curveV[i - 1]);
        return (uint8_t)(curveP[i - 1] + t * (curveP[i] - curveP[i - 1]));
      }
    }
    return 100;
  }

  float readVolts() {
    uint32_t mv = 0;
    for (int i = 0; i < 16; i++) mv += analogReadMilliVolts(PIN_BATT_ADC);
    return (mv / 16.0f) * 2.0f / 1000.0f * maker.battCal;    // 220k/220k divider
  }
}

namespace Power {

void begin() {
  pinMode(PIN_LED_EN, OUTPUT);
  digitalWrite(PIN_LED_EN, LOW);
  gpio_sleep_sel_dis((gpio_num_t)PIN_LED_EN);   // keep its level during naps
  pinMode(PIN_USB_SENSE, INPUT);          // external 10k/20k divider
  pinMode(PIN_CHRG, INPUT_PULLUP);        // open-drain, LOW = charging
  analogReadResolution(12);
  analogSetPinAttenuation(PIN_BATT_ADC, ADC_11db);
  usbState = digitalRead(PIN_USB_SENSE);
  update(millis());
}

void update(uint32_t now) {
  // USB debounce: the pin must read the new level for a solid 50 ms.
  bool u = digitalRead(PIN_USB_SENSE);
  if (u == usbState) usbChangeAt = 0;
  else if (!usbChangeAt) usbChangeAt = now | 1;
  else if (elapsedMs(usbChangeAt, now) >= 50) { usbState = u; usbChangeAt = 0; }

  if (haveReading && elapsedMs(lastRead, now) < 500) return;
  lastRead = now;
  float v = readVolts();
  // Add back the sag caused by LED current flowing through the battery's
  // internal resistance, so % doesn't jump when brightness changes.
  float battA = 0;
  if (v > 2.5f) battA = (Leds::currentmA() / 1000.0f) * 5.0f / (v * 0.85f);
  float vc = v + battA * maker.battRintOhm;
  if (!haveReading) { vRaw = v; vComp = vc; haveReading = true; }
  else { vRaw += (v - vRaw) * 0.3f; vComp += (vc - vComp) * 0.1f; }
}

float voltage() { return vComp; }
float rawVoltage() { return vRaw; }
uint8_t percent() { return voltsToPercent(vComp); }
bool usbPresent() { return usbState; }
// Below 2.5 V the board can't be running from the LiPo (its protection cuts
// off around 2.5-3.0 V), so it must be on USB/bench power with no battery
// circuit attached. Battery protection is skipped in that case.
bool batteryPresent() { return vRaw >= 2.5f; }
bool externalPower() { return usbState || !batteryPresent(); }
bool charging() { return usbState && digitalRead(PIN_CHRG) == LOW; }
bool chargeFull() { return usbState && digitalRead(PIN_CHRG) == HIGH; }

void ledPower(bool on) {
  if (on == ledOn) return;
  if (!on) Leds::allOff();                 // blank frame first
  digitalWrite(PIN_LED_EN, on ? HIGH : LOW);
  ledOn = on;
  if (on) delay(3);                        // let the supply settle
}
bool ledPowered() { return ledOn; }

float estimateRuntimeHours() {
  // energy left (Wh) / present draw
  float wh = maker.battmAh / 1000.0f * 3.7f * percent() / 100.0f;
  float w = Leds::currentmA() / 1000.0f * 5.0f / 0.85f + 0.12f;   // + MCU
  return w > 0.01f ? wh / w : 0;
}

// Light sleep: the chip pauses with everything kept in memory and carries on
// where it left off. Wakes on either button, on USB being plugged in or
// pulled out, and after `ms` (0 = no timer). The caller turns the radio off
// first.
void nap(uint32_t ms) {
  Buttons::armWake();
  gpio_wakeup_enable((gpio_num_t)PIN_USB_SENSE, usbState ? GPIO_INTR_LOW_LEVEL : GPIO_INTR_HIGH_LEVEL);
  esp_sleep_enable_gpio_wakeup();
  if (ms) esp_sleep_enable_timer_wakeup((uint64_t)ms * 1000ULL);
  else esp_sleep_disable_wakeup_source(ESP_SLEEP_WAKEUP_TIMER);
  esp_light_sleep_start();
}

}  // namespace Power

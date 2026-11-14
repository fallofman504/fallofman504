// =====================================================================
//  buttons.cpp  -  the two push buttons: debounce, tap series, holds
//
//  Lamp button: every tap is reported at once (so "on" feels instant),
//  with a running count; a hold is reported once at HOLD_MS.
//  Group button: taps the same way; holds at PAIR_HOLD_MS and LEAVE_HOLD_MS.
// =====================================================================
#include "lamp.h"
#include <driver/gpio.h>

namespace {
  struct Button {
    uint8_t pin;
    const uint32_t *holds;      // hold thresholds, ascending
    uint8_t holdCount;
    bool raw = false, down = false;
    uint32_t changedAt = 0, downAt = 0, upAt = 0;
    uint8_t taps = 0;           // taps so far in the open series
    uint8_t holdsFired = 0;

    Button(uint8_t p, const uint32_t *h, uint8_t hc) : pin(p), holds(h), holdCount(hc) {}

    ButtonEvent update(uint32_t now) {
      bool r = digitalRead(pin) == LOW;
      if (r != raw) { raw = r; changedAt = now; }
      if (raw != down && elapsedMs(changedAt, now) >= BTN_DEBOUNCE_MS) {
        down = raw;
        if (down) {
          downAt = now;
          holdsFired = 0;
        } else {
          upAt = now;
          if (holdsFired == 0) {          // released before the first hold point: a tap
            taps++;
            return {B_TAP, taps, 0};
          }
          taps = 0;                       // a hold ends any tap series
        }
      }
      if (down && holdsFired < holdCount && elapsedMs(downAt, now) >= holds[holdsFired]) {
        taps = 0;
        return {B_HOLD, 0, holds[holdsFired++]};
      }
      if (!down && taps && elapsedMs(upAt, now) >= maker.tapGapMs) {
        uint8_t t = taps;
        taps = 0;
        return {B_SERIES_END, t, 0};
      }
      return {B_NONE, 0, 0};
    }
    bool busy() const { return raw || down || taps; }
  };

  const uint32_t lampHolds[] = {HOLD_MS};
  const uint32_t groupHolds[] = {PAIR_HOLD_MS, LEAVE_HOLD_MS};
  Button lampBtn(PIN_BTN_LAMP, lampHolds, 1);
  Button groupBtn(PIN_BTN_GROUP, groupHolds, 2);
}

namespace Buttons {

void begin() {
  for (uint8_t pin : {PIN_BTN_LAMP, PIN_BTN_GROUP}) {
    pinMode(pin, INPUT_PULLUP);
    gpio_sleep_sel_dis((gpio_num_t)pin);   // keep the pull-up during naps
  }
}

ButtonEvent updateLamp(uint32_t now) { return lampBtn.update(now); }
ButtonEvent updateGroup(uint32_t now) { return groupBtn.update(now); }
bool busy() { return lampBtn.busy() || groupBtn.busy(); }

void armWake() {
  gpio_wakeup_enable((gpio_num_t)PIN_BTN_LAMP, GPIO_INTR_LOW_LEVEL);
  gpio_wakeup_enable((gpio_num_t)PIN_BTN_GROUP, GPIO_INTR_LOW_LEVEL);
}

}  // namespace Buttons

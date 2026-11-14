#include "light.h"
#include "config.h"
#include "settings.h"
#include <Adafruit_NeoPixel.h>
#include <driver/gpio.h>

// What each data byte of a pixel drives, in the order the bytes are sent.
enum : uint8_t { CH_NONE, CH_WHITE, CH_WARM, CH_COOL };
static const uint8_t kLayouts[][4] = {
  {CH_NONE, CH_NONE, CH_NONE, CH_WHITE},   // LT_PIXEL_RGBW_WHITE
  {CH_COOL, CH_WARM, CH_NONE, CH_NONE},    // LT_PIXEL_COOL_WARM
  {CH_WARM, CH_COOL, CH_NONE, CH_NONE},    // LT_PIXEL_WARM_COOL
  {CH_WHITE, CH_WHITE, CH_WHITE, CH_NONE}, // LT_PIXEL_WHITE3
};
static Adafruit_NeoPixel* strip = nullptr;
static const uint8_t* layout = nullptr;
static uint8_t pixelBytes = 3;
static bool isPixels() { return maker.lightType < LT_STRIP_WHITE; }

namespace light {

static const float kFadeMs = FADE_MS;   // full-range fade time
static const float kMinLevel = 0.06f;  // level at brightness 1 (still visibly lit)

static bool on_ = false, locked_ = false, changed_ = false;
static uint8_t bri_ = 160, cct_ = 0;

static float level_ = 0;        // what is being shown now, 0..1 before gamma
static float cctNow_ = 0;       // 0..255
static uint32_t lastUpdate_ = 0;

static bool breathing_ = false;
static uint8_t blinks_ = 0;
static uint32_t fxStart_ = 0;

static uint16_t shownWarm_ = 1, shownCool_ = 1;  // last written (1 forces first write)
static bool powered_ = false;

bool hasCct() {
  return maker.lightType == LT_PIXEL_COOL_WARM || maker.lightType == LT_PIXEL_WARM_COOL ||
         maker.lightType == LT_STRIP_WARM_COOL;
}

static void power(bool on) {
  if (PIN_LED_EN < 0 || on == powered_) { powered_ = on; return; }
  digitalWrite(PIN_LED_EN, on ? HIGH : LOW);
  if (on) delay(3);  // let the LED rail come up before sending data
  powered_ = on;
}

// warm/cool are 16-bit linear light levels.
static void writeOutput(uint16_t warm, uint16_t cool) {
  if (warm == shownWarm_ && cool == shownCool_) return;
  shownWarm_ = warm;
  shownCool_ = cool;
  bool lit = warm || cool;
  if (lit) power(true);

  uint32_t white = min((uint32_t)warm + cool, (uint32_t)65535);
  if (isPixels()) {
    for (uint16_t i = 0; i < maker.ledCount; i++) {
      // Pixels only have 8 bits, so the leftover fraction is spread across
      // neighbouring pixels to keep low brightness smooth.
      uint8_t threshold = (uint8_t)(i * 158 + 79);
      uint8_t out[4] = {0, 0, 0, 0};
      for (uint8_t c = 0; c < pixelBytes; c++) {
        uint16_t v = layout[c] == CH_WARM ? warm
                   : layout[c] == CH_COOL ? cool
                   : layout[c] == CH_WHITE ? (uint16_t)white : 0;
        uint16_t b = v >> 8;
        if ((v & 0xFF) > threshold && b < 255) b++;
        out[c] = (uint8_t)b;
      }
      if (pixelBytes == 4) strip->setPixelColor(i, out[0], out[1], out[2], out[3]);
      else                 strip->setPixelColor(i, out[0], out[1], out[2]);
    }
    strip->show();
  } else if (maker.lightType == LT_STRIP_WARM_COOL) {
    ledcWrite(PIN_PWM_A, warm >> 4);
    ledcWrite(PIN_PWM_B, cool >> 4);
  } else {
    ledcWrite(PIN_PWM_A, white >> 4);
  }

  if (!lit) power(false);
}

void begin() {
  if (PIN_LED_EN >= 0) {
    pinMode(PIN_LED_EN, OUTPUT);
    digitalWrite(PIN_LED_EN, LOW);
    gpio_sleep_sel_dis((gpio_num_t)PIN_LED_EN);  // hold its level in light sleep
  }
  if (isPixels()) {
    layout = kLayouts[maker.lightType];
    pixelBytes = maker.lightType == LT_PIXEL_RGBW_WHITE ? 4 : 3;
    // NEO_RGB(W) sends the bytes in exactly the order we hand them over.
    strip = new Adafruit_NeoPixel(maker.ledCount, PIN_LED_DATA,
                                  (pixelBytes == 4 ? NEO_RGBW : NEO_RGB) + NEO_KHZ800);
    strip->begin();
    gpio_sleep_sel_dis((gpio_num_t)PIN_LED_DATA);
  } else {
    ledcAttach(PIN_PWM_A, 8000, 12);
    if (maker.lightType == LT_STRIP_WARM_COOL) ledcAttach(PIN_PWM_B, 8000, 12);
  }
  cctNow_ = cct_;
  writeOutput(0, 0);
  lastUpdate_ = millis();
}

void setOn(bool on) {
  if (locked_) on = false;
  if (on != on_) { on_ = on; changed_ = true; }
}
bool isOn() { return on_; }

void setBrightness(uint8_t b) {
  if (b < 1) b = 1;
  if (b != bri_) { bri_ = b; changed_ = true; }
}
uint8_t brightness() { return bri_; }

void setCct(uint8_t c) {
  if (!hasCct()) c = 0;
  if (c != cct_) { cct_ = c; changed_ = true; }
}
uint8_t cct() { return cct_; }

void lockOff(bool locked) {
  locked_ = locked;
  if (locked) setOn(false);
}

bool changed() {
  bool c = changed_;
  changed_ = false;
  return c;
}

bool dark() { return !on_ && level_ <= 0 && !breathing_ && !blinks_ && !shownWarm_ && !shownCool_; }

void blink(uint8_t times) {
  blinks_ = times;
  fxStart_ = millis();
}

void breathe(bool enable) {
  breathing_ = enable;
  fxStart_ = millis();
}

void update() {
  uint32_t now = millis();
  uint32_t dt = now - lastUpdate_;
  if (dt < 4) return;
  lastUpdate_ = now;
  if (dt > 100) dt = 100;  // coming back from sleep

  float target = on_ ? kMinLevel + (1.0f - kMinLevel) * (bri_ / 255.0f) : 0.0f;
  float step = dt / kFadeMs;
  if (level_ < target) level_ = min(target, level_ + step);
  else if (level_ > target) level_ = max(target, level_ - step);

  float cstep = dt * 255.0f / kFadeMs;
  if (level_ <= 0) cctNow_ = cct_;  // no need to fade colour while dark
  else if (cctNow_ < cct_) cctNow_ = min((float)cct_, cctNow_ + cstep);
  else if (cctNow_ > cct_) cctNow_ = max((float)cct_, cctNow_ - cstep);

  float shown = level_;
  if (blinks_) {
    uint32_t phase = (now - fxStart_) / 140;
    if (phase >= (uint32_t)blinks_ * 2) blinks_ = 0;
    else shown = (phase & 1) ? 0.0f : 0.5f;
  } else if (breathing_) {
    float t = ((now - fxStart_) % 1600) / 1600.0f;
    shown = 0.12f + 0.25f * (0.5f - 0.5f * cosf(t * 2.0f * PI));
  }

  float linear = powf(shown, 2.2f) * (maker.maxPct / 100.0f);
  uint32_t total = (uint32_t)(linear * 65535.0f + 0.5f);
  if (shown > 0 && total < 64) total = 64;
  uint16_t cool = (uint16_t)(total * cctNow_ / 255.0f);
  writeOutput((uint16_t)(total - cool), cool);
}

}  // namespace light

// =====================================================================
//  leds.cpp  -  brightness, warm/cool mix, fades, overlays, gamma,
//               current limiting, output to pixels or MOSFETs
// =====================================================================
#include "lamp.h"
#include <Adafruit_NeoPixel.h>
#include <driver/gpio.h>

extern uint8_t updateProgress;   // web.cpp, 0..100 during firmware upload

namespace Leds {
  float autoOffFade = 1, sleepFade = 1, powerFade = 0, sunriseFade = 1;
  bool lowBattery = false;
}

namespace {
  // What each data byte of a pixel drives, in the order the bytes are sent.
  enum : uint8_t { CH_NONE, CH_WHITE, CH_WARM, CH_COOL };
  const uint8_t layouts[][4] = {
    {CH_NONE, CH_NONE, CH_NONE, CH_WHITE},    // LT_PIXEL_RGBW_WHITE
    {CH_COOL, CH_WARM, CH_NONE, CH_NONE},     // LT_PIXEL_COOL_WARM
    {CH_WARM, CH_COOL, CH_NONE, CH_NONE},     // LT_PIXEL_WARM_COOL
    {CH_WHITE, CH_WHITE, CH_WHITE, CH_NONE},  // LT_PIXEL_WHITE3
  };

  Adafruit_NeoPixel *strip = nullptr;
  const uint8_t *layout = nullptr;
  uint8_t pixelBytes = 3;
  uint16_t n = 0;
  bool pixels = true;

  uint32_t lastRender = 0;
  float shown = 0;             // brightness on the output now, 0..1 as it looks (before gamma)
  float shownTemp = 0;         // warm/cool on the output now, 0 = warm .. 1 = cool
  uint32_t fadeEnd = 0;        // a crossfade is running until this time (0 = none)
  float lastmA = 0, wantmA = 0;
  bool limitHit = false;
  uint16_t outWarm = 0, outCool = 0;   // last values written
  bool outValid = false;

  OverlayKind ovKind = OV_NONE;
  uint32_t ovStart = 0, ovDur = 0;
  uint8_t ovParam = 0;

  inline float clamp01(float x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
  inline float toPwm(float x) { return powf(clamp01(x), 2.2f); }

  // ---- overlays: the lamp's way of saying something without colors --------
  // Returns the brightness to show (0..1 as it looks), or -1 for "no overlay".
  float overlayLevel(uint32_t now) {
    if (ovKind == OV_NONE) return -1;
    uint32_t el = elapsedMs(ovStart, now);
    if (ovDur && el > ovDur) { ovKind = OV_NONE; Leds::startCrossfade(200); return -1; }
    float env = 1;
    if (ovDur) env = clamp01(min(el, ovDur - el) / 200.0f);   // soft in/out

    switch (ovKind) {
      case OV_BATTERY: {
        // 1 blink = 0-30%, 2 = 31-60%, 3 = 61-100%. Pulses while charging, steady when full.
        if (Power::chargeFull()) return 0.45f * env;
        if (Power::charging()) return 0.45f * env * (0.35f + 0.65f * (0.5f + 0.5f * sinf(el * 0.00628f)));
        uint8_t p = Power::percent();
        uint8_t blinks = p <= 30 ? 1 : (p <= 60 ? 2 : 3);
        return ((el % 700) < 400 && el < (uint32_t)blinks * 700) ? 0.45f : 0;
      }
      case OV_BLINK:
        return ((el % 500) < 250 && el < (uint32_t)ovParam * 500) ? 0.5f : 0;
      case OV_WIFI_ON:                                  // two soft pulses
        return 0.5f * sinf(fmodf(el, 800.0f) / 800.0f * PI) * env;
      case OV_WIFI_WAIT:                                // slow pulse, 2 s
        return 0.08f + 0.22f * (0.5f - 0.5f * cosf(el * 0.00314f));
      case OV_PAIRING:                                  // quick pulse, 0.8 s
        return 0.10f + 0.35f * (0.5f - 0.5f * cosf(el * 0.00785f));
      case OV_CHARGE:                                   // gentle pulse, 2.5 s; steady when full
        if (Power::chargeFull()) return 0.35f * env;
        return 0.35f * (0.5f - 0.5f * cosf(el * 0.00251f)) * env;
      case OV_IDENTIFY:
        return (el % 600) < 300 ? 0.6f : 0;
      case OV_UPDATE:                                   // gets brighter as the upload progresses
        return 0.08f + 0.4f * updateProgress / 100.0f;
      default:
        return -1;
    }
  }

  // ---- output ---------------------------------------------------------------
  // level: 0..1 as it looks. temp: 0 = warm .. 1 = cool.
  void output(float level, float temp) {
    float k = toPwm(level);                       // share of full LED power

    // estimate current, scale down if over the limit
    float mA;
    if (pixels) {
      // One "white" worth of light per pixel: a single channel at full, or the
      // warm and cool channels sharing it. White-only x3 pixels light all three.
      float channels = maker.lightType == LT_PIXEL_WHITE3 ? 3.0f : 1.0f;
      float idle = n * MA_IDLE_PER_LED;
      mA = n * channels * k * MA_PER_CHANNEL + idle;
      wantmA = mA;
      limitHit = mA > maker.maxCurrentmA;
      if (limitHit) {
        float s = (maker.maxCurrentmA - idle) / (mA - idle);
        k *= s < 0 ? 0 : s;                       // the limit is below what the pixels draw just idling
        mA = maker.maxCurrentmA;
      }
    } else {
      mA = maker.maxCurrentmA * k;                // plain strip: the Maker page holds its full-brightness draw
      wantmA = mA;
      limitHit = false;
    }
    lastmA = Power::ledPowered() ? mA : 0;

    uint32_t total = (uint32_t)(k * 65535.0f + 0.5f);
    if (level > 0.001f && total < 48) total = 48;   // never round a lit lamp down to nothing
    uint16_t cool = lightHasTemp() ? (uint16_t)(total * clamp01(temp)) : 0;
    uint16_t warm = (uint16_t)(total - cool);
    if (!Power::ledPowered()) { outValid = false; return; }   // first frame after power-on is always sent
    if (outValid && warm == outWarm && cool == outCool) return;
    outWarm = warm; outCool = cool; outValid = true;

    if (pixels) {
      for (uint16_t i = 0; i < n; i++) {
        // Pixels only have 8 bits per channel. The leftover fraction is spread
        // across neighbouring pixels so the lowest brightness stays smooth.
        uint8_t threshold = (uint8_t)(i * 158 + 79);
        uint8_t b[4] = {0, 0, 0, 0};
        for (uint8_t c = 0; c < pixelBytes; c++) {
          uint16_t v = layout[c] == CH_WARM ? warm : layout[c] == CH_COOL ? cool : layout[c] == CH_WHITE ? (uint16_t)total : 0;
          uint16_t x = v >> 8;
          if ((v & 0xFF) > threshold && x < 255) x++;
          b[c] = (uint8_t)x;
        }
        if (pixelBytes == 4) strip->setPixelColor(i, b[0], b[1], b[2], b[3]);
        else                 strip->setPixelColor(i, b[0], b[1], b[2]);
      }
      strip->show();
    } else if (maker.lightType == LT_STRIP_WARM_COOL) {
      ledcWrite(PIN_PWM_A, warm >> 4);
      ledcWrite(PIN_PWM_B, cool >> 4);
    } else {
      ledcWrite(PIN_PWM_A, total >> 4);
    }
  }
}  // namespace

namespace Leds {

void begin() {
  pixels = maker.lightType < LT_STRIP_WHITE;
  n = maker.ledCount;
  if (pixels) {
    layout = layouts[maker.lightType];
    pixelBytes = maker.lightType == LT_PIXEL_RGBW_WHITE ? 4 : 3;
    // NEO_RGB(W) sends the bytes in exactly the order they are handed over.
    strip = new Adafruit_NeoPixel(n, PIN_LED_DATA, (pixelBytes == 4 ? NEO_RGBW : NEO_RGB) + NEO_KHZ800);
    strip->begin();
    strip->setBrightness(255);   // we do our own brightness + gamma
    gpio_sleep_sel_dis((gpio_num_t)PIN_LED_DATA);
  } else {
    ledcAttach(PIN_PWM_A, 8000, 12);
    ledcWrite(PIN_PWM_A, 0);
    if (maker.lightType == LT_STRIP_WARM_COOL) { ledcAttach(PIN_PWM_B, 8000, 12); ledcWrite(PIN_PWM_B, 0); }
  }
}

void overlay(OverlayKind k, uint32_t durMs, uint8_t param) {
  startCrossfade(150);
  ovKind = k; ovStart = millis(); ovDur = durMs; ovParam = param;
}
OverlayKind overlayActive() { return ovKind; }
void clearOverlay() { if (ovKind != OV_NONE) { ovKind = OV_NONE; startCrossfade(200); } }

void startCrossfade(uint32_t ms) { fadeEnd = (millis() + ms) | 1; }
bool settled() { return fadeEnd == 0; }

float currentmA() { return lastmA; }
float wantedmA() { return wantmA; }
bool currentLimited() { return limitHit; }

// Highest brightness allowed right now, on the same 0..1 scale as the
// brightness steps: the brightness-limit setting, and the charging limit
// while USB power is sensed.
// The charging limit is a share of LED POWER. Steps are "how bright it looks",
// and power = looks ^ 2.2, so half power looks like about 73%.
float brightnessLimit() {
  float cap = user.maxBrightness / 100.0f;
  if (Power::usbPresent() && maker.chargeLimitPct < 100) {
    float c = powf(maker.chargeLimitPct / 100.0f, 1.0f / 2.2f);
    if (c < cap) cap = c;
  }
  return cap;
}

// How a brightness step is shown under the limit.
//  - The lowest step is left exactly as it is, so it never fades to nothing.
//  - The highest step lands on the limit.
//  - The steps in between are spread evenly, so every step stays different.
// (If even the lowest step is above the limit, everything is scaled down.)
float limitLevel(float level) {
  float limit = brightnessLimit();
  float lo = 1.0f, hi = 0.0f;
  for (uint8_t i = 0; i < user.levelCount; i++) {
    float v = user.levels[i] / 100.0f;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (hi <= limit) return level < limit ? level : limit;      // nothing reaches the limit
  if (limit <= lo || hi - lo < 0.001f) return level * limit / hi;
  if (level <= lo) return level;
  float out = lo + (level - lo) * (limit - lo) / (hi - lo);
  return out < limit ? out : limit;
}

void allOff() {
  shown = 0;
  output(0, shownTemp);
}

void render(uint32_t now) {
  uint32_t el = elapsedMs(lastRender, now);
  if (el < 16) return;                                          // ~60 fps
  lastRender = now;

  float temp = user.temps[st.temp < user.tempCount ? st.temp : 0] / 100.0f;
  float target = overlayLevel(now);
  if (target < 0) {
    if (!lampOn && powerFade <= 0) {
      target = 0;
    } else {
      // brightness chain, in perceived (0..1) space, then gamma in output().
      // A limit (brightness-limit setting, charging limit) squeezes the steps
      // into the allowed range: see limitLevel().
      float level = limitLevel(user.levels[st.level < user.levelCount ? st.level : 0] / 100.0f);
      if (lowBattery) {                      // battery low: no brighter than the lowest step
        float lo = 1.0f;
        for (uint8_t i = 0; i < user.levelCount; i++) lo = min(lo, user.levels[i] / 100.0f);
        lo = limitLevel(lo);
        if (level > lo) level = lo;
      }
      target = level * autoOffFade * sleepFade * powerFade * sunriseFade;
    }
  }

  // crossfade from what is showing now
  if (fadeEnd) {
    int32_t left = (int32_t)(fadeEnd - now);
    if (left <= 0) {
      fadeEnd = 0;
    } else {
      float t = min(1.0f, (float)el / (float)(left + el));
      target = shown + (target - shown) * t;
      if (shown > 0.001f) temp = shownTemp + (temp - shownTemp) * t;   // nothing lit: no point fading warm/cool
    }
  }
  shown = target;
  shownTemp = temp;
  output(shown, shownTemp);
}

}  // namespace Leds

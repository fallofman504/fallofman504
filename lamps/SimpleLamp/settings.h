// Per-lamp build details, set on the Maker page and kept in flash.
#pragma once
#include <Arduino.h>

enum LightType : uint8_t {
  LT_PIXEL_RGBW_WHITE = 0,  // SK6812 RGBW pixels, only the white chip is used
  LT_PIXEL_COOL_WARM,       // warm/cool pixels (SK6812 WWA): cool, warm, amber
  LT_PIXEL_WARM_COOL,       // same, for pixels wired warm first
  LT_PIXEL_WHITE3,          // white-only pixels (three white channels)
  LT_STRIP_WHITE,           // plain white strip, one MOSFET
  LT_STRIP_WARM_COOL,       // plain warm + cool strip, two MOSFETs
  LT_COUNT
};

struct MakerSettings {
  uint8_t lightType;
  uint16_t ledCount;   // pixels only
  uint8_t maxPct;      // brightness limit, % of full LED power
};

extern MakerSettings maker;

void makerLoad();
void makerSave();
String wifiPassword();   // unique per board, for the card under the base

#if LAMP_DEBUG
#define LOG(fmt, ...) Serial.printf("[%7.1fs] " fmt "\n", millis() / 1000.0f, ##__VA_ARGS__)
#else
#define LOG(...) do {} while (0)
#endif

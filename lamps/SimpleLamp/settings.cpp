#include "config.h"
#include "settings.h"
#include <Preferences.h>

MakerSettings maker;

void makerLoad() {
  Preferences p;
  p.begin("maker", true);
  maker.lightType = p.getUChar("type", DEFAULT_LIGHT_TYPE);
  maker.ledCount = p.getUShort("count", DEFAULT_LED_COUNT);
  maker.maxPct = p.getUChar("max", DEFAULT_MAX_PCT);
  p.end();
  if (maker.lightType >= LT_COUNT) maker.lightType = DEFAULT_LIGHT_TYPE;
  maker.ledCount = constrain(maker.ledCount, 1, MAX_LEDS);
  maker.maxPct = constrain(maker.maxPct, 5, 100);
}

void makerSave() {
  Preferences p;
  p.begin("maker", false);
  p.putUChar("type", maker.lightType);
  p.putUShort("count", maker.ledCount);
  p.putUChar("max", maker.maxPct);
  p.end();
}

String wifiPassword() {
  uint64_t mac = ESP.getEfuseMac();
  const char* alphabet = "abcdefghjkmnpqrstuvwxyz23456789";  // no look-alikes
  uint32_t h = 2166136261u;
  for (int i = 0; i < 6; i++) { h ^= (mac >> (8 * i)) & 0xFF; h *= 16777619u; }
  String s;
  for (int i = 0; i < 8; i++) {
    s += alphabet[h % 31];
    h = h / 31 + (uint32_t)(mac >> (i * 4)) * 2654435761u;
  }
  return s;
}

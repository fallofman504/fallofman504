// White light output: on/off, brightness, colour temperature, fades.
#pragma once
#include <Arduino.h>

namespace light {

void begin();
void update();                 // call every loop

void setOn(bool on);
bool isOn();
void setBrightness(uint8_t b); // 1..255
uint8_t brightness();
void setCct(uint8_t c);        // 0 = warmest, 255 = coolest
uint8_t cct();
bool hasCct();                 // false on single-white builds
void lockOff(bool locked);     // low battery: refuse to light

bool dark();                   // output fully off and nothing animating
bool changed();                // true once after any state change

void blink(uint8_t times);     // feedback flashes
void breathe(bool enable);     // slow pulse while pairing

}  // namespace light

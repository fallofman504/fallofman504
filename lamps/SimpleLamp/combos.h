// Order in which the group button steps through on/off combinations.
// Pure logic, no hardware -- also compiled by the host test.
#pragma once
#include <stdint.h>

// n lamps -> 2^n steps. Bit i of the result = lamp i is on.
//   step 0        : every lamp on
//   then          : each lamp alone, then every pair, every trio, ...
//   last step     : every lamp off
inline uint16_t comboAt(uint8_t n, uint16_t step) {
  const uint16_t full = (uint16_t)((1u << n) - 1);
  if (step == 0) return full;
  uint16_t k = step - 1;
  for (uint8_t bits = 1; bits < n; bits++)
    for (uint16_t m = 1; m < full; m++)
      if (__builtin_popcount(m) == bits && k-- == 0) return m;
  return 0;
}

inline uint16_t comboCount(uint8_t n) { return (uint16_t)(1u << n); }

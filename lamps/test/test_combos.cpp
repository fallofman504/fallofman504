// Host test:  g++ -std=c++17 -o combos_test test/test_combos.cpp && ./combos_test
#include "../SimpleLamp/combos.h"
#include <cassert>
#include <cstdio>
#include <set>

int main() {
  for (int n = 1; n <= 8; n++) {
    std::set<uint16_t> seen;
    int total = comboCount(n);
    int prevBits = 0;
    for (int s = 0; s < total; s++) {
      uint16_t m = comboAt(n, s);
      assert(m < (1u << n));
      assert(seen.insert(m).second);              // every combination exactly once
      if (s == 0) assert(m == (1u << n) - 1);     // starts with all on
      if (s == total - 1) assert(m == 0);         // ends with all off
      if (s > 0 && s < total - 1) {               // singles, then pairs, ...
        assert(__builtin_popcount(m) >= prevBits);
        prevBits = __builtin_popcount(m);
      }
    }
    assert((int)seen.size() == total);
  }
  assert(comboAt(3, 1) == 0b001 && comboAt(3, 2) == 0b010 && comboAt(3, 3) == 0b100);
  puts("combos ok");
}

// =====================================================================
//  settings.cpp  -  defaults, flash storage, JSON
// =====================================================================
#include "lamp.h"
#include <Preferences.h>

UserSettings user, userSaved;
MakerSettings maker;
LampState st;

static Preferences prefs;

String defaultWifiPassword() {
  // Unique per board, derived from the chip's MAC. Readable on the Maker
  // page and printed on the serial monitor so it can go on the base card.
  uint64_t mac = ESP.getEfuseMac();
  const char *alphabet = "abcdefghjkmnpqrstuvwxyz23456789";   // no look-alikes
  uint32_t h = 2166136261u;
  for (int i = 0; i < 6; i++) { h ^= (mac >> (8 * i)) & 0xFF; h *= 16777619u; }
  String s;
  for (int i = 0; i < 8; i++) { s += alphabet[h % 31]; h = h / 31 + (uint32_t)(mac >> (i * 4)) * 2654435761u; }
  return s;
}

bool lightHasTemp() {
  return maker.lightType == LT_PIXEL_COOL_WARM || maker.lightType == LT_PIXEL_WARM_COOL ||
         maker.lightType == LT_STRIP_WARM_COOL;
}

void settingsDefaults(UserSettings &u) {
  memset(&u, 0, sizeof(u));
  u.levelCount = 4;
  u.levels[0] = 25; u.levels[1] = 50; u.levels[2] = 75; u.levels[3] = 100;
  u.tempCount = 3;
  u.temps[0] = 0; u.temps[1] = 50; u.temps[2] = 100;
  u.maxBrightness = 100;
  u.autoOffMin = 120;
  u.sleepFadeMin = 30;
  u.alarmOn = false; u.alarmHour = 7; u.alarmMin = 0; u.sunriseMin = 20;
  u.powerOnFav = -1;
  strlcpy(u.lampName, "Lamp", sizeof(u.lampName));
  strlcpy(u.wifiPass, defaultWifiPassword().c_str(), sizeof(u.wifiPass));
}

void makerDefaults(MakerSettings &m) {
  memset(&m, 0, sizeof(m));
  m.ledCount = DEFAULT_LED_COUNT;
  m.lightType = DEFAULT_LIGHT_TYPE;
  m.maxCurrentmA = DEFAULT_MAX_CURRENT;
  m.chargeLimitPct = DEFAULT_CHARGE_LIMIT;
  m.tapGapMs = 350;
  m.battCal = 1.0f;
  m.battRintOhm = 0.15f;
  m.battmAh = 2000;
  strlcpy(m.makerPass, DEFAULT_MAKER_PASS, sizeof(m.makerPass));
  strlcpy(m.model, DEFAULT_MODEL, sizeof(m.model));
}

// ---------------------------------------------------------------------
//  JSON helpers
// ---------------------------------------------------------------------
template <typename T> static void getNum(JsonObjectConst o, const char *k, T &v, long lo, long hi) {
  if (!o[k].is<JsonVariantConst>() || o[k].isNull()) return;
  long x = o[k].as<long>();
  v = (T)constrain(x, lo, hi);
}
static void getStr(JsonObjectConst o, const char *k, char *dst, size_t n) {
  if (o[k].is<const char *>()) strlcpy(dst, o[k].as<const char *>(), n);
}
static void getList(JsonObjectConst o, const char *k, uint8_t *dst, uint8_t &count, uint8_t maxCount, int lo, int hi) {
  if (!o[k].is<JsonArrayConst>()) return;
  uint8_t n = 0;
  for (JsonVariantConst v : o[k].as<JsonArrayConst>()) {
    if (n >= maxCount) break;
    dst[n++] = constrain(v.as<int>(), lo, hi);
  }
  if (n > 0) count = n;
}

void userToJson(const UserSettings &u, JsonObject o) {
  JsonArray lv = o["levels"].to<JsonArray>();
  for (int i = 0; i < u.levelCount; i++) lv.add(u.levels[i]);
  JsonArray tp = o["temps"].to<JsonArray>();
  for (int i = 0; i < u.tempCount; i++) tp.add(u.temps[i]);
  o["maxBrightness"] = u.maxBrightness;
  o["autoOffMin"] = u.autoOffMin;
  o["sleepFadeMin"] = u.sleepFadeMin;
  o["alarmOn"] = u.alarmOn;
  o["alarmHour"] = u.alarmHour;
  o["alarmMin"] = u.alarmMin;
  o["sunriseMin"] = u.sunriseMin;
  o["powerOnFav"] = u.powerOnFav;
  JsonArray fv = o["favorites"].to<JsonArray>();
  for (int i = 0; i < MAX_FAVORITES; i++) {
    if (!u.fav[i].used) { fv.add(nullptr); continue; }
    JsonObject f = fv.add<JsonObject>();
    f["name"] = u.fav[i].name;
    f["level"] = u.fav[i].level;
    f["temp"] = u.fav[i].temp;
  }
  o["lampName"] = u.lampName;
  // wifiPass is never sent back out; it can only be changed
}

void userFromJson(UserSettings &u, JsonObjectConst o) {
  getList(o, "levels", u.levels, u.levelCount, MAX_LEVELS, 1, 100);
  getList(o, "temps", u.temps, u.tempCount, MAX_TEMPS, 0, 100);
  getNum(o, "maxBrightness", u.maxBrightness, 5, 100);
  getNum(o, "autoOffMin", u.autoOffMin, 0, 1440);
  getNum(o, "sleepFadeMin", u.sleepFadeMin, 1, 120);
  if (o["alarmOn"].is<bool>()) u.alarmOn = o["alarmOn"];
  getNum(o, "alarmHour", u.alarmHour, 0, 23);
  getNum(o, "alarmMin", u.alarmMin, 0, 59);
  getNum(o, "sunriseMin", u.sunriseMin, 1, 60);
  getNum(o, "powerOnFav", u.powerOnFav, -1, MAX_FAVORITES - 1);
  if (o["favorites"].is<JsonArrayConst>()) {
    int i = 0;
    for (JsonVariantConst v : o["favorites"].as<JsonArrayConst>()) {
      if (i >= MAX_FAVORITES) break;
      Favorite &f = u.fav[i++];
      memset(&f, 0, sizeof(f));
      if (v.isNull()) continue;
      JsonObjectConst fo = v;
      f.used = true;
      strlcpy(f.name, fo["name"] | "Favorite", sizeof(f.name));
      f.level = fo["level"] | 0;
      f.temp = fo["temp"] | 0;
    }
  }
  getStr(o, "lampName", u.lampName, sizeof(u.lampName));
  if (!u.lampName[0]) strlcpy(u.lampName, "Lamp", sizeof(u.lampName));
  if (o["wifiPass"].is<const char *>()) {
    const char *p = o["wifiPass"];
    if (strlen(p) >= 8 && strlen(p) <= 32) strlcpy(u.wifiPass, p, sizeof(u.wifiPass));
  }
}

void makerToJson(const MakerSettings &m, JsonObject o, bool includeSecrets) {
  o["ledCount"] = m.ledCount;
  o["lightType"] = m.lightType;
  o["maxCurrentmA"] = m.maxCurrentmA;
  o["chargeLimitPct"] = m.chargeLimitPct;
  o["tapGapMs"] = m.tapGapMs;
  o["battCal"] = m.battCal;
  o["battRintOhm"] = m.battRintOhm;
  o["battmAh"] = m.battmAh;
  o["model"] = m.model;
  if (includeSecrets) o["makerPass"] = m.makerPass;
}

void makerFromJson(MakerSettings &m, JsonObjectConst o) {
  getNum(o, "ledCount", m.ledCount, 1, MAX_LEDS);
  getNum(o, "lightType", m.lightType, 0, LT_COUNT - 1);
  getNum(o, "maxCurrentmA", m.maxCurrentmA, 100, 3000);
  getNum(o, "chargeLimitPct", m.chargeLimitPct, 20, 100);
  getNum(o, "tapGapMs", m.tapGapMs, 200, 700);
  if (o["battCal"].is<float>()) m.battCal = constrain(o["battCal"].as<float>(), 0.8f, 1.2f);
  if (o["battRintOhm"].is<float>()) m.battRintOhm = constrain(o["battRintOhm"].as<float>(), 0.0f, 1.0f);
  getNum(o, "battmAh", m.battmAh, 100, 20000);
  getStr(o, "model", m.model, sizeof(m.model));
  if (o["makerPass"].is<const char *>()) {
    const char *p = o["makerPass"];
    if (strlen(p) >= 4 && strlen(p) <= 32) strlcpy(m.makerPass, p, sizeof(m.makerPass));
  }
}

// ---------------------------------------------------------------------
//  Flash storage
// ---------------------------------------------------------------------
void clampState() {
  if (user.levelCount == 0 || user.tempCount == 0) settingsDefaults(user);
  if (st.level >= user.levelCount) st.level = user.levelCount - 1;
  if (st.temp >= user.tempCount) st.temp = 0;
}

void settingsLoad() {
  settingsDefaults(user);
  makerDefaults(maker);
  prefs.begin("lamp", true);
  String js = prefs.getString("user", "");
  String jm = prefs.getString("maker", "");
  // wifi password is stored separately so it is never in exports
  String wp = prefs.getString("wifipass", "");
  st.level = prefs.getUChar("s_level", 1);
  st.temp = prefs.getUChar("s_temp", 0);
  prefs.end();

  if (js.length()) {
    JsonDocument d;
    if (!deserializeJson(d, js)) userFromJson(user, d.as<JsonObjectConst>());
  }
  if (jm.length()) {
    JsonDocument d;
    if (!deserializeJson(d, jm)) makerFromJson(maker, d.as<JsonObjectConst>());
  }
  if (wp.length() >= 8) strlcpy(user.wifiPass, wp.c_str(), sizeof(user.wifiPass));
  clampState();
  userSaved = user;
}

void settingsSaveUser() {
  JsonDocument d;
  userToJson(user, d.to<JsonObject>());
  String s;
  serializeJson(d, s);
  prefs.begin("lamp", false);
  prefs.putString("user", s);
  prefs.putString("wifipass", user.wifiPass);
  prefs.end();
  userSaved = user;
  clampState();
}

void settingsSaveMaker() {
  JsonDocument d;
  makerToJson(maker, d.to<JsonObject>(), true);
  String s;
  serializeJson(d, s);
  prefs.begin("lamp", false);
  prefs.putString("maker", s);
  prefs.end();
}

void stateSave() {
  // Only writes when something actually changed (spares flash wear).
  prefs.begin("lamp", false);
  if (prefs.getUChar("s_level", 255) != st.level) prefs.putUChar("s_level", st.level);
  if (prefs.getUChar("s_temp", 255) != st.temp) prefs.putUChar("s_temp", st.temp);
  prefs.end();
}

void settingsFactoryReset() {
  // Resets everything the customer can change. Maker settings (LED count,
  // light type, current limit, calibration) and the paired lamps are kept.
  prefs.begin("lamp", false);
  prefs.remove("user");
  prefs.remove("wifipass");
  prefs.remove("s_level");
  prefs.remove("s_temp");
  prefs.end();
}

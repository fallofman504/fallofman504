// =====================================================================
//  SimpleLamp.ino
//  Simple white lamp controller - ESP32-C3, white or warm/cool light,
//  two push buttons, lamps paired with each other over ESP-NOW
//
//  One firmware for every lamp. Per-lamp values (light type, LED count,
//  current limit) are set on the Maker page of the Wi-Fi app.
//
//  Lamp button
//    1 tap  = on / off             2 taps = next brightness
//    3 taps = next warm/cool       4 taps = show battery (1-3 blinks)
//    5 taps = Wi-Fi app on/off     hold 1 s = sleep timer (lamp on)
//  Group button
//    tap       = all paired lamps on; keep tapping to step through every
//                combination of lamps; the last step is all off
//    hold 3 s  = pairing mode (quick pulse)
//    hold 10 s = leave the group (3 blinks)
//
//  Recovery: switch the hidden master switch off and on. Every fresh
//  power-up opens Wi-Fi for 2 minutes.
// =====================================================================
#include "lamp.h"
#include <Preferences.h>
#include <sys/time.h>
#include "esp_sleep.h"

bool lampOn = false;
bool timeValid = false;

// Small facts that must survive a restart by the firmware. RTC_NOINIT_ATTR
// is never wiped, so it carries a magic number to tell real contents from
// garbage.
struct RtcKeep {
  uint32_t magic;
  uint8_t timeValid;       // the phone has set the clock
  int16_t tzMin;           // phone's offset from UTC
  uint8_t rebootToWifi;    // deliberate restart from the app
  uint8_t brownouts;       // brownout resets in a row
};
#define RTC_KEEP_MAGIC 0x4C414D51u
RTC_NOINIT_ATTR static RtcKeep keep;

void requestRebootToWifi() { keep.rebootToWifi = 1; }

namespace {
  uint32_t lastLoop = 0;
  uint32_t lastActivity = 0;
  uint32_t bootMs = 0;
  uint32_t lastPassPrint = 0;
  uint32_t lampOnSince = 0;
  uint32_t lightLogAt = 0;      // when to print the brightness explanation (0 = nothing pending)
  uint32_t nextListen = 0;      // lamp on: when the radio opens its next listening window

  bool autoOffFading = false;   uint32_t autoOffStart = 0;
  uint32_t sleepTimerEnd = 0, sleepTimerDur = 0;
  bool sunriseActive = false;   uint32_t sunriseStart = 0, sunriseDur = 0;
  int lastAlarmYday = -1;

  bool lowWarned = false;
  uint32_t cutoffSince = 0;
  bool shutdownPending = false;
  bool lastUsb = false;

  // the tap series in progress on the lamp button
  bool seriesWasOn = false;     // lamp state when the series began
  LampState seriesSt;
  bool seriesSwallowed = false; // the first tap only cancelled a fade/timer

  // what the group was last told about this lamp
  bool toldOn = false;
  LampState toldSt = {255, 255};
}

// ---------------------------------------------------------------------
//  Clock (set from the phone when the app opens)
// ---------------------------------------------------------------------
void setClock(uint32_t epoch, int16_t tzOffsetMin) {
  struct timeval tv = {(time_t)epoch, 0};
  settimeofday(&tv, nullptr);
  keep.tzMin = tzOffsetMin;
  keep.timeValid = 1;
  timeValid = true;
}

bool lampLocalTime(int &hour, int &minute) {
  if (!timeValid) return false;
  time_t t = time(nullptr) + keep.tzMin * 60;
  struct tm tmv;
  gmtime_r(&t, &tmv);
  hour = tmv.tm_hour; minute = tmv.tm_min;
  return true;
}

static int localYday() {
  time_t t = time(nullptr) + keep.tzMin * 60;
  struct tm tmv; gmtime_r(&t, &tmv);
  return tmv.tm_yday;
}

static int32_t secondsUntilSunriseStart() {
  // seconds from now until (alarm time - sunrise length), always in the future
  time_t t = time(nullptr) + keep.tzMin * 60;
  struct tm tmv; gmtime_r(&t, &tmv);
  int32_t nowS = tmv.tm_hour * 3600 + tmv.tm_min * 60 + tmv.tm_sec;
  int32_t startS = user.alarmHour * 3600 + user.alarmMin * 60 - user.sunriseMin * 60;
  if (startS < 0) startS += 86400;
  int32_t d = startS - nowS;
  if (d <= 5) d += 86400;
  return d;
}

// ---------------------------------------------------------------------
//  Lamp on / off
// ---------------------------------------------------------------------
// Called whenever the light is changed. A moment later (once the fade has
// finished) the loop prints what is really being shown and what, if anything,
// is holding it back.
void noteLightChanged() { lightLogAt = millis() | 1; }

static void printLightReport() {
  if (!lampOn) return;
  uint8_t step = st.level < user.levelCount ? st.level : 0;
  float shown = Leds::limitLevel(user.levels[step] / 100.0f) * 100.0f;
  if (Leds::lowBattery) {
    uint8_t lo = 100;
    for (uint8_t i = 0; i < user.levelCount; i++) lo = min(lo, user.levels[i]);
    shown = min(shown, Leds::limitLevel(lo / 100.0f) * 100.0f);
  }
  char why[140] = "";
  if (Power::usbPresent() && maker.chargeLimitPct < 100)
    snprintf(why, sizeof(why), " (USB power sensed: LEDs limited to %u%% power while charging, set on the Maker page)", maker.chargeLimitPct);
  else if (user.maxBrightness < 100)
    snprintf(why, sizeof(why), " (brightness limit setting is %u%%)", user.maxBrightness);
  LOG("Light: step %u of %u = %u%%, shown at %.0f%%%s%s", step + 1, user.levelCount, user.levels[step], shown, why,
      Leds::lowBattery ? " (battery low: held at the lowest step)" : "");
  if (Leds::currentLimited())
    LOG("Light: held back by the current limit: this would draw %.0f mA, limit is %u mA (Maker page)",
        Leds::wantedmA(), maker.maxCurrentmA);
}

void noteActivity() {
  lastActivity = millis();
  if (autoOffFading) { autoOffFading = false; Leds::autoOffFade = 1; Leds::startCrossfade(400); }
}

static void applyFavorite(int i) {
  if (i < 0 || i >= MAX_FAVORITES || !user.fav[i].used) return;
  st.level = user.fav[i].level;
  st.temp = user.fav[i].temp;
  clampState();
}

void cancelTimers() {
  autoOffFading = false; Leds::autoOffFade = 1;
  sleepTimerEnd = 0; Leds::sleepFade = 1;
  sunriseActive = false; Leds::sunriseFade = 1;
}

// Light the lamp exactly as it is set now (no favorite, no battery blink).
static void lampResume() {
  cancelTimers();
  Power::ledPower(true);
  lampOn = true;
  lampOnSince = millis();
  noteActivity();
}

void lampTurnOn(bool fromAlarm) {
  Power::update(millis());
  if (!Power::externalPower() && Power::voltage() < BATT_MIN_TO_TURN_ON) {
    Power::ledPower(true);
    Leds::overlay(OV_BLINK, 1600, 3);
    return;
  }
  if (Leds::overlayActive() == OV_WIFI_WAIT) Leds::clearOverlay();
  applyFavorite(user.powerOnFav);
  lampResume();
  lowWarned = false;
  Leds::lowBattery = false;
  shutdownPending = false;
  if (fromAlarm) {
    sunriseActive = true;
    sunriseStart = millis();
    sunriseDur = user.sunriseMin * 60000UL;
    Leds::sunriseFade = 0;
  }
  LOG("Lamp on%s", fromAlarm ? " (sunrise)" : "");
  noteLightChanged();
}

// Unlike the color lamp, turning this lamp off does not close the Wi-Fi app:
// a lamp that is hosting the app for its group is often off itself.
void lampTurnOff(bool save) {
  if (save) stateSave();
  if (lampOn) LOG("Lamp off");
  lampOn = false;
  cancelTimers();
}

void startSleepTimer(uint8_t minutes) {
  sleepTimerDur = minutes * 60000UL;
  sleepTimerEnd = millis() + sleepTimerDur;
  noteActivity();
}

uint32_t sleepTimerSecondsLeft() {
  if (!sleepTimerEnd) return 0;
  int32_t d = (int32_t)(sleepTimerEnd - millis());
  return d > 0 ? d / 1000 : 0;
}

uint32_t autoOffSecondsLeft() {
  if (!lampOn || user.autoOffMin == 0) return 0;
  uint32_t lim = user.autoOffMin * 60000UL;
  uint32_t el = elapsedMs(lastActivity, millis());
  return el >= lim ? 0 : (lim - el) / 1000;
}

// ---------------------------------------------------------------------
//  Buttons
// ---------------------------------------------------------------------
// Every tap acts at once, so on/off feels instant. A second or third tap
// then replaces what the earlier taps of the same series did:
//   1 tap = on/off, 2 = next brightness, 3 = next warm/cool.
// 4 and 5 taps (battery, Wi-Fi) act when the series ends.
static void onLampTap(uint8_t n) {
  if (n == 1) {
    // A tap first cancels anything that is fading the lamp on its own.
    seriesSwallowed = false;
    if (lampOn && (autoOffFading || sleepTimerEnd || sunriseActive)) {
      seriesSwallowed = true;
      if (!autoOffFading) { sleepTimerEnd = 0; Leds::sleepFade = 1; sunriseActive = false; Leds::sunriseFade = 1; Leds::startCrossfade(400); }
      noteActivity();
      LOG("Tap: fade / timer cancelled");
      return;
    }
    seriesWasOn = lampOn;
    seriesSt = st;
  }
  if (seriesSwallowed) return;
  noteActivity();

  if (n == 1) {
    if (seriesWasOn) lampTurnOff(true);
    else lampTurnOn();
    return;
  }
  if (!seriesWasOn) return;        // from off, extra taps just leave the lamp on (4 and 5: see series end)

  // The lamp was on, and the first tap of this series turned it off: undo that.
  if (!lampOn) lampResume();
  st = seriesSt;
  if (n == 2) st.level = (seriesSt.level + 1) % user.levelCount;
  if (n == 3 && lightHasTemp()) st.temp = (seriesSt.temp + 1) % user.tempCount;
  Leds::startCrossfade();
  if (n <= 3) noteLightChanged();
}

static void onLampSeriesEnd(uint8_t n) {
  if (seriesSwallowed) return;
  LOG("%u tap(s)", n);
  if (n == 4) {
    if (!seriesWasOn && lampOn) lampTurnOff(false);   // battery check from off: stay off
    Power::ledPower(true);
    Leds::overlay(OV_BATTERY, 3000);
  } else if (n == 5) {
    if (Web::active()) Web::stop("5 taps");
    else if (lampOn) Web::start(false);          // (lamp stays off if the battery is too low: no Wi-Fi then)
  }
}

static void onLampButton(const ButtonEvent &e) {
  switch (e.type) {
    case B_TAP:        onLampTap(e.taps); break;
    case B_SERIES_END: onLampSeriesEnd(e.taps); break;
    case B_HOLD:
      // Hold with the lamp on: fade out slowly, then off (the sleep timer).
      if (lampOn && !sleepTimerEnd) {
        LOG("Hold: sleep timer, %u min", user.sleepFadeMin);
        startSleepTimer(user.sleepFadeMin);
        Leds::overlay(OV_BLINK, 500, 1);            // one blink to confirm
      }
      break;
    default: break;
  }
}

static void onGroupButton(const ButtonEvent &e) {
  switch (e.type) {
    case B_TAP:
      noteActivity();
      if (Net::pairing()) Net::stopPairing();       // a tap ends pairing mode early
      else Net::groupTap();
      break;
    case B_HOLD:
      if (e.heldMs == PAIR_HOLD_MS) {
        Net::startPairing();
      } else {
        Net::stopPairing();
        Net::leaveGroup();
        Power::ledPower(true);
        Leds::overlay(OV_BLINK, 1500, 3);
      }
      break;
    default: break;
  }
}

// ---------------------------------------------------------------------
//  Timers, battery protection, fades
// ---------------------------------------------------------------------
static void updateTimers(uint32_t now, uint32_t dtMs) {
  // power fade in/out
  float step = (float)dtMs / POWER_FADE_MS;
  if (lampOn) Leds::powerFade = min(1.0f, Leds::powerFade + step);
  else        Leds::powerFade = max(0.0f, Leds::powerFade - step);

  if (!lampOn) return;

  // The lamp has run for 10 s without the supply collapsing: whatever caused
  // an earlier brownout is over.
  if (keep.brownouts && elapsedMs(lampOnSince, now) > 10000) keep.brownouts = 0;

  // auto-off after N minutes without a button press (30 s fade first)
  if (user.autoOffMin > 0 && !autoOffFading && elapsedMs(lastActivity, now) > user.autoOffMin * 60000UL) {
    autoOffFading = true;
    autoOffStart = now;
    LOG("Auto-off fade");
  }
  if (autoOffFading) {
    float k = 1.0f - (float)(elapsedMs(autoOffStart, now)) / (AUTO_OFF_FADE_S * 1000.0f);
    Leds::autoOffFade = max(0.0f, k);
    if (k <= 0) { lampTurnOff(true); return; }
  }

  // sleep timer: linear fade across its whole length
  if (sleepTimerEnd) {
    int32_t left = (int32_t)(sleepTimerEnd - now);
    if (left <= 0) { lampTurnOff(true); return; }
    Leds::sleepFade = (float)left / sleepTimerDur;
  }

  // sunrise ramp
  if (sunriseActive) {
    float k = (float)(elapsedMs(sunriseStart, now)) / sunriseDur;
    if (k >= 1) { k = 1; sunriseActive = false; }
    Leds::sunriseFade = k;
  }
}

static void checkAlarm() {
  if (!user.alarmOn || !timeValid || lampOn) return;
  int yd = localYday();
  if (yd == lastAlarmYday) return;
  int32_t s = secondsUntilSunriseStart();
  if (s >= 86400 - 60) {           // the start minute has just arrived
    lastAlarmYday = yd;
    lampTurnOn(true);
  }
}

static void checkBattery(uint32_t now) {
  bool usb = Power::usbPresent();
  if (usb != lastUsb) {
    lastUsb = usb;
    LOG("USB power %s", usb ? "detected" : "removed");
    noteLightChanged();
    if (lampOn) Leds::startCrossfade(600);          // charging limit changes
    else if (usb) { Power::ledPower(true); Leds::overlay(OV_CHARGE, 5000); }
  }
  if (Power::externalPower()) {
    cutoffSince = 0;
    if (Power::percent() > 15) { lowWarned = false; Leds::lowBattery = false; }
    return;
  }

  if (lampOn && !lowWarned && Power::percent() <= BATT_LOW_PCT) {
    lowWarned = true;
    // Hold the light at the lowest step without touching the saved brightness.
    Leds::lowBattery = true;
    Leds::startCrossfade(600);
    Leds::overlay(OV_BLINK, 1100, 2);
    LOG("Battery low");
  }
  if (lampOn && Power::rawVoltage() <= BATT_CUTOFF_V) {
    if (!cutoffSince) cutoffSince = now | 1;
    if (elapsedMs(cutoffSince, now) > 5000 && !shutdownPending) {
      LOG("Battery empty, shutting down");
      shutdownPending = true;
      lampTurnOff(true);
      if (Web::active()) Web::stop("battery empty");
      Power::ledPower(true);
      Leds::overlay(OV_BLINK, 1600, 3);
    }
  } else {
    cutoffSince = 0;
  }
}

// ---------------------------------------------------------------------
//  Radio and naps
// ---------------------------------------------------------------------
static bool readyToNap(uint32_t now) {
#if DEBUG_STAY_AWAKE
  return false;
#endif
  if (lampOn || Leds::powerFade > 0 || !Leds::settled()) return false;
  if (Leds::overlayActive() != OV_NONE || Power::ledPowered()) return false;
  if (Buttons::busy()) return false;
  if (lightLogAt) return false;
  return true;
}

// Decides, every pass, whether the radio and the chip need to be awake.
//  - Sending, pairing, the Wi-Fi app, or a group command a moment ago:
//    radio stays on.
//  - Lamp off and quiet: nap. A paired lamp wakes every NAP_MS to listen
//    for LISTEN_MS; an unpaired lamp sleeps until a button is pressed.
//  - Lamp on: the chip stays awake, but the radio still only listens in
//    short windows, to save its 80 mA.
static void manageRadioAndNaps(uint32_t now) {
  bool paired = Net::peerCount() > 0;
  if (Net::busy() || Net::pairing() || Web::active() || Net::wantsAwake() || elapsedMs(bootMs, now) < 1500) {
    Net::radio(true);
    return;
  }

  if (readyToNap(now)) {
    Net::radio(false);
    uint32_t ms = paired ? NAP_MS : 0;
    if (!paired && user.alarmOn && timeValid) {
      // nothing to listen for, but the sunrise alarm still has to go off
      int32_t s = secondsUntilSunriseStart();
      if (s >= 86400 - 60) s = 1;
      ms = (uint32_t)min((int32_t)3600, s) * 1000UL;
    }
    Power::nap(ms);
    if (paired) { Net::radio(true); Net::keepAwake(LISTEN_MS); }
    return;
  }

  if (Net::radioIsOn()) {
    Net::radio(false);
    nextListen = now + NAP_MS;
  } else if (paired && (int32_t)(now - nextListen) >= 0) {
    Net::radio(true);
    Net::keepAwake(LISTEN_MS);
  }
}

// ---------------------------------------------------------------------
//  Setup / loop
// ---------------------------------------------------------------------
void setup() {
  bootMs = millis();
  pinMode(PIN_LED_EN, OUTPUT);              // LEDs off first thing
  digitalWrite(PIN_LED_EN, LOW);
  Serial.begin(115200);

  esp_reset_reason_t rr = esp_reset_reason();
  // After a power-up the kept memory holds garbage; start it clean.
  if (keep.magic != RTC_KEEP_MAGIC || rr == ESP_RST_POWERON) keep = {RTC_KEEP_MAGIC, 0, 0, 0, 0};

  settingsLoad();
  Power::begin();
  Buttons::begin();
  Leds::begin();
  Net::begin();
  // The clock only counts if the phone set it and it still reads a real date.
  timeValid = keep.timeValid && time(nullptr) > 1600000000;
  lastUsb = Power::usbPresent();

  if (rr == ESP_RST_BROWNOUT) {
    // The supply dipped too far under load. Stay off; don't start Wi-Fi.
    // Blink so this doesn't look like a lamp that simply ignores its button,
    // but stop blinking if it keeps happening (the blink itself draws current).
    LOG("Brownout reset");
    if (keep.brownouts < 3) {
      keep.brownouts++;
      Power::ledPower(true);
      Leds::overlay(OV_BLINK, 1600, 3);
    }
  } else if (keep.rebootToWifi) {
    // deliberate reboot from the app (maker settings or firmware update)
    keep.rebootToWifi = 0;
    lampTurnOn();
    Web::start(true);
  } else {
    // Fresh power-up (master switch), crash, or new firmware via USB: open
    // the Wi-Fi app for 2 minutes. This is also how a new lamp gets set up.
    Web::start(true);
    Power::ledPower(true);
    Leds::overlay(OV_WIFI_WAIT, 0);
  }

  Serial.printf("\n%s  firmware %s  (%s)\n", maker.model, FIRMWARE_VERSION, BOARD_NAME);
  {
    const char *why = "unknown";
    switch (rr) {
      case ESP_RST_POWERON:   why = "power switched on / USB plugged in"; break;
      case ESP_RST_EXT:       why = "reset pin"; break;
      case ESP_RST_SW:        why = "restart by firmware"; break;
      case ESP_RST_PANIC:     why = "CRASH (software error)"; break;
      case ESP_RST_INT_WDT:
      case ESP_RST_TASK_WDT:
      case ESP_RST_WDT:       why = "CRASH (watchdog: code got stuck)"; break;
      case ESP_RST_BROWNOUT:  why = "BROWNOUT (power dipped too low)"; break;
      default: break;
    }
    Serial.printf("Start reason: %s (code %d)\n", why, (int)rr);
    Preferences p; p.begin("lamp", true); String last = p.getString("lastwifi", ""); p.end();
    if (last.length()) Serial.printf("Last time, Wi-Fi turned off because: %s\n", last.c_str());
  }
  Serial.printf("Light type %u, LEDs %u, paired with %u lamp(s), Wi-Fi password: %s\n",
                maker.lightType, maker.ledCount, Net::peerCount(), user.wifiPass);
  if (Power::batteryPresent())
    Serial.printf("Battery %.2f V (%u%%), USB %s\n", Power::voltage(), Power::percent(), Power::usbPresent() ? "yes" : "no");
  else
    Serial.println("No battery detected: bench mode, battery protection off");
  lastLoop = millis();
}

void loop() {
  uint32_t now = millis();
  uint32_t dt = elapsedMs(lastLoop, now);
  lastLoop = now;

  Power::update(now);

  ButtonEvent e = Buttons::updateLamp(now);
  if (e.type != B_NONE) onLampButton(e);
  e = Buttons::updateGroup(now);
  if (e.type != B_NONE) onGroupButton(e);

  Net::update(now);
  Web::update(now);
  updateTimers(now, dt);
  checkAlarm();
  checkBattery(now);

  // tell the group when this lamp changes
  if (lampOn != toldOn || st.level != toldSt.level || st.temp != toldSt.temp) {
    toldOn = lampOn; toldSt = st;
    Net::statusChanged();
  }

  // Wi-Fi window while the lamp is off: slow pulse
  if (!lampOn && Web::active() && !Web::hasClient() && Leds::overlayActive() == OV_NONE && Leds::powerFade <= 0)
    Leds::overlay(OV_WIFI_WAIT, 0);
  if (Leds::overlayActive() == OV_WIFI_WAIT && (lampOn || !Web::active() || Web::hasClient())) Leds::clearOverlay();

  // LED power only while something is lit
  bool needLeds = lampOn || Leds::powerFade > 0 || Leds::overlayActive() != OV_NONE || !Leds::settled();
  if (needLeds && !Power::ledPowered()) Power::ledPower(true);
  // While the Wi-Fi window is open and nobody has joined, repeat the
  // network name and password on the serial monitor every 5 s.
  if (elapsedMs(lastPassPrint, now) > 5000) {
    lastPassPrint = now;
    if (Web::active() && !Web::hasClient())
      Serial.printf("Wi-Fi: %s  password: %s  (%us left)\n", Web::networkName(), user.wifiPass, (unsigned)Web::secondsLeft());
  }
  Leds::render(now);
  if (lightLogAt && elapsedMs(lightLogAt, now) > 900) { lightLogAt = 0; printLightReport(); }
  if (!needLeds && Power::ledPowered()) Power::ledPower(false);

  manageRadioAndNaps(now);
  delay(1);
}

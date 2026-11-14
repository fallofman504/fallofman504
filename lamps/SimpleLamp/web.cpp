// =====================================================================
//  web.cpp  -  the lamp's own Wi-Fi network, captive portal, JSON API,
//              and firmware updates over Wi-Fi
//
//  Life cycle
//    start  -> 2 min to connect, else Wi-Fi turns off
//    joined -> stays on until the user taps Done, disconnects, taps 5x,
//              or 15 min pass with no activity in the app (auto logout).
//    stop   -> any unsaved (preview-only) changes are thrown away and the
//              lamp returns to its last saved settings.
//
//  The network runs on RADIO_CHANNEL, the same channel the lamps use to
//  talk to each other, so this lamp can host the app and relay commands
//  to its group at the same time.
// =====================================================================
#include "lamp.h"
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Update.h>
#include "web_ui.h"

#include <Preferences.h>
uint8_t updateProgress = 0;

namespace {
  WebServer server(80);
  DNSServer dns;
  bool on = false, routesAdded = false;
  uint32_t startMs = 0, lastActivity = 0, noClientSince = 0;
  bool hadClient = false;
  uint32_t lastRequest = 0;              // the app polls every 2 s: proof a phone is there
  uint32_t lastQuery = 0;                // last time the other lamps were asked to report
  const char *pendingStop = nullptr;     // stop after the current request finishes
  uint8_t clients = 0;
  String makerToken;
  bool updateOk = false;
  String updateError;
  String ssid;

  void activity() { lastActivity = millis(); lastRequest = lastActivity; noteActivity(); }

  bool dirty() {
    // preview changes not yet saved?
    return memcmp(&user, &userSaved, sizeof(UserSettings)) != 0;
  }

  void seen() { lastRequest = millis(); }

  void sendJson(JsonDocument &d, int code = 200) {
    String s;
    serializeJson(d, s);
    server.sendHeader("Cache-Control", "no-store");
    server.send(code, "application/json", s);
  }
  void sendOk() { server.send(200, "application/json", "{\"ok\":true}"); }
  void sendErr(int code, const char *msg) {
    JsonDocument d; d["ok"] = false; d["error"] = msg; sendJson(d, code);
  }

  bool parseBody(JsonDocument &d) {
    if (!server.hasArg("plain")) { sendErr(400, "Missing body"); return false; }
    if (deserializeJson(d, server.arg("plain"))) { sendErr(400, "Bad JSON"); return false; }
    return true;
  }

  bool makerAuthed() {
    if (makerToken.length() && server.header("X-Token") == makerToken) return true;
    sendErr(401, "Maker password required");
    return false;
  }

  String macStr(const uint8_t *m) {
    char b[13];
    snprintf(b, sizeof(b), "%02X%02X%02X%02X%02X%02X", m[0], m[1], m[2], m[3], m[4], m[5]);
    return b;
  }

  bool parseMac(const char *t, uint8_t *out) {
    if (!t || strlen(t) != 12) return false;
    for (uint8_t i = 0; i < 6; i++) {
      char pair[3] = {t[i * 2], t[i * 2 + 1], 0};
      char *end;
      out[i] = (uint8_t)strtoul(pair, &end, 16);
      if (*end) return false;
    }
    return true;
  }

  // This lamp first, then every lamp it is paired with.
  void fillGroup(JsonObject g) {
    g["pairing"] = Net::pairing();
    JsonArray lamps = g["lamps"].to<JsonArray>();
    JsonObject me = lamps.add<JsonObject>();
    me["mac"] = macStr(Net::selfMac());
    me["name"] = user.lampName;
    me["self"] = true;
    me["known"] = true;
    me["on"] = lampOn;
    me["level"] = st.level;
    me["levelCount"] = user.levelCount;
    me["levelPct"] = user.levels[st.level < user.levelCount ? st.level : 0];
    me["temp"] = st.temp;
    me["tempCount"] = user.tempCount;
    me["hasTemp"] = lightHasTemp();
    me["batt"] = Power::externalPower() ? 255 : Power::percent();
    me["age"] = 0;
    uint32_t now = millis();
    for (uint8_t i = 0; i < Net::peerCount(); i++) {
      const Net::Peer &p = Net::peer(i);
      JsonObject o = lamps.add<JsonObject>();
      String mac = macStr(p.mac);
      o["mac"] = mac;
      o["name"] = p.known ? String(p.name) : "Lamp " + mac.substring(8);
      o["self"] = false;
      o["known"] = p.known;
      o["on"] = p.on;
      o["level"] = p.level;
      o["levelCount"] = p.levelCount;
      o["levelPct"] = p.levelPct;
      o["temp"] = p.temp;
      o["tempCount"] = p.tempCount;
      o["hasTemp"] = p.hasTemp;
      o["batt"] = p.battPct;
      o["age"] = p.known ? elapsedMs(p.seen, now) / 1000 : 0;
    }
  }

  void fillStatus(JsonObject s) {
    s["on"] = lampOn;
    s["level"] = st.level;
    s["temp"] = st.temp;
    JsonObject b = s["battery"].to<JsonObject>();
    b["v"] = serialized(String(Power::voltage(), 2));
    b["pct"] = Power::percent();
    b["usb"] = Power::usbPresent();
    b["charging"] = Power::charging();
    b["full"] = Power::chargeFull();
    b["runtimeH"] = serialized(String(Power::estimateRuntimeHours(), 1));
    b["mA"] = (int)Leds::currentmA();
    JsonObject w = s["wifi"].to<JsonObject>();
    w["secondsLeft"] = Web::secondsLeft();
    w["clients"] = clients;
    JsonObject t = s["timers"].to<JsonObject>();
    t["autoOffS"] = autoOffSecondsLeft();
    t["sleepS"] = sleepTimerSecondsLeft();
    int h, m;
    s["timeValid"] = lampLocalTime(h, m);
    if (timeValid) { s["hour"] = h; s["minute"] = m; }
    s["dirty"] = dirty();
    s["limit"] = (int)lroundf(Leds::brightnessLimit() * 100);   // top brightness right now, on the step scale
    fillGroup(s["group"].to<JsonObject>());
  }

  // ---- handlers -------------------------------------------------------------
  void hRoot() {
    server.sendHeader("Cache-Control", "no-store");
    server.sendHeader("Content-Encoding", "gzip");
    server.send_P(200, "text/html", (const char *)WEB_UI_GZ, WEB_UI_GZ_LEN);
  }

  void hCaptive() {
    server.sendHeader("Location", "http://192.168.4.1/", true);
    server.send(302, "text/plain", "");
  }

  void hState() {
    seen();
    JsonDocument d;
    JsonObject info = d["info"].to<JsonObject>();
    info["model"] = maker.model;
    info["fw"] = FIRMWARE_VERSION;
    info["board"] = BOARD_NAME;
    info["ledCount"] = maker.ledCount;
    info["ssid"] = ssid;
    info["hasTemp"] = lightHasTemp();
    info["maxGroup"] = MAX_GROUP;
    fillStatus(d["status"].to<JsonObject>());
    userToJson(user, d["user"].to<JsonObject>());
    sendJson(d);
  }

  void hStatus() {
    seen();
    JsonDocument d;
    fillStatus(d.to<JsonObject>());
    sendJson(d);
  }

  void hPreview() {            // live settings change, not yet saved
    JsonDocument d;
    if (!parseBody(d)) return;
    activity();
    userFromJson(user, d.as<JsonObjectConst>());
    clampState();
    Leds::startCrossfade();
    noteLightChanged();
    sendOk();
  }

  void hControl() {            // lamp state: on/off, brightness step, warm/cool step
    JsonDocument d;
    if (!parseBody(d)) return;
    activity();
    JsonObjectConst o = d.as<JsonObjectConst>();
    if (o["on"].is<bool>()) {
      bool want = o["on"];
      if (want && !lampOn) lampTurnOn();
      if (!want && lampOn) lampTurnOff(true);
    }
    if (o["level"].is<int>()) st.level = o["level"];
    if (o["temp"].is<int>()) st.temp = o["temp"];
    clampState();
    Leds::startCrossfade();
    noteLightChanged();
    sendOk();
  }

  void hSave() {
    activity();
    settingsSaveUser();
    stateSave();
    sendOk();
  }

  void hRevert() {
    activity();
    user = userSaved;
    clampState();
    Leds::startCrossfade();
    sendOk();
  }

  void hDone() {
    sendOk();
    pendingStop = "done";
  }

  void hClock() {
    JsonDocument d;
    if (!parseBody(d)) return;
    setClock(d["epoch"] | 0UL, d["tz"] | 0);
    sendOk();
  }

  void hSleepTimer() {
    JsonDocument d;
    if (!parseBody(d)) return;
    int m = d["min"] | 0;
    if (m <= 0) { cancelTimers(); Leds::startCrossfade(400); }
    else { if (!lampOn) lampTurnOn(); startSleepTimer(constrain(m, 1, 120)); }
    activity();
    sendOk();
  }

  void hIdentify() {
    activity();
    Power::ledPower(true);
    Leds::overlay(OV_IDENTIFY, 1800);
    sendOk();
  }

  // ---- the group: this lamp passes these on to the others by radio -------
  void hGroupAll() {
    JsonDocument d;
    if (!parseBody(d)) return;
    activity();
    Net::groupAll(d["on"] | false);
    sendOk();
  }

  void hGroupSet() {           // one lamp: on/off, brightness step, warm/cool step, name
    JsonDocument d;
    if (!parseBody(d)) return;
    activity();
    uint8_t mac[6];
    if (!parseMac(d["mac"] | "", mac)) { sendErr(400, "Unknown lamp"); return; }
    uint8_t fields = 0;
    if (d["on"].is<bool>()) fields |= Net::SET_ON;
    if (d["level"].is<int>()) fields |= Net::SET_LEVEL;
    if (d["temp"].is<int>()) fields |= Net::SET_TEMP;
    const char *nm = d["name"] | "";
    if (nm[0]) fields |= Net::SET_NAME;
    Net::sendSet(mac, fields, d["on"] | false, d["level"] | 0, d["temp"] | 0, nm);
    if (nm[0] && memcmp(mac, Net::selfMac(), 6) == 0) strlcpy(userSaved.lampName, user.lampName, sizeof(userSaved.lampName));
    sendOk();
  }

  void hGroupPair() {
    JsonDocument d;
    if (!parseBody(d)) return;
    activity();
    if (d["on"] | false) Net::startPairing();
    else Net::stopPairing();
    sendOk();
  }

  void hGroupForget() {
    JsonDocument d;
    if (!parseBody(d)) return;
    activity();
    uint8_t mac[6];
    if (!parseMac(d["mac"] | "", mac)) { sendErr(400, "Unknown lamp"); return; }
    Net::kick(mac);
    sendOk();
  }

  void hWifiPass() {
    JsonDocument d;
    if (!parseBody(d)) return;
    activity();
    const char *p = d["pass"] | "";
    size_t n = strlen(p);
    if (n < 8 || n > 32) { sendErr(400, "Password must be 8 to 32 characters"); return; }
    strlcpy(user.wifiPass, p, sizeof(user.wifiPass));
    strlcpy(userSaved.wifiPass, p, sizeof(userSaved.wifiPass));
    settingsSaveUser();
    sendOk();
  }

  // ---- maker -----------------------------------------------------------------
  void hMakerLogin() {
    JsonDocument d;
    if (!parseBody(d)) return;
    activity();
    if (strcmp(d["pass"] | "", maker.makerPass) != 0) { sendErr(403, "Wrong maker password"); return; }
    char buf[17];
    for (int i = 0; i < 16; i += 8) snprintf(buf + i, 9, "%08lx", (unsigned long)esp_random());
    makerToken = buf;
    JsonDocument r; r["ok"] = true; r["token"] = makerToken;
    sendJson(r);
  }

  void hMakerGet() {
    if (!makerAuthed()) return;
    JsonDocument d;
    makerToJson(maker, d["maker"].to<JsonObject>(), false);
    d["wifiPass"] = user.wifiPass;
    d["defaultWifiPass"] = defaultWifiPassword();
    d["battRawV"] = serialized(String(Power::rawVoltage(), 3));
    d["mac"] = WiFi.softAPmacAddress();
    sendJson(d);
  }

  void restartSoon() {
    requestRebootToWifi();
    delay(400);
    ESP.restart();
  }

  void hMakerSet() {
    if (!makerAuthed()) return;
    JsonDocument d;
    if (!parseBody(d)) return;
    activity();
    uint16_t oldCount = maker.ledCount;
    uint8_t oldType = maker.lightType;
    makerFromJson(maker, d.as<JsonObjectConst>());
    settingsSaveMaker();
    bool reboot = maker.ledCount != oldCount || maker.lightType != oldType;
    JsonDocument r; r["ok"] = true; r["reboot"] = reboot;
    sendJson(r);
    if (reboot) restartSoon();
  }

  void hMakerCalBatt() {
    if (!makerAuthed()) return;
    JsonDocument d;
    if (!parseBody(d)) return;
    activity();
    float measured = d["volts"] | 0.0f;
    float shown = Power::rawVoltage();
    if (measured < 2.8f || measured > 4.4f || shown < 2.5f) { sendErr(400, "Enter a voltage between 2.8 and 4.4"); return; }
    maker.battCal = constrain(maker.battCal * measured / shown, 0.8f, 1.2f);
    settingsSaveMaker();
    JsonDocument r; r["ok"] = true; r["battCal"] = maker.battCal;
    sendJson(r);
  }

  void hExport() {
    if (!makerAuthed()) return;
    JsonDocument d;
    d["format"] = "simple-lamp-settings-1";
    d["fw"] = FIRMWARE_VERSION;
    userToJson(userSaved, d["user"].to<JsonObject>());
    makerToJson(maker, d["maker"].to<JsonObject>(), false);
    server.sendHeader("Content-Disposition", "attachment; filename=lamp-settings.json");
    sendJson(d);
  }

  void hImport() {
    if (!makerAuthed()) return;
    JsonDocument d;
    if (!parseBody(d)) return;
    activity();
    if (strcmp(d["format"] | "", "simple-lamp-settings-1") != 0) { sendErr(400, "Not a Simple Lamp settings file"); return; }
    if (d["user"].is<JsonObjectConst>()) userFromJson(user, d["user"].as<JsonObjectConst>());
    if (d["maker"].is<JsonObjectConst>()) makerFromJson(maker, d["maker"].as<JsonObjectConst>());
    settingsSaveUser();
    settingsSaveMaker();
    sendOk();
    restartSoon();
  }

  void hFactory() {
    if (!makerAuthed()) return;
    settingsFactoryReset();
    sendOk();
    restartSoon();
  }

  // ---- firmware update ---------------------------------------------------
  void hUpdateDone() {
    if (updateOk) {
      server.send(200, "application/json", "{\"ok\":true}");
      restartSoon();
    } else {
      sendErr(400, updateError.length() ? updateError.c_str() : "Update failed");
      Leds::clearOverlay();
    }
  }

  void hUpdateUpload() {
    HTTPUpload &up = server.upload();
    if (up.status == UPLOAD_FILE_START) {
      activity();
      updateOk = false; updateError = ""; updateProgress = 0;
      if (!Power::usbPresent() && Power::percent() < 30) {
        updateError = "Battery below 30%. Plug in USB and try again.";
        return;
      }
      Power::ledPower(true);
      Leds::overlay(OV_UPDATE, 0);
      LOG("Update: %s", up.filename.c_str());
      if (!Update.begin(UPDATE_SIZE_UNKNOWN)) updateError = Update.errorString();
    } else if (up.status == UPLOAD_FILE_WRITE) {
      if (updateError.length()) return;
      if (Update.write(up.buf, up.currentSize) != up.currentSize) { updateError = Update.errorString(); return; }
      size_t total = server.header("Content-Length").toInt();
      if (total > 0) updateProgress = min(100, (int)(Update.progress() * 100 / total));
      lastActivity = millis();
    } else if (up.status == UPLOAD_FILE_END) {
      if (updateError.length()) { Update.abort(); return; }
      // Only switches to the new firmware if the whole image arrived and verified.
      if (Update.end(true)) { updateOk = true; updateProgress = 100; }
      else updateError = Update.errorString();
    } else if (up.status == UPLOAD_FILE_ABORTED) {
      Update.abort();
      updateError = "Upload interrupted. The lamp is still on its old firmware.";
    }
  }

  void addRoutes() {
    const char *hdrs[] = {"X-Token", "Content-Length"};
    server.collectHeaders(hdrs, 2);
    server.on("/", HTTP_GET, hRoot);
    server.on("/api/state", HTTP_GET, hState);
    server.on("/api/status", HTTP_GET, hStatus);
    server.on("/api/preview", HTTP_POST, hPreview);
    server.on("/api/control", HTTP_POST, hControl);
    server.on("/api/save", HTTP_POST, hSave);
    server.on("/api/revert", HTTP_POST, hRevert);
    server.on("/api/done", HTTP_POST, hDone);
    server.on("/api/clock", HTTP_POST, hClock);
    server.on("/api/sleeptimer", HTTP_POST, hSleepTimer);
    server.on("/api/identify", HTTP_POST, hIdentify);
    server.on("/api/group/all", HTTP_POST, hGroupAll);
    server.on("/api/group/set", HTTP_POST, hGroupSet);
    server.on("/api/group/pair", HTTP_POST, hGroupPair);
    server.on("/api/group/forget", HTTP_POST, hGroupForget);
    server.on("/api/wifipass", HTTP_POST, hWifiPass);
    server.on("/api/maker/login", HTTP_POST, hMakerLogin);
    server.on("/api/maker", HTTP_GET, hMakerGet);
    server.on("/api/maker", HTTP_POST, hMakerSet);
    server.on("/api/maker/calbatt", HTTP_POST, hMakerCalBatt);
    server.on("/api/maker/export", HTTP_GET, hExport);
    server.on("/api/maker/import", HTTP_POST, hImport);
    server.on("/api/maker/factory", HTTP_POST, hFactory);
    server.on("/update", HTTP_POST, hUpdateDone, hUpdateUpload);
    // captive-portal probes from iOS, Android, Windows
    const char *probes[] = {"/generate_204", "/gen_204", "/hotspot-detect.html", "/library/test/success.html",
                            "/connecttest.txt", "/ncsi.txt", "/fwlink", "/redirect", "/canonical.html"};
    for (const char *p : probes) server.on(p, hCaptive);
    server.onNotFound(hCaptive);
    routesAdded = true;
  }
}  // namespace

namespace Web {

void start(bool silent) {
  if (on) return;
  uint64_t mac = ESP.getEfuseMac();               // works before Wi-Fi starts
  char suffix[6];
  snprintf(suffix, sizeof(suffix), "%02X%02X", (unsigned)((mac >> 32) & 0xFF), (unsigned)((mac >> 40) & 0xFF));
  ssid = String(user.lampName);
  ssid.replace(" ", "-");
  ssid = ssid.substring(0, 20) + "-" + suffix;

  Net::radio(true);
  WiFi.mode(WIFI_AP_STA);      // AP for the phone; the lamp-to-lamp radio keeps running beside it
  // Default soft-AP address is 192.168.4.1 with DHCP for clients.
  bool ok = WiFi.softAP(ssid.c_str(), user.wifiPass, RADIO_CHANNEL, 0, 4);
  if (!ok) log_e("softAP failed to start");
  WiFi.setTxPower(WIFI_TX_POWER);
  Net::restart();              // ESP-NOW has to be set up again after the mode change
  dns.setErrorReplyCode(DNSReplyCode::NoError);
  dns.start(53, "*", IPAddress(192, 168, 4, 1));
  if (!routesAdded) addRoutes();
  server.begin();

  on = true;
  startMs = millis();
  lastActivity = startMs;
  hadClient = false;
  noClientSince = 0;
  pendingStop = nullptr;
  lastRequest = 0;
  lastQuery = 0;
  makerToken = "";
  if (!silent) { Power::ledPower(true); Leds::overlay(OV_WIFI_ON, 1600); }
  LOG("Wi-Fi on: %s", ssid.c_str());
}

void stop(const char *reason) {
  if (!on) return;
  on = false;
  server.stop();
  dns.stop();
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);
  Net::restart();
  makerToken = "";
  if (dirty()) {                 // throw away unsaved preview changes
    user = userSaved;
    clampState();
  }
  Leds::startCrossfade(400);
  LOG("Wi-Fi off (%s)", reason);
  {
    // remembered in flash so it can be printed after any kind of restart
    char buf[48];
    snprintf(buf, sizeof(buf), "%s, after %us", reason, (unsigned)((elapsedMs(startMs, millis())) / 1000));
    Preferences p; p.begin("lamp", false); p.putString("lastwifi", buf); p.end();
  }
}

bool active() { return on; }
const char *networkName() { return ssid.c_str(); }
bool hasClient() { return on && clients > 0; }

uint32_t secondsLeft() {
  if (!on) return 0;
  uint32_t now = millis();
  if (!hadClient) {
    uint32_t el = (elapsedMs(startMs, now)) / 1000;
    return el >= WIFI_CONNECT_WINDOW_S ? 0 : WIFI_CONNECT_WINDOW_S - el;
  }
  uint32_t idle = (elapsedMs(lastActivity, now)) / 1000;
  return idle >= WIFI_IDLE_TIMEOUT_S ? 0 : WIFI_IDLE_TIMEOUT_S - idle;
}

void update(uint32_t now) {
  if (!on) return;
  dns.processNextRequest();
  server.handleClient();
  if (pendingStop) { delay(100); const char *r = pendingStop; pendingStop = nullptr; stop(r); return; }

  clients = WiFi.softAPgetStationNum();
  bool appTalking = lastRequest && elapsedMs(lastRequest, now) < 10000;
  if (clients == 0 && appTalking) clients = 1;   // station count can lag; trust the app
  if (clients > 0) {
    if (!hadClient) {
      hadClient = true;
      LOG("Phone connected");
      lastActivity = now;        // 15-minute idle timer starts at connect
      if (!lampOn) lampTurnOn(); // so previews are visible
    }
    noClientSince = 0;
    // keep the app's view of the other lamps fresh
    if (!lastQuery || elapsedMs(lastQuery, now) > 10000) { lastQuery = now | 1; Net::query(); }
  } else if (hadClient) {
    if (!noClientSince) { noClientSince = now; LOG("Phone dropped off Wi-Fi, waiting %us for it to come back", WIFI_DISCONNECT_GRACE_S); }
    if (elapsedMs(noClientSince, now) > WIFI_DISCONNECT_GRACE_S * 1000UL) { stop("disconnected"); return; }
  } else if (elapsedMs(startMs, now) > WIFI_CONNECT_WINDOW_S * 1000UL) {
    stop("nobody connected");
    return;
  }
  if (hadClient && elapsedMs(lastActivity, now) > WIFI_IDLE_TIMEOUT_S * 1000UL) stop("15 min idle");
}

}  // namespace Web

#include "web.h"
#include "config.h"
#include "light.h"
#include "net.h"
#include "settings.h"
#include "web_ui.h"
#include <DNSServer.h>
#include <Update.h>
#include <WebServer.h>
#include <WiFi.h>

namespace web {

static WebServer server(80);
static DNSServer dns;
static bool active_ = false;
static bool routesAdded_ = false;
static uint32_t lastRequest_ = 0, lastQuery_ = 0, restartAt_ = 0;
static char ssid_[20];
static String updateError_;
static bool updateOk_ = false;

static String macStr(const uint8_t* m) {
  char b[13];
  snprintf(b, sizeof(b), "%02X%02X%02X%02X%02X%02X", m[0], m[1], m[2], m[3], m[4], m[5]);
  return b;
}

static bool parseMac(const String& s, uint8_t* out) {
  if (s.length() != 12) return false;
  for (uint8_t i = 0; i < 6; i++) {
    char pair[3] = {s[i * 2], s[i * 2 + 1], 0};
    char* end;
    out[i] = (uint8_t)strtoul(pair, &end, 16);
    if (*end) return false;
  }
  return true;
}

static void lampJson(String& j, const uint8_t* mac, const char* nm, bool self, bool on,
                     uint8_t bri, uint8_t cct, bool hasCct, uint16_t mv, long age) {
  j += "{\"mac\":\"" + macStr(mac) + "\",\"name\":\"" + nm + "\",\"self\":" +
       (self ? "true" : "false") + ",\"on\":" + (on ? "true" : "false") +
       ",\"bri\":" + bri + ",\"cct\":" + cct + ",\"hasCct\":" + (hasCct ? "true" : "false") +
       ",\"mv\":" + mv + ",\"age\":" + age + "}";
}

static void sendState() {
  String j = "{\"fw\":\"" FIRMWARE_VERSION "\",\"ssid\":\"";
  j += ssid_;
  j += "\",\"wifiPass\":\"" + wifiPassword() + "\",\"lightType\":" + maker.lightType +
       ",\"ledCount\":" + maker.ledCount + ",\"maxPct\":" + maker.maxPct + ",\"pairing\":";
  j += net::pairing() ? "true" : "false";
  j += ",\"lamps\":[";
  lampJson(j, net::selfMac(), net::name(), true, light::isOn(), light::brightness(),
           light::cct(), light::hasCct(), net::batteryMv(), 0);
  for (uint8_t i = 0; i < net::peerCount(); i++) {
    const net::Peer& p = net::peer(i);
    j += ",";
    String nm = p.known ? String(p.name) : "Lamp " + macStr(p.mac).substring(8);
    lampJson(j, p.mac, nm.c_str(), false, p.on, p.known ? p.bri : 128, p.cct, p.hasCct,
             p.mv, p.known ? (long)((millis() - p.seen) / 1000) : -1);
  }
  j += "]}";
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json", j);
}

static void ok() { server.send(200, "text/plain", "ok"); }

static void handleSet() {
  uint8_t mac[6];
  if (!parseMac(server.arg("mac"), mac)) return server.send(400, "text/plain", "bad mac");
  uint8_t fields = 0;
  if (server.hasArg("on")) fields |= net::SET_ON;
  if (server.hasArg("bri")) fields |= net::SET_BRI;
  if (server.hasArg("cct")) fields |= net::SET_CCT;
  if (server.hasArg("name")) fields |= net::SET_NAME;
  net::sendSet(mac, fields, server.arg("on").toInt() != 0,
               constrain(server.arg("bri").toInt(), 1, 255),
               constrain(server.arg("cct").toInt(), 0, 255), server.arg("name").c_str());
  ok();
}

static bool makerOk() {
  if (server.arg("pass") == MAKER_PASS) return true;
  server.send(403, "text/plain", "Wrong maker password.");
  return false;
}

static void handleMaker() {
  if (!makerOk()) return;
  maker.lightType = constrain(server.arg("type").toInt(), 0, LT_COUNT - 1);
  maker.ledCount = constrain(server.arg("count").toInt(), 1, MAX_LEDS);
  maker.maxPct = constrain(server.arg("max").toInt(), 5, 100);
  makerSave();
  ok();
  restartAt_ = millis() + 800;
}

static void handleUpdateUpload() {
  HTTPUpload& up = server.upload();
  lastRequest_ = millis();
  if (up.status == UPLOAD_FILE_START) {
    updateOk_ = false;
    updateError_ = "";
    if (server.arg("pass") != MAKER_PASS) updateError_ = "Wrong maker password.";
    else if (!Update.begin(UPDATE_SIZE_UNKNOWN)) updateError_ = Update.errorString();
  } else if (up.status == UPLOAD_FILE_WRITE) {
    if (updateError_.length()) return;
    if (Update.write(up.buf, up.currentSize) != up.currentSize) updateError_ = Update.errorString();
  } else if (up.status == UPLOAD_FILE_END) {
    if (updateError_.length()) { Update.abort(); return; }
    // Only switches to the new firmware if the whole image arrived and verified.
    if (Update.end(true)) updateOk_ = true;
    else updateError_ = Update.errorString();
  } else if (up.status == UPLOAD_FILE_ABORTED) {
    Update.abort();
    updateError_ = "Upload interrupted. The lamp is still on its old firmware.";
  }
}

static void handleUpdateDone() {
  if (updateOk_) {
    ok();
    restartAt_ = millis() + 800;
  } else {
    server.send(400, "text/plain", updateError_.length() ? updateError_ : String("Update failed."));
  }
}

static void captive() {
  server.sendHeader("Location", "http://192.168.4.1/", true);
  server.send(302, "text/plain", "");
}

static void addRoutes() {
  server.on("/", HTTP_GET, [] {
    server.sendHeader("Cache-Control", "no-store");
    server.sendHeader("Content-Encoding", "gzip");
    server.send_P(200, "text/html", (const char*)WEB_UI_GZ, WEB_UI_GZ_LEN);
  });
  server.on("/api/state", HTTP_GET, sendState);
  server.on("/api/set", HTTP_POST, handleSet);
  server.on("/api/all", HTTP_POST, [] {
    net::groupAll(server.arg("on").toInt() != 0);
    ok();
  });
  server.on("/api/pair", HTTP_POST, [] {
    if (server.arg("on").toInt()) net::startPairing();
    else net::stopPairing();
    ok();
  });
  server.on("/api/forget", HTTP_POST, [] {
    uint8_t mac[6];
    if (!parseMac(server.arg("mac"), mac)) return server.send(400, "text/plain", "bad mac");
    net::kick(mac);
    ok();
  });
  server.on("/api/maker", HTTP_POST, handleMaker);
  server.on("/update", HTTP_POST, handleUpdateDone, handleUpdateUpload);
  // captive-portal probes from iOS, Android, Windows
  const char* probes[] = {"/generate_204", "/gen_204", "/hotspot-detect.html",
                          "/library/test/success.html", "/connecttest.txt", "/ncsi.txt",
                          "/fwlink", "/redirect", "/canonical.html"};
  for (const char* p : probes) server.on(p, captive);
  server.onNotFound(captive);
}

void start() {
  if (active_) return;
  const uint8_t* m = net::selfMac();
  snprintf(ssid_, sizeof(ssid_), "Lamps-%02X%02X", m[4], m[5]);

  net::radio(true);
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(ssid_, wifiPassword().c_str(), RADIO_CHANNEL, 0, 4);
  net::restart();   // ESP-NOW has to be set up again after the mode change
  dns.setErrorReplyCode(DNSReplyCode::NoError);
  dns.start(53, "*", IPAddress(192, 168, 4, 1));   // phones open the panel by themselves

  if (!routesAdded_) { addRoutes(); routesAdded_ = true; }
  server.begin();

  active_ = true;
  lastRequest_ = millis();
  lastQuery_ = 0;
  LOG("Wi-Fi panel on: network %s, password %s", ssid_, wifiPassword().c_str());
}

void stop() {
  if (!active_) return;
  server.stop();
  dns.stop();
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);
  net::restart();
  active_ = false;
  LOG("Wi-Fi panel off");
}

bool active() { return active_; }

void loop() {
  if (!active_) return;
  dns.processNextRequest();
  server.handleClient();

  uint32_t now = millis();
  if (restartAt_ && (int32_t)(now - restartAt_) >= 0) {
    delay(100);
    ESP.restart();
  }
  if (WiFi.softAPgetStationNum() > 0) {
    lastRequest_ = now;
    if (!lastQuery_ || now - lastQuery_ > 10000) {  // keep the panel's view fresh
      lastQuery_ = now ? now : 1;
      net::query();
    }
  }
  if (now - lastRequest_ > PANEL_IDLE_S * 1000UL) stop();
}

}  // namespace web

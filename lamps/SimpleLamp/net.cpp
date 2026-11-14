// =====================================================================
//  net.cpp  -  lamp-to-lamp radio (ESP-NOW): pairing, group commands,
//              and status between paired lamps. No router involved.
//
//  Every packet is broadcast on RADIO_CHANNEL. A lamp only obeys packets
//  from lamps in its own group list (pairing excepted). Commands are sent
//  as a burst of repeats so lamps that are napping catch one copy.
// =====================================================================
#include "lamp.h"
#include "combos.h"
#include <Preferences.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>

namespace Net {

// ---------- Wire format ----------
// Every packet is broadcast: 6-byte header, then a payload that depends on type.
// A lamp only obeys packets from lamps in its own group list (pairing excepted).
enum : uint8_t {
  T_PAIR = 1,   // "I'm in pairing mode": count, mac[count] (sender's group)
  T_SYNC,       // "here is my group list": count, mac[count]
  T_GROUP,      // "exactly these lamps on": count, mac[count]
  T_SET,        // target mac, fields, on, level, temp, name[24]
  T_KICK,       // target mac: remove it from the group
  T_LEAVE,      // sender is leaving the group
  T_QUERY,      // everyone report status
  T_STATUS,     // on, level, levelCount, level %, temp, tempCount, hasTemp, battery %, name[24]
  T_COUNT
};
static const uint8_t kMagic0 = 'L', kMagic1 = 'N', kVersion = 1;
static const uint8_t kHdr = 6;
static const uint8_t kMaxPacket = 96;
static const uint8_t kMaxPeers = MAX_GROUP - 1;
static const uint8_t kBroadcast[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

// ---------- State ----------
static Preferences prefs;
static uint8_t self_[6];

static Peer peers_[kMaxPeers];   // kept sorted by MAC
static uint8_t peerCount_ = 0;
static uint16_t lastSeq_[kMaxPeers][T_COUNT];
static bool seqValid_[kMaxPeers][T_COUNT];

static bool radioOn_ = false;
static uint32_t awakeUntil_ = 0;
static uint16_t seq_ = 0;

static bool pairing_ = false;
static uint32_t pairingStart_ = 0, lastBeacon_ = 0, pairingBlinkUntil_ = 0;

static uint32_t statusAt_ = 0;   // 0 = nothing pending

static uint16_t comboStep_ = 0;
static uint32_t lastGroupTap_ = 0;
static bool allOn_ = false;      // as far as we know, the whole group is lit

// Commands are repeated for BURST_MS so lamps that are napping catch one copy.
struct Burst {
  uint8_t buf[kMaxPacket];
  uint8_t len, type;
  uint8_t target[6];
  uint32_t until;   // 0 = not started
};
static Burst queue_[4];
static uint8_t queued_ = 0;
static uint32_t lastTx_ = 0;

struct Rx {
  uint8_t mac[6];
  uint8_t len;
  uint8_t data[kMaxPacket];
};
static QueueHandle_t rxQueue_;

// ---------- Helpers ----------
static bool isSelf(const uint8_t* mac) { return memcmp(mac, self_, 6) == 0; }

static int findPeer(const uint8_t* mac) {
  for (uint8_t i = 0; i < peerCount_; i++)
    if (memcmp(peers_[i].mac, mac, 6) == 0) return i;
  return -1;
}

static void savePeers() {
  uint8_t blob[kMaxPeers * 6];
  for (uint8_t i = 0; i < peerCount_; i++) memcpy(blob + i * 6, peers_[i].mac, 6);
  if (peerCount_) prefs.putBytes("peers", blob, peerCount_ * 6);
  else prefs.remove("peers");
  memset(seqValid_, 0, sizeof(seqValid_));
  comboStep_ = 0;
  allOn_ = false;
}

static bool addPeer(const uint8_t* mac) {
  if (isSelf(mac) || findPeer(mac) >= 0 || peerCount_ >= kMaxPeers) return false;
  if (memcmp(mac, kBroadcast, 6) == 0) return false;
  uint8_t at = 0;
  while (at < peerCount_ && memcmp(peers_[at].mac, mac, 6) < 0) at++;
  memmove(&peers_[at + 1], &peers_[at], (peerCount_ - at) * sizeof(Peer));
  memset(&peers_[at], 0, sizeof(Peer));
  memcpy(peers_[at].mac, mac, 6);
  peerCount_++;
  return true;
}

static bool removePeer(const uint8_t* mac) {
  int at = findPeer(mac);
  if (at < 0) return false;
  memmove(&peers_[at], &peers_[at + 1], (peerCount_ - at - 1) * sizeof(Peer));
  peerCount_--;
  return true;
}

// Add every MAC in a "count, mac[count]" list. Returns true if anything was new.
static bool mergeList(const uint8_t* p, uint8_t len) {
  if (len < 1 || len < 1 + p[0] * 6) return false;
  bool added = false;
  for (uint8_t i = 0; i < p[0]; i++) added |= addPeer(p + 1 + i * 6);
  return added;
}

static uint8_t putHeader(uint8_t* buf, uint8_t type) {
  buf[0] = kMagic0;
  buf[1] = kMagic1;
  buf[2] = kVersion;
  buf[3] = type;
  seq_++;
  buf[4] = seq_ & 0xFF;
  buf[5] = seq_ >> 8;
  return kHdr;
}

static uint8_t putPeerList(uint8_t* p) {
  p[0] = peerCount_;
  for (uint8_t i = 0; i < peerCount_; i++) memcpy(p + 1 + i * 6, peers_[i].mac, 6);
  return 1 + peerCount_ * 6;
}

static void transmit(const uint8_t* buf, uint8_t len) {
  if (radioOn_) esp_now_send(kBroadcast, buf, len);
}

// Queue a repeated command. A newer command of the same kind for the same
// target replaces the older one, so a dragged slider doesn't back up.
static void burst(uint8_t type, const uint8_t* payload, uint8_t len,
                  const uint8_t* target = kBroadcast) {
  uint8_t slot = queued_;
  for (uint8_t i = 0; i < queued_; i++)
    if (queue_[i].type == type && memcmp(queue_[i].target, target, 6) == 0) slot = i;
  if (slot >= 4) slot = 3;
  if (slot == queued_) queued_++;
  Burst& b = queue_[slot];
  b.type = type;
  memcpy(b.target, target, 6);
  b.len = putHeader(b.buf, type);
  memcpy(b.buf + b.len, payload, len);
  b.len += len;
  b.until = 0;
}

// Turn this lamp on or off because the group (or the app) said so.
static void setLamp(bool on) {
  if (on && !lampOn) lampTurnOn();
  else if (!on && lampOn) lampTurnOff(true);
}

static void sendStatusNow() {
  uint8_t buf[kMaxPacket];
  uint8_t n = putHeader(buf, T_STATUS);
  buf[n++] = lampOn;
  buf[n++] = st.level;
  buf[n++] = user.levelCount;
  buf[n++] = user.levels[st.level < user.levelCount ? st.level : 0];
  buf[n++] = st.temp;
  buf[n++] = user.tempCount;
  buf[n++] = lightHasTemp();
  buf[n++] = Power::externalPower() ? 255 : Power::percent();
  memset(buf + n, 0, 24);
  strlcpy((char *)buf + n, userSaved.lampName, 24);
  n += 24;
  transmit(buf, n);
  transmit(buf, n);
}

static void sendSync() {
  uint8_t p[1 + kMaxPeers * 6];
  burst(T_SYNC, p, putPeerList(p));
}

// mask bit i = peer i, bit peerCount_ = this lamp.
static void applyGroupMask(uint16_t mask) {
  uint8_t p[1 + MAX_GROUP * 6];
  uint8_t n = 0;
  for (uint8_t i = 0; i < peerCount_; i++)
    if (mask & (1u << i)) memcpy(p + 1 + (n++) * 6, peers_[i].mac, 6);
  bool me = mask & (1u << peerCount_);
  if (me) memcpy(p + 1 + (n++) * 6, self_, 6);
  p[0] = n;
  setLamp(me);
  allOn_ = (n == peerCount_ + 1);
  if (peerCount_) burst(T_GROUP, p, 1 + n * 6);
}

static void applySet(uint8_t fields, bool on, uint8_t level, uint8_t temp, const char *nm) {
  if ((fields & SET_LEVEL) && level < user.levelCount) st.level = level;
  if ((fields & SET_TEMP) && temp < user.tempCount) st.temp = temp;
  if (fields & (SET_LEVEL | SET_TEMP)) { Leds::startCrossfade(); noteLightChanged(); }
  if (fields & SET_ON) setLamp(on);
  if ((fields & SET_NAME) && nm && nm[0]) {
    UserSettings keep = user;          // save only the name, not unsaved app previews
    user = userSaved;
    strlcpy(user.lampName, nm, sizeof(user.lampName));
    settingsSaveUser();
    user = keep;
    strlcpy(user.lampName, nm, sizeof(user.lampName));
  }
  if ((fields & SET_ON) && !on) allOn_ = false;
  noteActivity();
  statusChanged();
}

// ---------- Receive ----------
static void handle(const Rx& rx) {
  if (rx.len < kHdr || rx.data[0] != kMagic0 || rx.data[1] != kMagic1 ||
      rx.data[2] != kVersion)
    return;
  uint8_t type = rx.data[3];
  uint16_t seq = rx.data[4] | (rx.data[5] << 8);
  const uint8_t* p = rx.data + kHdr;
  uint8_t len = rx.len - kHdr;
  if (type == 0 || type >= T_COUNT || isSelf(rx.mac)) return;

  if (type == T_PAIR) {
    if (!pairing_) return;
    bool added = addPeer(rx.mac);
    added |= mergeList(p, len);
    if (added) {
      savePeers();
      LOG("Paired: %u other lamp(s) in the group", peerCount_);
      Leds::overlay(OV_BLINK, 1000, 2);
      pairingBlinkUntil_ = (millis() + 1000) | 1;
      sendSync();  // lamps already in our group learn about the newcomers
    }
    return;
  }

  int from = findPeer(rx.mac);
  if (from < 0) return;  // not one of ours

  if (type != T_STATUS) {  // drop the repeats of a burst we already acted on
    if (seqValid_[from][type] && lastSeq_[from][type] == seq) return;
    seqValid_[from][type] = true;
    lastSeq_[from][type] = seq;
  }

  switch (type) {
    case T_SYNC:
      if (mergeList(p, len)) savePeers();
      break;

    case T_GROUP: {
      if (len < 1 || len < 1 + p[0] * 6) return;
      bool me = false;
      for (uint8_t i = 0; i < p[0]; i++) me |= isSelf(p + 1 + i * 6);
      setLamp(me);
      noteActivity();
      allOn_ = (p[0] == peerCount_ + 1);
      comboStep_ = 0;
      lastGroupTap_ = 0;
      keepAwake(STAY_AWAKE_MS);  // more taps are probably coming
      statusChanged();
      break;
    }

    case T_SET:
      if (len < 10 + 24 || !isSelf(p)) return;
      {
        char nm[24];
        memcpy(nm, p + 10, 24);
        nm[23] = 0;
        applySet(p[6], p[7], p[8], p[9], nm);
      }
      keepAwake(STAY_AWAKE_MS);
      break;

    case T_KICK:
      if (len < 6) return;
      if (isSelf(p)) {
        peerCount_ = 0;
        savePeers();
        LOG("Removed from the group by another lamp");
        Power::ledPower(true);
        Leds::overlay(OV_BLINK, 1500, 3);
      } else if (removePeer(p)) {
        savePeers();
      }
      break;

    case T_LEAVE:
      if (removePeer(rx.mac)) savePeers();
      break;

    case T_QUERY:
      statusAt_ = millis() + 10 + (esp_random() % 150);  // don't all answer at once
      keepAwake(300);
      break;

    case T_STATUS: {
      if (len < 8 + 24) return;
      Peer& pr = peers_[from];
      pr.known = true;
      pr.on = p[0];
      pr.level = p[1];
      pr.levelCount = p[2];
      pr.levelPct = p[3];
      pr.temp = p[4];
      pr.tempCount = p[5];
      pr.hasTemp = p[6];
      pr.battPct = p[7];
      memcpy(pr.name, p + 8, 24);
      pr.name[23] = 0;
      pr.seen = millis();
      if (!pr.on) allOn_ = false;
      break;
    }
  }
}

static void onReceive(const esp_now_recv_info_t* info, const uint8_t* data, int len) {
  const uint8_t* mac = info->src_addr;
  if (len < kHdr || len > kMaxPacket) return;
  Rx rx;
  memcpy(rx.mac, mac, 6);
  rx.len = len;
  memcpy(rx.data, data, len);
  xQueueSend(rxQueue_, &rx, 0);
}

// ---------- Public ----------
void restart() {
  esp_now_deinit();
  esp_wifi_set_channel(RADIO_CHANNEL, WIFI_SECOND_CHAN_NONE);
  esp_now_init();
  esp_now_register_recv_cb(onReceive);
  esp_now_peer_info_t bc = {};
  memcpy(bc.peer_addr, kBroadcast, 6);
  bc.channel = 0;
  bc.ifidx = WIFI_IF_STA;
  esp_now_add_peer(&bc);
}

void begin() {
  rxQueue_ = xQueueCreate(8, sizeof(Rx));
  prefs.begin("group", false);

  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  esp_wifi_get_mac(WIFI_IF_STA, self_);
  radioOn_ = true;
  restart();

  uint8_t blob[kMaxPeers * 6];
  size_t n = prefs.getBytes("peers", blob, sizeof(blob));
  for (size_t i = 0; i + 6 <= n; i += 6) addPeer(blob + i);

  seq_ = (uint16_t)esp_random();
}

void radio(bool on) {
  if (on == radioOn_) return;
  if (on) {
    esp_wifi_start();
    esp_wifi_set_channel(RADIO_CHANNEL, WIFI_SECOND_CHAN_NONE);
  } else {
    esp_wifi_stop();
  }
  radioOn_ = on;
}
bool radioIsOn() { return radioOn_; }

bool busy() { return queued_ > 0 || statusAt_ != 0; }
bool wantsAwake() { return (int32_t)(awakeUntil_ - millis()) > 0; }
void keepAwake(uint32_t ms) {
  uint32_t until = millis() + ms;
  if ((int32_t)(until - awakeUntil_) > 0) awakeUntil_ = until;
}

const uint8_t* selfMac() { return self_; }

uint8_t peerCount() { return peerCount_; }
const Peer& peer(uint8_t i) { return peers_[i]; }

void startPairing() {
  pairing_ = true;
  pairingStart_ = millis();
  lastBeacon_ = 0;
  pairingBlinkUntil_ = 0;
  Power::ledPower(true);
  Leds::overlay(OV_PAIRING, 0);
  LOG("Pairing mode");
}
void stopPairing() {
  if (!pairing_) return;
  pairing_ = false;
  if (Leds::overlayActive() == OV_PAIRING) Leds::clearOverlay();
  LOG("Pairing mode ended");
}
bool pairing() { return pairing_; }

void leaveGroup() {
  LOG("Leaving the group");
  if (peerCount_) burst(T_LEAVE, nullptr, 0);
  peerCount_ = 0;
  savePeers();
}

void kick(const uint8_t* mac) {
  if (isSelf(mac)) return leaveGroup();
  burst(T_KICK, mac, 6, mac);
  if (removePeer(mac)) savePeers();
}

void groupTap() {
  if (!peerCount_) {  // not paired with anything: just act on this lamp
    setLamp(!lampOn);
    return;
  }
  uint8_t n = peerCount_ + 1;
  uint32_t now = millis();
  bool fresh = lastGroupTap_ == 0 || elapsedMs(lastGroupTap_, now) > GROUP_RESTART_MS;
  if (fresh) comboStep_ = (allOn_ && lampOn) ? comboCount(n) - 1 : 0;
  else comboStep_ = (comboStep_ + 1) % comboCount(n);
  lastGroupTap_ = now ? now : 1;
  applyGroupMask(comboAt(n, comboStep_));
  statusChanged();
}

void groupAll(bool on) {
  comboStep_ = 0;
  lastGroupTap_ = 0;
  applyGroupMask(on ? (uint16_t)((1u << (peerCount_ + 1)) - 1) : 0);
  statusChanged();
}

void sendSet(const uint8_t* mac, uint8_t fields, bool on, uint8_t level, uint8_t temp, const char* nm) {
  if (isSelf(mac)) return applySet(fields, on, level, temp, nm);
  int at = findPeer(mac);
  if (at < 0) return;
  uint8_t p[10 + 24] = {0};
  memcpy(p, mac, 6);
  p[6] = fields;
  p[7] = on;
  p[8] = level;
  p[9] = temp;
  if (nm) strlcpy((char*)p + 10, nm, 24);
  burst(T_SET, p, sizeof(p), mac);
  // Show the change in the app straight away; the lamp's own report follows.
  Peer& pr = peers_[at];
  if (fields & SET_ON) pr.on = on;
  if (fields & SET_LEVEL) pr.level = level;
  if (fields & SET_TEMP) pr.temp = temp;
  if ((fields & SET_NAME) && nm) strlcpy(pr.name, nm, sizeof(pr.name));
  if ((fields & SET_ON) && !on) allOn_ = false;
}

void query() {
  if (peerCount_) burst(T_QUERY, nullptr, 0);
}

void statusChanged() {
  if (!lampOn) allOn_ = false;
  if (peerCount_ && !statusAt_) statusAt_ = (millis() + 80) | 1;
}

void update(uint32_t now) {
  Rx rx;
  while (xQueueReceive(rxQueue_, &rx, 0)) handle(rx);

  if (pairing_) {
    // after the "paired" blinks, go back to pulsing until pairing mode ends
    if (pairingBlinkUntil_ && (int32_t)(now - pairingBlinkUntil_) >= 0) {
      pairingBlinkUntil_ = 0;
      Leds::overlay(OV_PAIRING, 0);
    }
    if (elapsedMs(pairingStart_, now) > PAIR_WINDOW_MS) {
      stopPairing();
    } else if (radioOn_ && now - lastBeacon_ >= 150) {
      lastBeacon_ = now;
      uint8_t buf[kMaxPacket];
      uint8_t n = putHeader(buf, T_PAIR);
      n += putPeerList(buf + n);
      transmit(buf, n);
    }
  }

  if (!radioOn_) return;  // the main loop turns it on when busy()

  if (statusAt_ && (int32_t)(now - statusAt_) >= 0) {
    statusAt_ = 0;
    sendStatusNow();
  }

  if (queued_) {
    Burst& b = queue_[0];
    if (!b.until) b.until = (now + BURST_MS) | 1;
    if (now - lastTx_ >= BURST_GAP_MS) {
      lastTx_ = now;
      transmit(b.buf, b.len);
    }
    if ((int32_t)(now - b.until) >= 0) {
      queued_--;
      memmove(&queue_[0], &queue_[1], queued_ * sizeof(Burst));
    }
  }
}

}  // namespace Net

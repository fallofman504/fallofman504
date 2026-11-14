// ESP-NOW group: pairing, group commands, status sharing.
#pragma once
#include <Arduino.h>

namespace net {

// Another lamp in this lamp's group, with the last state it reported.
struct Peer {
  uint8_t mac[6];
  bool known;        // has reported at least once since boot
  bool on;
  uint8_t bri, cct;
  bool hasCct;
  uint16_t mv;       // battery millivolts, 0 = not measured
  char name[17];
  uint32_t seen;     // millis() of last report
};

// Which fields a "set" command carries.
enum : uint8_t { SET_ON = 1, SET_BRI = 2, SET_CCT = 4, SET_NAME = 8 };

void begin();
void loop();
void restart();             // re-init ESP-NOW after a WiFi mode change

void radio(bool on);
bool radioIsOn();
bool busy();                // something waiting to be transmitted
bool wantsAwake();          // recently heard from the group; keep listening
void keepAwake(uint32_t ms);

const uint8_t* selfMac();
const char* name();
void setName(const char* n);
void setBatteryMv(uint16_t mv);
uint16_t batteryMv();

uint8_t peerCount();
const Peer& peer(uint8_t i);

void startPairing();
void stopPairing();
bool pairing();
void leaveGroup();          // forget everyone, and tell them to forget this lamp
void kick(const uint8_t* mac);  // remove another lamp from the group

void groupTap();            // the group button: all on, then step through combinations
void groupAll(bool on);
void sendSet(const uint8_t* mac, uint8_t fields, bool on, uint8_t bri, uint8_t cct,
             const char* name);
void query();               // ask every lamp to report
void statusChanged();       // this lamp's state changed; tell the group

}  // namespace net

# The Pico as a signing device on the network. Boot loop (main.py runs it).
#
# Polls the dApp's queue over WiFi. Two kinds of request:
#   sign     show text + keccak, sign on A               (the "did a real chip sign this" demo)
#   harvest  show "5 CROPS to 0x..", sign on A           (the Crops contract's harvest digest)
# Between requests the screen is the crops field: five plants growing from the chip's last harvest to its
# next allowed one, both read from the contract by the server. The device never trusts a digest from the
# network: for a harvest it rebuilds keccak256(abi.encode(DOMAIN, chainid, contract, keyId, to, deadline,
# nonce)) itself from the fields it puts on the screen.
#
# secrets.py on the board: WIFI_SSID, WIFI_PASS, TRUSTM_RELAY (the laptop running `yarn start`,
# e.g. "http://192.168.68.63:3000").
import gc
import sys
import time

import network
import requests

import farm
import trustm
import ui
from keccak import keccak256
from lcd import WHITE, GREY, YELLOW, RED, GREEN

try:
    import secrets
except ImportError:
    secrets = None

N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551
SPKI = bytes.fromhex("3059301306072a8648ce3d020106082a8648ce3d03010703420004")
DOMAIN = keccak256(b"CROPS.harvest.v1")
POLL_MS = 1000
FARM_EVERY_MS = 30000
VERDICT_WAIT_MS = 180000       # a mainnet tx from the user's wallet can take a while

relay = getattr(secrets, "TRUSTM_RELAY", None) if secrets else None
chip_xy = None                 # ("0x..", "0x..")
ip = "-"
field = None                   # last /api/farm answer
field_at = 0                   # ticks when it arrived


def wifi(timeout_s=20):
    global ip
    w = network.WLAN(network.STA_IF)
    w.active(True)
    if not w.isconnected() and secrets:
        w.connect(secrets.WIFI_SSID, secrets.WIFI_PASS)
        t0 = time.ticks_ms()
        while not w.isconnected() and time.ticks_diff(time.ticks_ms(), t0) < timeout_s * 1000:
            time.sleep_ms(200)
    ip = w.ifconfig()[0] if w.isconnected() else "-"
    return w.isconnected()


def chip_key():
    """(x, y) of the factory key, read from the certificate in E0E0."""
    global chip_xy
    if chip_xy is None:
        trustm.bus()
        s = trustm.Session()
        der = s.get_all(0xE0E0)
        i = der.find(SPKI) + 27
        chip_xy = ("0x" + der[i:i + 32].hex(), "0x" + der[i + 32:i + 64].hex())
    return chip_xy


def _json(method, path, body=None):
    f = requests.post if method == "POST" else requests.get
    r = f(relay + path, json=body, timeout=8) if body is not None else f(relay + path, timeout=8)
    try:
        return r.json() if r.status_code < 300 else {}
    finally:
        r.close()


# ------------------------------------------------------------------ screens between requests
def status(note="", c=GREY):
    ui._init()
    d = ui.d
    ui._header("READY", GREEN)
    d.center_text("waiting for the website", 60, WHITE)
    d.text("relay", 6, 110, GREY)
    d.text((relay or "no TRUSTM_RELAY")[:28], 6, 122, WHITE)
    d.text("pico", 6, 142, GREY)
    d.text(ip, 6, 154, WHITE)
    if chip_xy:
        d.text("chip", 6, 174, GREY)
        d.text(chip_xy[0][:28], 6, 186, WHITE)
    if note:
        d.text(note[:29], 6, 224, c)
    d.show()


def idle(note="", c=GREY):
    """The field when the server knows the chip, the plain status page otherwise. True when A would harvest."""
    if not field:
        status(note, c)
        return False
    now = field["now"] + time.ticks_diff(time.ticks_ms(), field_at) // 1000
    st = farm.stage(now, field["lastHarvest"], field["nextHarvest"])
    ready = st >= 5 and now >= field["nextHarvest"]
    if ready and not field.get("to"):
        note, c = note or "connect a wallet on the page", GREY
    farm.draw(ui.d, st, now, field["nextHarvest"], field["nonce"], note, c)
    return ready and bool(field.get("to"))


def refresh_field():
    global field, field_at
    x, y = chip_key()
    f = _json("GET", "/api/farm?x=%s&y=%s" % (x, y))
    if "now" in f:
        field, field_at = f, time.ticks_ms()


# ------------------------------------------------------------------ requests
def u256(n):
    return int(n).to_bytes(32, "big")


def addr32(a):
    """An address as a left-padded 32-byte abi word (MicroPython bytes has no rjust)."""
    return b"\x00" * 12 + bytes.fromhex(a[2:])


def harvest_digest(chain_id, contract, key_id, to, deadline, nonce):
    """keccak256(abi.encode(bytes32,uint256,address,bytes32,address,uint256,uint256)), same as Crops.sol."""
    return keccak256(DOMAIN + u256(chain_id) + addr32(contract) + key_id + addr32(to) + u256(deadline) + u256(nonce))


def sign_it(digest):
    trustm.bus()
    s = trustm.Session()
    r, sg = s.sign(0xE0F0, digest)
    if sg > N // 2:
        sg = N - sg
    return r, sg


def post_sig(rid, r, s):
    x, y = chip_key()
    _json("POST", "/api/sign/" + rid, {"r": "0x%064x" % r, "s": "0x%064x" % s, "chipX": x, "chipY": y})


def wait_verdict(rid):
    t0 = time.ticks_ms()
    while time.ticks_diff(time.ticks_ms(), t0) < VERDICT_WAIT_MS:
        st = _json("GET", "/api/sign/" + rid)
        if "verdict" in st and st["verdict"] is not None:
            return st
        time.sleep_ms(POLL_MS)
    return None


def handle_sign(req):
    rid, text, digest = req["id"], req["message"], bytes.fromhex(req["hash"][2:])
    rs = ui.run(text, digest, timeout_ms=300000)
    if rs is None:
        _json("POST", "/api/sign/" + rid, {"refused": True})
        time.sleep(2)
        return
    post_sig(rid, *rs)
    st = wait_verdict(rid)
    ui.verdict(text, bool(st and st["verdict"]))
    time.sleep(8)


def handle_harvest(req):
    rid, to = req["id"], req["to"]
    x, y = chip_key()
    key_id = keccak256(bytes.fromhex(x[2:]) + bytes.fromhex(y[2:]))
    digest = harvest_digest(req["chainId"], req["contract"], key_id, to, req["deadline"], req["nonce"])
    text = "HARVEST 5 CROPS to %s..%s" % (to[:8], to[-4:])
    rs = ui.run(text, digest, timeout_ms=300000)
    if rs is None:
        _json("POST", "/api/sign/" + rid, {"refused": True})
        time.sleep(2)
        return
    post_sig(rid, *rs)
    ui.busy(text)
    ui.d.center_text("waiting for the wallet tx", 190, YELLOW)
    ui.d.show()
    st = wait_verdict(rid)
    if st and st["verdict"]:
        farm.harvested(ui.d, st.get("tx"))
    else:
        farm.failed(ui.d, (st or {}).get("error") or "no confirmation")
    refresh_field()


def start_harvest():
    """A pressed on a full field: ask the queue for a harvest request for the connected wallet, then handle it."""
    x, y = chip_key()
    req = _json("POST", "/api/sign", {"kind": "harvest", "to": field["to"], "chipX": x, "chipY": y})
    if req.get("id"):
        return req
    idle((req.get("error") or "could not start harvest")[:29], RED)
    time.sleep(3)
    return None


def run():
    ui._init()
    status("joining wifi...", YELLOW)
    ok = wifi()
    status("" if ok else "wifi failed", GREY if ok else RED)
    try:
        chip_key()
    except Exception as e:
        status("chip: %s" % e, RED)
        time.sleep(3)
    seen = set()
    last_farm = -FARM_EVERY_MS
    while True:
        try:
            if relay:
                if time.ticks_diff(time.ticks_ms(), last_farm) > FARM_EVERY_MS:
                    refresh_field()
                    last_farm = time.ticks_ms()
                req = _json("GET", "/api/sign")
                if req.get("id") and req["id"] not in seen:
                    seen.add(req["id"])
                    (handle_harvest if req.get("kind") == "harvest" else handle_sign)(req)
                ready = idle()
                ui.keys.pressed()                              # drop stale edges
                for _ in range(POLL_MS // 50):                 # watch A while the field is on screen
                    if ready and "A" in ui.keys.pressed():
                        req = start_harvest()
                        if req:
                            seen.add(req["id"])
                            handle_harvest(req)
                        break
                    time.sleep_ms(50)
                continue
        except Exception as e:
            try:
                with open("error.log", "a") as f:                # the screen only has room for one line
                    sys.print_exception(e, f)
            except Exception:
                pass
            idle(("err %s" % e)[:29], RED)
        gc.collect()
        time.sleep_ms(POLL_MS)

#!/usr/bin/env python3
"""Talk to the Trust M through a Pico running firmware/trustm.py.

  tools/chip.py ui ["text"]     show the text on the Pico's screen, sign it when A is pressed, check the
                                signature on mainnet, put the verdict on the screen, open the dApp with it
                                (default text "hello world"; --auto skips the button, for tests)
  tools/chip.py sign "text"     sign keccak256(text) with the factory key E0F0; prints JSON for the dApp
  tools/chip.py sign 0x<hash>   sign a 32-byte hash
  tools/chip.py cert            factory certificate: issuer, key, and the attest() arguments as JSON
  tools/chip.py uid             coprocessor UID

Needs mpremote (pip install mpremote) and the Pico on USB. Pin the port with PICO_PORT=/dev/cu.usbmodemXXXX.
The mainnet check needs ALCHEMY_API_KEY in the environment or packages/foundry/.env.
"""
import glob, json, os, re, subprocess, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
FIRMWARE = [os.path.join(HERE, "..", "firmware", f) for f in ("trustm.py", "lcd.py", "ui.py")]
FOUNDRY_ENV = os.path.join(HERE, "..", "packages", "foundry", ".env")
SPKI = bytes.fromhex("3059301306072a8648ce3d020106082a8648ce3d03010703420004")
N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551
CONTRACT = "0xC868770aFA2a7b7975c1a7d7Ec2fc979bbe4AB99"
DAPP = "https://clawd-trust-m.vercel.app"


def port():
    p = os.environ.get("PICO_PORT") or (glob.glob("/dev/cu.usbmodem*") + glob.glob("/dev/ttyACM*") + [None])[0]
    if not p:
        sys.exit("no Pico on USB (set PICO_PORT)")
    return p


def run(code, timeout=None):
    """Copy the firmware over and run code on the Pico, in one mpremote process."""
    cmd = ["mpremote", "connect", port(), "resume", "cp", *FIRMWARE, ":", "+", "exec",
           "import sys\nfor m in ('trustm', 'ui'): sys.modules.pop(m, None)\n"
           # the picowallet loop (main.py on Austin's Pico) polls an ATECC608 on the same I2C bus; stop it
           "w = sys.modules.get('wallet')\n"
           "if w and getattr(w, 'timer', None):\n    w.stop()\n"
           "import trustm; trustm.bus(); s = trustm.Session()\n" + code]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if r.returncode:
        sys.exit(r.stderr.strip() or r.stdout.strip())
    lines = [l[4:] for l in r.stdout.splitlines() if l.startswith("OUT ")]
    if not lines:
        sys.exit("no output from the Pico:\n" + r.stdout + r.stderr)
    return lines[-1].strip()


def tlv(b, i):
    t, n, j = b[i], b[i + 1], i + 2
    if n & 0x80:
        k = n & 0x7F
        n, j = int.from_bytes(b[j:j + k], "big"), j + k
    return t, j, n


def keccak(data):
    try:
        from eth_hash.auto import keccak as k
        return k(data)
    except ImportError:
        pass
    try:
        from Crypto.Hash import keccak as k
        return k.new(digest_bits=256, data=data).digest()
    except ImportError:
        sys.exit("pip install eth-hash[pycryptodome]  (for keccak256)")


def parse_cert(raw):
    der = raw[9:9 + int.from_bytes(raw[6:9], "big")] if raw[0] == 0xC0 else raw   # strip the TLS identity wrapper
    _, tbs_start, n = tlv(der, 0)
    _, j, n = tlv(der, tbs_start)
    tbs_len = j - tbs_start + n
    i = tbs_start + tbs_len
    _, j, n = tlv(der, i)                       # signatureAlgorithm
    _, j, n = tlv(der, j + n)                   # BIT STRING
    sig = der[j + 1:j + n]
    _, j, _ = tlv(sig, 0)
    _, jr, nr = tlv(sig, j)
    _, js, ns = tlv(sig, jr + nr)
    r, sg = int.from_bytes(sig[jr:jr + nr], "big"), int.from_bytes(sig[js:js + ns], "big")
    pk = der.find(SPKI)
    assert tbs_start <= pk < tbs_start + tbs_len, "no uncompressed P-256 key in the TBS"
    x, y = der[pk + 27:pk + 59], der[pk + 59:pk + 91]
    issuer = subject = "?"
    try:
        out = subprocess.run(["openssl", "x509", "-inform", "der", "-noout", "-issuer", "-subject", "-serial"],
                             input=der, capture_output=True).stdout.decode()
        issuer = re.search(r"issuer=(.*)", out).group(1)
        subject = re.search(r"subject=(.*)", out).group(1)
    except Exception:
        pass
    return {
        "issuer": issuer, "subject": subject,
        "chipX": "0x" + x.hex(), "chipY": "0x" + y.hex(),
        "attest": {"cert": "0x" + der.hex(), "tbsStart": tbs_start, "tbsLen": tbs_len, "pkOffset": pk,
                   "r": "0x%064x" % r, "s": "0x%064x" % sg},
    }


def cert():
    return parse_cert(bytes.fromhex(run("print('OUT', s.get_all(0xE0E0).hex())")))


def sig_json(msg, h, r, sg, c):
    if sg > N // 2:
        sg = N - sg
    return {"message": msg, "hash": "0x" + h.hex(), "r": "0x%064x" % r, "s": "0x%064x" % sg,
            "chipX": c["chipX"], "chipY": c["chipY"]}


def sign(msg):
    h = bytes.fromhex(msg[2:]) if msg.startswith("0x") and len(msg) == 66 else keccak(msg.encode())
    out = run("r, sg = s.sign(0xE0F0, bytes.fromhex('%s')); print('OUT', '%%064x%%064x' %% (r, sg))" % h.hex())
    return sig_json(msg, h, int(out[:64], 16), int(out[64:], 16), cert())


def rpc_url():
    key = os.environ.get("ALCHEMY_API_KEY")
    if not key and os.path.exists(FOUNDRY_ENV):
        m = re.search(r"^ALCHEMY_API_KEY=(\S+)", open(FOUNDRY_ENV).read(), re.M)
        key = m and m.group(1)
    return "https://eth-mainnet.g.alchemy.com/v2/" + key if key else None


def is_chip_signature(sig):
    """eth_call TrustMAttest.isChipSignature on mainnet. None when there is no RPC key."""
    url = rpc_url()
    if not url:
        return None
    data = "0x" + keccak(b"isChipSignature(bytes32,bytes32,bytes32,bytes32,bytes32)")[:4].hex() + "".join(
        sig[k][2:].rjust(64, "0") for k in ("chipX", "chipY", "hash", "r", "s"))
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "eth_call",
                       "params": [{"to": CONTRACT, "data": data}, "latest"]}).encode()
    req = urllib.request.Request(url, body, {"Content-Type": "application/json"})
    res = json.load(urllib.request.urlopen(req, timeout=30))
    if "error" in res:
        sys.exit("rpc: %s" % res["error"])
    return int(res["result"], 16) == 1


def ui(msg="hello world", auto=False):
    h = keccak(msg.encode())
    out = run("import ui\nr = ui.run(%r, bytes.fromhex('%s'), autosign=%r)\n"
              "print('OUT', 'refused' if r is None else '%%064x%%064x' %% r + ' ' + s.get_all(0xE0E0).hex())"
              % (msg, h.hex(), auto), timeout=330)
    if out == "refused":
        sys.exit("refused on the Pico, nothing signed")
    rs, raw = out.split(" ")
    sig = sig_json(msg, h, int(rs[:64], 16), int(rs[64:], 16), parse_cert(bytes.fromhex(raw)))
    ok = is_chip_signature(sig)
    print(json.dumps(sig, indent=2))
    print("mainnet isChipSignature:", "no RPC key, skipped" if ok is None else ok, file=sys.stderr)
    if ok is not None:
        time.sleep(1)                                # let the Pico's USB settle between two mpremote runs
        run("import ui\nui.verdict(%r, %r)\nprint('OUT', 'shown')" % (msg, ok))
    url = DAPP + "/#sig=" + urllib.parse.quote(json.dumps(sig, separators=(",", ":")), safe="")
    print(url, file=sys.stderr)
    if sys.platform == "darwin" and not os.environ.get("CHIP_NO_OPEN"):
        subprocess.run(["open", url])
    return sig


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["uid"]:
        print(run("print('OUT', s.get(0xE0C2).hex())"))
    elif a[:1] == ["cert"]:
        print(json.dumps(cert(), indent=2))
    elif len(a) == 2 and a[0] == "sign":
        print(json.dumps(sign(a[1]), indent=2))
    elif a[:1] == ["ui"]:
        auto = "--auto" in a
        rest = [x for x in a[1:] if x != "--auto"]
        ui(rest[0] if rest else "hello world", auto)
    else:
        sys.exit(__doc__)

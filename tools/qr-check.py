"""Decode tools/qr-dump.ts output with OpenCV to prove the encoder's QR codes are scannable."""
import json, sys, cv2, numpy as np
bad = 0
for s in json.load(open(sys.argv[1] if len(sys.argv) > 1 else "/tmp/qr-samples.json")):
    m = np.array(s["matrix"], dtype=np.uint8)
    img = np.pad((1 - m) * 255, 4, constant_values=255).astype(np.uint8)  # 4-module quiet zone
    img = cv2.resize(img, None, fx=8, fy=8, interpolation=cv2.INTER_NEAREST)
    text, pts, _ = cv2.QRCodeDetector().detectAndDecode(img)
    ok = text == s["text"]
    bad += not ok
    print(("OK  " if ok else "FAIL"), f"v{(m.shape[0]-17)//4}", len(s["text"].encode()), "bytes")
sys.exit(1 if bad else 0)

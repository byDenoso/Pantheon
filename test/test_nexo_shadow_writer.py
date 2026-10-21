"""Unit tests for legacy and plain-text SHADOW writer ingress."""
import base64
import json
import unittest
from scripts import nexo_shadow_writer as w

ID = "S2-SHADOW-WRITER-TEST-20261020"

def encode(tab="MURAL", text="NO_OP"):
    values = (["2026-10-20T15:30:40-03:00","S2","P",text,"RESULTADOS!223","BLOQUEIO","",ID]
      if tab == "MURAL" else ["2026-10-20T15:30:40-03:00","S2","R3-3.1",ID,text,"QA","0","BIND","ROADMAP!17","RESULTADOS!223"])
    d = {"contract":"NEXO_SHADOW_ROW_V1","stable_id":ID,"tab":tab,"values":values}
    return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")

def plain(tab="MURAL", text="NO_OP", state=""):
    values = (["2026-10-20T15:30:40-03:00","S2","P",text,"RESULTADOS!223","BLOQUEIO","",ID]
      if tab == "MURAL" else ["2026-10-20T15:30:40-03:00","S2","R3-3.1",ID,text,"QA","0","BIND","ROADMAP!17","RESULTADOS!223"])
    return [ID,"2026-10-20T15:30:40-03:00","S2",tab,*values,*[""]*(10-len(values)),state]

class TestWriter(unittest.TestCase):
    def test_valid_legacy_mural(self):
        d=w.decode(ID,encode())
        self.assertEqual(w.append_request(d)["requests"][0]["appendCells"]["sheetId"],1148777660)

    def test_valid_legacy_resultados(self):
        d=w.decode(ID,encode("RESULTADOS"))
        self.assertEqual(w.append_request(d)["requests"][0]["appendCells"]["sheetId"],247327396)

    def test_plain_mural(self):
        d,state=w.decode_plain(plain())
        self.assertEqual(state,"")
        self.assertEqual(d["stable_id"],ID)
        self.assertEqual(len(d["values"]),8)

    def test_plain_resultados(self):
        d,state=w.decode_plain(plain("RESULTADOS"))
        self.assertEqual(state,"")
        self.assertEqual(len(d["values"]),10)
        self.assertEqual(d["values"][3],ID)

    def test_plain_state(self):
        d,state=w.decode_plain(plain(state="CLAIMED:abcd"))
        self.assertEqual(d["tab"],"MURAL")
        self.assertEqual(state,"CLAIMED:abcd")

    def test_plain_trailing_rejected(self):
        row=plain()
        row[12]="unexpected"
        with self.assertRaises(ValueError):
            w.decode_plain(row)

    def test_oversize_target_append(self):
        with self.assertRaises(ValueError):
            w.append_request(w.decode(ID,encode(text="x"*2000)))

    def test_legacy_non_shadow_skipped(self):
        b=base64.urlsafe_b64encode(b'{"contract":"NEXO_TOWER_LIVE_V1"}').decode()
        self.assertIsNone(w.decode(ID,b))

    def test_wrong_tab_legacy(self):
        raw=encode()
        d=json.loads(base64.urlsafe_b64decode(raw+"="*(-len(raw)%4)))
        d["tab"]="LOG_CIENTISTA"
        b=base64.urlsafe_b64encode(json.dumps(d).encode()).decode()
        with self.assertRaises(ValueError):
            w.decode(ID,b)

    def test_wrong_tab_plain(self):
        row=plain()
        row[3]="LOG_CIENTISTA"
        with self.assertRaises(ValueError):
            w.decode_plain(row)

    def test_digest_stable(self):
        a,_=w.decode_plain(plain())
        b,_=w.decode_plain(plain())
        self.assertEqual(w.digest_for(a),w.digest_for(b))

if __name__ == "__main__":
    unittest.main()

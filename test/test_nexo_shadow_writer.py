"""Unit tests for the SHADOW writer's bounded, one-way transport."""
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

class TestWriter(unittest.TestCase):
    def test_valid_mural(self):
        d=w.decode(ID,encode())
        a=w.append_request(d)
        self.assertEqual(a["requests"][0]["appendCells"]["sheetId"],1148777660)
    def test_valid_resultados(self):
        d=w.decode(ID,encode("RESULTADOS"))
        self.assertEqual(w.append_request(d)["requests"][0]["appendCells"]["sheetId"],247327396)
    def test_oversize(self):
        with self.assertRaises(ValueError):
            w.append_request(w.decode(ID,encode(text="x"*2000)))
    def test_legacy_skipped(self):
        b=base64.urlsafe_b64encode(b'{"contract":"NEXO_TOWER_LIVE_V1"}').decode()
        self.assertIsNone(w.decode(ID,b))
    def test_wrong_tab(self):
        raw=encode()
        d=json.loads(base64.urlsafe_b64decode(raw+"="*(-len(raw)%4)))
        d["tab"]="LOG_CIENTISTA"
        b=base64.urlsafe_b64encode(json.dumps(d).encode()).decode()
        with self.assertRaises(ValueError):
            w.decode(ID,b)

if __name__ == "__main__":
    unittest.main()

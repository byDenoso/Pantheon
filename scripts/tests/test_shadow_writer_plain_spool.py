import unittest
from scripts import nexo_shadow_writer as w

ID="S2-SHADOW-WRITER-CI-20261020"

def row(tab="MURAL", text="NO_OP", state=""):
    vals=(["2026-10-20T21:25:00-03:00","S2","P",text,"","RESULTADO","",ID]
          if tab=="MURAL" else ["2026-10-20T21:25:00-03:00","S2","R3-3.1",ID,text,"QA","0","BIND","",""])
    return [ID,"2026-10-20T21:25:00-03:00","S2",tab,*vals,*[""]*(10-len(vals)),state]

class PlainSpoolContractTests(unittest.TestCase):
    def test_plain_mural_contract(self):
        data,state=w.decode_plain(row())
        self.assertEqual(state,"")
        self.assertEqual(data["tab"],"MURAL")
        self.assertEqual(data["values"][7],ID)

    def test_plain_resultados_contract(self):
        data,state=w.decode_plain(row("RESULTADOS"))
        self.assertEqual(state,"")
        self.assertEqual(data["tab"],"RESULTADOS")
        self.assertEqual(data["values"][3],ID)

    def test_plain_trailing_cells_fail_closed(self):
        bad=row()
        bad[12]="unexpected"
        with self.assertRaises(ValueError):
            w.decode_plain(bad)

    def test_digest_stable(self):
        a,_=w.decode_plain(row())
        b,_=w.decode_plain(row())
        self.assertEqual(w.digest_for(a),w.digest_for(b))

if __name__=="__main__":
    unittest.main()

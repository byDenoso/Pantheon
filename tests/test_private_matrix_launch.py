import hashlib,importlib.util,io,json,pathlib,tarfile,tempfile,unittest
P=pathlib.Path(__file__).parents[1]/'scripts/private_matrix_launch.py';sp=importlib.util.spec_from_file_location('launch',P);m=importlib.util.module_from_spec(sp);sp.loader.exec_module(m)
class Tests(unittest.TestCase):
 def capsule(self,files):
  b=io.BytesIO()
  with tarfile.open(fileobj=b,mode='w:gz')as t:
   for name,data in files.items():
    item=tarfile.TarInfo(name);item.size=len(data);t.addfile(item,io.BytesIO(data))
  return b.getvalue()
 def test_safe_manifest_hash_readback(self):
  data=b'print("private")\n';manifest={'schema':'nexo.private.capsule.v1','entrypoint':'root/entry.py','files':{'root/entry.py':hashlib.sha256(data).hexdigest()}}
  with tempfile.TemporaryDirectory()as d:
   p=m.extract_capsule(self.capsule({'root/entry.py':data,'capsule_manifest.json':json.dumps(manifest).encode()}),pathlib.Path(d)/'out')
   self.assertEqual(p.read_bytes(),data)
 def test_archive_traversal(self):
  with tempfile.TemporaryDirectory()as d:
   with self.assertRaises(ValueError):m.extract_capsule(self.capsule({'../escape':b'x'}),pathlib.Path(d)/'out')
 def test_wrong_capsule_hash(self):
  manifest={'schema':'nexo.private.capsule.v1','entrypoint':'entry.py','files':{'entry.py':'a'*64}}
  with tempfile.TemporaryDirectory()as d:
   with self.assertRaises(ValueError):m.extract_capsule(self.capsule({'entry.py':b'x','capsule_manifest.json':json.dumps(manifest).encode()}),pathlib.Path(d)/'out')
 def request(self):return dict(schema='nexo.private.b6.launch.v1',campaign='B6',model='peer',replica=1,execution_class='NORMAL_NESTED',numerical_acceptance=dict(historical_gate_passed=False,user_accepted_current_configuration=True),registry_execution_authorized=True,private_publication_authorized=True)
 def test_normal_nested_acceptance_not_relabelled_precision_pass(self):m.validate_request(self.request(),'B6','peer',1)
 def test_reject_pilot_and_fabricated_pass(self):
  for key,value in [('execution_class','PILOT'),('numerical_acceptance',dict(historical_gate_passed=True,user_accepted_current_configuration=True))]:
   r=self.request();r[key]=value
   with self.assertRaises(ValueError):m.validate_request(r,'B6','peer',1)
 def test_wrong_replica_or_unauthorized_publication(self):
  r=self.request();r['private_publication_authorized']=False
  with self.assertRaises(ValueError):m.validate_request(r,'B6','peer',1)
  with self.assertRaises(ValueError):m.validate_request(self.request(),'B6','peer',2)
if __name__=='__main__':unittest.main()

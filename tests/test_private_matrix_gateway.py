import importlib.util
import pathlib
import unittest
from unittest.mock import patch

P=pathlib.Path(__file__).parents[1]/'scripts/private_matrix_gateway.py'
spec=importlib.util.spec_from_file_location('gate',P);g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
H='a'*64
class GateTests(unittest.TestCase):
 def matrix(self):
  return {'schema':'nexo.peer.nested.request_matrix.v2','campaigns':[{'id':'B5','status':'READY_FOR_RUNTIME_SMOKE','alias_of':None,'seeds_peer':[10,20],'baseline_id':'L'}],'lcdm_baselines':{'L':{'status':'READY_FOR_RUNTIME_SMOKE','seeds':[30,40]}}}
 def binding(self):
  return dict(schema='nexo.private.matrix.binding.v1',matrix_sha256=H,campaign='B5',model='peer',reviewed=True,registry_execution_authorized=True,transitive_lock_complete=True,runtime_lock={'python':'3.12.14','cobaya':'3.6.2','camb':'1.6.6','dynesty':'2.1.5','candl-like':'2.0.3'},data_manifest_sha256=H,nuisance_contract_sha256=H,lock_sha256=H)
 def receipt(self):
  d=dict(schema='nexo.private.joint_point.receipt.v1',nonce='nonce',seed=10,matrix_sha256=H,runner_sha256=H,campaign='B5',model='peer',lock_sha256=H,data_manifest_sha256=H,nuisance_contract_sha256=H,loglike=-1.,likelihood_calls=1,sampling_started=False)
  for k in ('real_data','joint_point_evaluated','normalized_likelihood','separate_nuisance_namespaces','priors_included_once','overlap_contract_verified','checkpoint_destination_write_verified','payload_hashes_verified'):d[k]=True
  return d
 def test_selection(self):
  self.assertEqual(g.select(self.matrix(),'B5','peer',2)[1],20)
  self.assertEqual(g.select(self.matrix(),'B5','lcdm',1)[1],30)
 def test_alias_and_blocked(self):
  for field,value in [('alias_of','A3'),('status','BLOCKED_INPUT')]:
   m=self.matrix();m['campaigns'][0][field]=value
   with self.assertRaises(g.GateError):g.select(m,'B5','peer',1)
 def test_replicas(self):
  for n in (0,3,-1):
   with self.assertRaises(g.GateError):g.select(self.matrix(),'B5','peer',n)
 def test_ref_injection(self):
  for ident in ('../../secret','x?alt=media','https://evil.invalid'):
   with self.assertRaises(g.GateError):g.valid_ref({'id':ident,'sha256':H})
 def test_missing_lock(self):
  b=self.binding();b['runtime_lock'].pop('candl-like')
  with self.assertRaises(g.GateError):g.validate_binding(b,H,'B5','peer')
 def test_wrong_matrix(self):
  with self.assertRaises(g.GateError):g.validate_binding(self.binding(),'b'*64,'B5','peer')
 def test_historical_receipt(self):
  with self.assertRaises(g.GateError):g.validate_receipt(self.receipt(),self.binding(),'newnonce',10,H,H)
 def test_nonfinite(self):
  for value in (float('nan'),float('inf'),'0',True):
   r=self.receipt();r['loglike']=value
   with self.assertRaises(g.GateError):g.validate_receipt(r,self.binding(),'nonce',10,H,H)
 def test_missing_science_gates(self):
  for k in ('real_data','normalized_likelihood','priors_included_once','overlap_contract_verified','payload_hashes_verified'):
   r=self.receipt();r[k]=False
   with self.assertRaises(g.GateError):g.validate_receipt(r,self.binding(),'nonce',10,H,H)
 def test_receipt_contract(self):
  g.validate_receipt(self.receipt(),self.binding(),'nonce',10,H,H)
 def test_no_sampler_in_gateway(self):
  text=P.read_text();self.assertNotIn('import dynesty',text);self.assertNotIn('pip install',text)
if __name__=='__main__':unittest.main()

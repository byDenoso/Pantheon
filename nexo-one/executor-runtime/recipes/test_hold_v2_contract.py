"""Software fixtures for the prospective same-bin cosine correction."""
import copy, hashlib, itertools, math, types, unittest
from pathlib import Path
from unittest.mock import patch
import numpy as np
import w0wa_bao_sn_multi as recipe
COMPS=['pantheon_plus','union3']
ZS=[.295,.51,.706,.934,1.321,1.484,2.33]
PARAMS={'mode':'bao_tracer_jackknife','bao_release':'dr2','compilations':COMPS,'tracer_groups':[{'label':str(z),'z':[z]} for z in ZS]}
def historical_source():
    s=Path(recipe.__file__).read_text();a=s.index('def individual_dr2_two_compilation_profile(');b=s.index('def decision_from_holds(',a);s=s[:a]+s[b:]
    s=s.replace('def decision_from_holds(mode, comps, out, params=None):','def decision_from_holds(mode, comps, out):')
    a=s.index('        elif (individual_dr2_two_compilation_profile(params)');b=s.index('        elif successful_compilations>=2:',a);s=s[:a]+s[b:]
    s=s.replace('decision_from_holds(mode, comps, out, params)\n','decision_from_holds(mode, comps, out)\n')
    return ''.join(l for l in s.splitlines(keepends=True) if not l.startswith('     "SAME_BIN_DIRECTION_UNSTABLE":'))
LEGACY=types.ModuleType('historical_recipe');exec(compile(historical_source(),'historical_recipe','exec'),LEGACY.__dict__)
def output(fs=(.2,.2),cs=(.4,.4)):
    return [{'compilation':name,'holds':[{'label':str(z),'fraction_removed':f,'cosine':c,'residual_sigma':2.5} for z in ZS]} for name,f,c in zip(('Pantheon+','Union3'),fs,cs)]
def valid(x): return isinstance(x,(int,float)) and not isinstance(x,bool) and math.isfinite(x)
def decide(rows,params=PARAMS): return recipe.decision_from_holds('bao_tracer_jackknife',COMPS,rows,params)[0]
class ContractTests(unittest.TestCase):
    def test_only_reviewed_diff_changes_historical_bytes(self):
        self.assertEqual(hashlib.sha256(historical_source().encode()).hexdigest(),'61406850e614c3bb7fbd69b7f67adf94c5ea22ffd5323e3882e1baa038c5377b')
    def test_red_historical_green_corrected(self):
        self.assertEqual(LEGACY.decision_from_holds('bao_tracer_jackknife',COMPS,output())[0],'INCONCLUSIVE')
        self.assertEqual(decide(output()),'REJECTED')
        self.assertEqual(recipe.decision_from_holds('bao_tracer_jackknife',COMPS,output())[0],'INCONCLUSIVE')
    def test_boundary_matrix(self):
        fs=[-.1,.2,.5,math.nextafter(.5,math.inf),.7,math.nextafter(.7,math.inf),None,float('nan')];cs=[.4,math.nextafter(.5,-math.inf),.5,.8,math.nextafter(.8,math.inf),None,float('nan')];count=0
        for f1,f2,c1,c2 in itertools.product(fs,fs,cs,cs):
            reject=(valid(f1) and valid(f2) and f1>.7 and f2>.7) or (valid(c1) and valid(c2) and c1<.5 and c2<.5)
            success=all(valid(x) for x in (f1,f2,c1,c2)) and f1<=.5 and f2<=.5 and c1>=.8 and c2>=.8
            self.assertEqual(decide(output((f1,f2),(c1,c2))),'REJECTED' if reject else 'PROMOTED' if success else 'INCONCLUSIVE');count+=1
        self.assertEqual(count,3136)
    def test_same_bin_and_both_compilations(self):
        rows=output((.2,.2),(.9,.9));rows[0]['holds'][0]['cosine']=.4;rows[1]['holds'][1]['cosine']=.4
        self.assertEqual(decide(rows),'INCONCLUSIVE');rows[1]['holds'][0]['cosine']=.4;self.assertEqual(decide(rows),'REJECTED')
    def test_all_bins_success_and_equalities(self):
        rows=output((.5,.5),(.8,.8));self.assertEqual(decide(rows),'PROMOTED');rows[0]['holds'][6]['cosine']=.7;self.assertEqual(decide(rows),'INCONCLUSIVE')
        for f,c,want in [(.7,.8,'INCONCLUSIVE'),(.2,.5,'INCONCLUSIVE'),(.5,.8,'PROMOTED')]:self.assertEqual(decide(output((f,f),(c,c))),want)
    def test_other_profiles_historical_behavior(self):
        profiles=[]
        for key,value in [('bao_release','dr1'),('compilations',['union3']),('compilations',['pantheon_plus','des_sn5yr','union3']),('mode','redshift_jackknife')]:
            p=copy.deepcopy(PARAMS);p[key]=value;profiles.append(p)
        for groups in (PARAMS['tracer_groups'][:-1],[{'label':'group','z':ZS}],[{'label':str(i),'z':[.296]} for i in range(7)]):
            p=copy.deepcopy(PARAMS);p['tracer_groups']=groups;profiles.append(p)
        for p in profiles:
            self.assertFalse(recipe.individual_dr2_two_compilation_profile(p))
            for f,c in itertools.product([.2,.5,.7,.8],[.4,.5,.8,.9]):
                rows=output((f,f),(c,c));self.assertEqual(recipe.decision_from_holds(p['mode'],p['compilations'],rows,p),LEGACY.decision_from_holds(p['mode'],p['compilations'],rows))
    def test_profile_exact_and_priors_untouched(self):
        for prior in ({},{'omega_m':[.315,.007]},{'omega_m':[.33,.01],'a_rd':[30,8]}):
            p=copy.deepcopy(PARAMS);p['priors']=prior;before=copy.deepcopy(p);self.assertTrue(recipe.individual_dr2_two_compilation_profile(p));self.assertEqual(p,before)
        for p in (None,{},dict(PARAMS,tracer_groups=None),dict(PARAMS,tracer_groups=[{'z':[True]}]*7)):self.assertFalse(recipe.individual_dr2_two_compilation_profile(p))
    def test_runner_routes_without_data(self):
        sn={'z':np.zeros(10)};p0={'w0':0.,'wa':0.};p1={'w0':-.6,'wa':math.sqrt(.84)};calls=([(p0,10.)]+[(p1,8.)]*7)*2
        with patch.object(recipe,'load_bao',return_value=object()),patch.object(recipe,'load_pantheon',return_value={**sn,'name':'Pantheon+'}),patch.object(recipe,'load_union3',return_value={**sn,'name':'Union3'}),patch.object(recipe,'sub_bao',return_value=object()),patch.object(recipe,'dchi',side_effect=calls):result=recipe.run(copy.deepcopy(PARAMS))
        self.assertEqual(result['verdict'],'REJECTED');self.assertEqual(result['decision'],'SAME_BIN_DIRECTION_UNSTABLE')
if __name__=='__main__':unittest.main(verbosity=2)

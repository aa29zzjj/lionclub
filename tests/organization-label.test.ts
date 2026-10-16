import {test} from 'node:test';
import assert from 'node:assert/strict';
import {organizationDisplayName} from '../src/lib/organization-label';

test('organization labels separate multiple district/district/region without changing names or IDs',()=>{
 assert.equal(organizationDisplayName({name:'MD300A',level:'md',code:'300A'}),'300A 複合區');
 assert.equal(organizationDisplayName({name:'300A-1 專區',level:'district',code:'300A-1'}),'300A-1 區');
 assert.equal(organizationDisplayName({name:'300A-1 專區'}),'300A-1 區');
 assert.equal(organizationDisplayName({name:'第1專區',level:'region',districtCode:'300A-1'}),'第1專區');
 assert.equal(organizationDisplayName({name:'AI臺科大',level:'club'}),'AI臺科大');
 assert.equal(organizationDisplayName({name:'台北科大',level:'club'}),'台北科大');
});

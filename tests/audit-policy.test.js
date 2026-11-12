'use strict';
const assert=require('node:assert/strict');
const {assess,counts}=require('../scripts/audit-gate');
const make=(moderate=0,high=0,critical=0)=>({metadata:{vulnerabilities:{
  info:0,low:0,moderate,high,critical,total:moderate+high+critical}}});
assert.deepEqual(assess(make(6),make()), {
  ok:true,reasons:[],all:counts(make(6)),prod:counts(make()),moderateDevOnly:6
});
assert.equal(assess(make(6,1),make()).ok,false,'HIGH development must block');
assert.equal(assess(make(6),make(1)).ok,false,'MODERATE production must block');
assert.equal(assess(make(),make()).ok,true);
assert.throws(()=>counts({error:{code:'ENETUNREACH'}}));
assert.throws(()=>assess({},make()));
console.log('Security audit gate decision rules: PASS');

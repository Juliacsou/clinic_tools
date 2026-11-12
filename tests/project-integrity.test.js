'use strict';
const assert=require('node:assert/strict');
const {auditProject,forbiddenControls}=require('../scripts/preflight');
const result=auditProject();
assert.deepEqual(result.errors,[],'Missing/corrupted source, build or diagnostic files');
assert.deepEqual(forbiddenControls(Buffer.from('abc\n\r\t')),[]);
assert.deepEqual(forbiddenControls(Buffer.from('abc\n\r\t'),true),[5]);
assert.deepEqual(forbiddenControls(Buffer.from([97,98,7,99,127])),[2,4]);
console.log('Source integrity, relative imports, HTML, Windows BAT paths, packaged assets and JS syntax: PASS');

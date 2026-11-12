'use strict';
// Logical metric names are deliberately independent of physical Excel columns.
// Historic workbooks and the newer calculator workbook have different layouts.
const FIELDS=[
 {key:'F',label:'Number of New Inquiries',match:/\binquiries\b/},
 {key:'B',label:'Ocular Motor Booked Ahead',match:/\bocular\s+motor\s+booked\s+ahead\b/},
 {key:'C',label:'Perception Tests Booked Ahead',match:/\bpercep\w*\s+tests?\s+booked\s+ahead\b/},
 {key:'D',label:'VT Consults Booked Ahead',match:/\bvt\s+consults?\s+booked\s+ahead\b/},
 {key:'E',label:'VT Pts Scheduled to Start',match:/\bvt\s+pts\s+scheduled\s+to\s+start\b/},
 {key:'G',label:'Ocular Motor Exams Done',match:/\b(?:ocular\s+motor|om)\s+exams?\s+done\b/},
 {key:'H',label:'Percept Test Done',match:/\bpercep\w*\s+tests?\s+done\b/},
 {key:'I',label:'VT Consults Done',match:/\bvt\s+consults?\s+done\b/},
 {key:'J',label:'New VT Starts',match:/\bnew\s+vt\s+starts\b/},
 {key:'K',label:'Total VT Pts Enrolled',match:/\btotal\s+vt\s+pts\s+enrolled\b/},
 {key:'L',label:'Discontinued Patients',match:/\bdiscontinued\s+patients\b/},
 {key:'M',label:'VT Sessions',match:/\bvt\s+sessions\b/},
 {key:'N',label:'VT Closing',match:/\bvt\s+closing\b/},
 {key:'Q',label:'Comments',match:/^comments?$/}
];
const PROTECTED=[
 {key:'O',label:'Total Charges',match:/\btotals?\s+charges\b/},
 {key:'P',label:'Total Income',match:/\btotal\s+income\b/}
];
function normalize(text){return String(text??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z\d]+/gi,' ').toLowerCase().replace(/\s+/g,' ').trim();}
function toLetter(index){let s='';while(index>0){index--;s=String.fromCharCode(65+index%26)+s;index=Math.floor(index/26);}return s;}
function resolve(headers){
 if(!Array.isArray(headers)||headers.length<16)throw new Error('Cannot read the header row of the Weekly worksheet.');
 const indexed=headers.map((value,i)=>({letter:toLetter(i+1),raw:String(value??''),text:normalize(value)})).filter(e=>e.text);
 const first=indexed.find(e=>e.letter==='A');
 if(!first||!/^week ending$/.test(first.text))throw new Error('The selected file does not have Week Ending in the first column of its Weekly worksheet.');
 const map={},labels={},missing=[],ambiguous=[];
 for(const spec of [...FIELDS,...PROTECTED]){
  const hits=indexed.filter(h=>spec.match.test(h.text));
  if(hits.length===1){map[spec.key]=hits[0].letter;labels[spec.key]=hits[0].raw;}
  else if(hits.length>1)ambiguous.push(`${spec.label}: ${hits.map(h=>h.letter).join(', ')}`);
  else if(FIELDS.includes(spec))missing.push(spec.label);
 }
 if(missing.length||ambiguous.length){const parts=[];
  if(missing.length)parts.push('Missing required Weekly headings: '+missing.join(', '));
  if(ambiguous.length)parts.push('Ambiguous headings: '+ambiguous.join('; '));
  throw new Error(parts.join('. ')+'. Check the selected workbook; nothing has been modified.');
 }
 const positions=Object.values(map);
 if(new Set(positions).size!==positions.length)throw new Error('The Weekly worksheet maps multiple indicators to the same column. Nothing has been modified.');
 return {map,labels,layout:map.M==='N'?'classic':map.M==='M'?'compact':'custom'};
}
module.exports={FIELDS,PROTECTED,resolve,normalize,toLetter};

/* The 3 CSV upload fields: a complete weekly export plus two annual Ahead exports. */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.WeeklySlots=api;
})(typeof window==='object'?window:null,function(){
 'use strict';
 const doctor=['VDE Doctor-Tech','VIP Doctor-Tech','VDE Doctor Only','VIP Doctor Only','NP 99203'];
 const slots=[
  {id:'week-all',group:'weekly',title:'This Week - Full Schedule',description:'One complete CSV with all Doctors and Therapists appointments for the selected week.'},
  {id:'ahead-doctors',group:'ahead',title:'Ahead - Doctors',description:'One annual Doctors CSV for Ocular Motor, Perception Tests and VT Consultations (Patient Consultation).',allowed:[...doctor,'Patient Consultation','EP 99213']},
  {id:'ahead-therapists',group:'ahead',title:'Ahead - Therapists',description:'One annual Therapists CSV filtered to Virtual Orientation only.',allowed:['Virtual Orientation'],exclusive:true}
 ];
 const get=id=>slots.find(s=>s.id===id)||null;
 const of=group=>slots.filter(s=>s.group===group);
 function verify(file,id){
  const slot=get(id);if(!slot)throw new Error('Invalid CSV upload field.');
  if(slot.group==='weekly')return true; // All appointment types belong in the combined weekly export.
  const recognized=Object.entries(file?.counts||{}).filter(([,n])=>n?.total>0).map(([type])=>type);
  const wrong=recognized.filter(t=>!slot.allowed.includes(t));
  if(wrong.length)throw new Error('Wrong export for '+slot.title+': unexpected appointment types: '+wrong.join(', ')+'.');
  if(id==='ahead-doctors'&&!recognized.some(t=>doctor.includes(t)))throw new Error('Doctors CSV has no recognized Doctor exam appointments. Confirm that the export includes the medical appointment types.');
  if(id==='ahead-therapists'){
   if(!recognized.includes('Virtual Orientation'))throw new Error('Therapists CSV must contain Virtual Orientation appointments. Check the export filter.');
   if(Object.values(file?.unrecognized||{}).some(n=>n>0))throw new Error('Therapists Ahead CSV must contain only Virtual Orientation appointments. Check the export filter.');
  }
  return true;
 }
 function metricReady(group,col,source){
  if(!source)return false;
  if(group==='weekly')return true;
  // Direct, transient summaries are retained for compatibility with existing calculation tests;
  // older stored four-week imports must be excluded by backend and UI.
  if(source.periodMode!=='annual')return !source.periodMode;
  const slotsPresent=new Set((source.files||[]).map(f=>f.slotId));
  return col==='E'?slotsPresent.has('ahead-therapists'):slotsPresent.has('ahead-doctors');
 }
 return {slots,get,of,verify,metricReady,doctor};
});

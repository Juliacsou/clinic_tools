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
  if(id==='ahead-doctors'){
   // Flexible import: unexpected or unusual appointment types (such as Office Follow-Up or custom clinic types)
   // are ignored for Ahead metrics and must never block the file.
   // Only reject if the file has none of the Doctor exam or Consultation appointment types.
   const hasDoctorOrConsult=recognized.some(t=>doctor.includes(t)||t==='Patient Consultation');
   if(!hasDoctorOrConsult){
    throw new Error('Wrong export for Ahead - Doctors: no Doctor exam or Consultation appointments found. Confirm that you selected the Doctors schedule.');
   }
  }
  if(id==='ahead-therapists'){
   // Flexible import: therapists schedule may contain other types or unrecognized appointments;
   // we only care about extracting Virtual Orientation.
   // Only reject if it contains Doctor medical exam appointments (user selected Doctors CSV instead of Therapists)
   // or has zero Virtual Orientation appointments.
   if(recognized.some(t=>doctor.includes(t))){
    throw new Error('Wrong export for Ahead - Therapists: contains Doctor medical exam appointments. Confirm that you selected the Therapists schedule.');
   }
   if(!recognized.includes('Virtual Orientation')){
    throw new Error('Wrong export for Ahead - Therapists: no Virtual Orientation appointments found. Confirm that the export includes Virtual Orientation.');
   }
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

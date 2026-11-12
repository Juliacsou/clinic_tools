'use strict';
function norm(v){return String(v??'').trim().toLowerCase().replace(/\s+/g,' ')}
function incompleteState(rec){const s=norm(rec.status);if(['scheduled','will not schedule'].includes(s))return 'Completed';if(s==='no answer')return 'No Answer';return 'Follow-up'}
function cancellationState(rec){
  const reason=norm(rec.closureReason),status=norm(rec.followUpStatus),res=norm(rec.rescheduled);
  if(res==='yes'||reason==='rescheduled'||status==='rescheduled')return 'Rescheduled';
  if(['will not reschedule','closed / not interested','not interested','closed'].includes(status)||reason==='will not reschedule')return 'Will Not Reschedule';
  if(reason==='no answer after 3 attempts'||status==='no answer after 3 attempts'||['attempt1At','attempt2At','attempt3At'].every(k=>!!rec[k]))return 'No Answer After 3 Attempts';
  return 'Follow-up';
}
function isCancellationClosed(rec){return cancellationState(rec)!=='Follow-up'}
function nextCancellationAttempt(rec){if(isCancellationClosed(rec))return null;for(let i=1;i<=3;i++){if(!rec['attempt'+i+'At'])return i}return null}
module.exports={incompleteState,cancellationState,isCancellationClosed,nextCancellationAttempt};

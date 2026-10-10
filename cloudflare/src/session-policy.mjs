export async function sessionPolicy(db){
  const row=await db.prepare('SELECT idle_minutes,max_hours FROM session_policy WHERE id=1').first();
  if(!row)throw new Error('Session policy missing');
  return {idleMinutes:row.idle_minutes,maxHours:row.max_hours};
}
export function sessionDeadline(row,policy){return Math.min(row.expires_at,row.created_at+policy.maxHours*3600,row.last_seen+policy.idleMinutes*60);}
export function validateSessionPolicy(value){
  return Number.isInteger(value?.idleMinutes)&&value.idleMinutes>=5&&value.idleMinutes<=480&&Number.isInteger(value.maxHours)&&value.maxHours>=1&&value.maxHours<=24&&value.idleMinutes<=value.maxHours*60;
}

import {createRemoteJWKSet,jwtVerify} from 'jose';
const keySets=new Map();
export async function verifyIdentity(request,env){
  if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.TEAM_DOMAIN||'')||!env.POLICY_AUD)throw new Error('Access configuration required');
  const token=request.headers.get('cf-access-jwt-assertion');
  if(!token)throw new Error('Cloudflare Access required');
  if(!keySets.has(env.TEAM_DOMAIN))keySets.set(env.TEAM_DOMAIN,createRemoteJWKSet(new URL(env.TEAM_DOMAIN+'/cdn-cgi/access/certs')));
  const {payload}=await jwtVerify(token,keySets.get(env.TEAM_DOMAIN),{issuer:env.TEAM_DOMAIN,audience:env.POLICY_AUD,algorithms:['RS256']});
  if(typeof payload.email!=='string'||!Number.isInteger(payload.iat)||!Number.isInteger(payload.exp))throw new Error('User identity required');
  return {email:payload.email.trim().toLowerCase(),iat:payload.iat,exp:payload.exp};
}

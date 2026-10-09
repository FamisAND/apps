import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {verifyIdentity} from '../src/access.mjs';
test('Access validates signatures, audience, issuer and expiry',async()=>{
  const {privateKey,publicKey}=await generateKeyPair('RS256');const jwk=await exportJWK(publicKey);jwk.kid='test-key';jwk.alg='RS256';jwk.use='sig';
  const realFetch=globalThis.fetch;
  globalThis.fetch=async url=>{assert.equal(String(url),'https://fixture.cloudflareaccess.com/cdn-cgi/access/certs');return new Response(JSON.stringify({keys:[jwk]}),{headers:{'Content-Type':'application/json'}});};
  try{
    const env={TEAM_DOMAIN:'https://fixture.cloudflareaccess.com',POLICY_AUD:'fixture-audience'};
    async function token(issuer=env.TEAM_DOMAIN,audience=env.POLICY_AUD,expiry='5m'){return new SignJWT({email:'user@example.test'}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setIssuedAt().setIssuer(issuer).setAudience(audience).setExpirationTime(expiry).sign(privateKey);}
    const request=value=>new Request('https://fixture.test',{headers:{'cf-access-jwt-assertion':value}});
    assert.equal((await verifyIdentity(request(await token()),env)).email,'user@example.test');
    await assert.rejects(()=>token(env.TEAM_DOMAIN,'wrong').then(value=>verifyIdentity(request(value),env)));
    await assert.rejects(()=>token('https://wrong.cloudflareaccess.com').then(value=>verifyIdentity(request(value),env)));
    await assert.rejects(()=>token(env.TEAM_DOMAIN,env.POLICY_AUD,-1).then(value=>verifyIdentity(request(value),env)));
  }finally{globalThis.fetch=realFetch;}
});

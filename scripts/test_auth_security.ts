import assert from 'node:assert/strict';
import { authErrorCode, authErrorMessage, requestPrivatePasswordReset, profileUpdateFields, PASSWORD_RESET_NOTICE } from '../src/lib/authSecurity.ts';

const sent: string[] = [];
assert.equal(await requestPrivatePasswordReset(' fixture@example.invalid ', async address => { sent.push(address); }), PASSWORD_RESET_NOTICE);
assert.deepEqual(sent, ['fixture@example.invalid']);
assert.equal(await requestPrivatePasswordReset('missing@example.invalid', async () => { throw { code: 'auth/user-not-found', message: 'private account details' }; }), PASSWORD_RESET_NOTICE);
for (const code of ['auth/too-many-requests', 'auth/network-request-failed', 'auth/invalid-email']) {
  await assert.rejects(requestPrivatePasswordReset('fixture@example.invalid', async () => { throw { code }; }), (error:any) => error.code === code);
}
assert.equal(authErrorMessage({code:'auth/user-not-found'}),authErrorMessage({code:'auth/wrong-password'}));
for (const code of ['auth/invalid-api-key', 'auth/unauthorized-domain', 'auth/unknown', 'not-a-provider-code']) {
  const error = {code, message:'Bearer private-token fixture@example.invalid', customData:{email:'private'}};
  assert.doesNotMatch(authErrorMessage(error), /private|Bearer|fixture@|API|Firebase/);
}
assert.equal(authErrorCode({code:'private-token'}),'auth/unknown');
assert.deepEqual(profileUpdateFields({name:'Fixture',phone:'',password:'private',token:'private',role:'admin',isAdmin:true,address:{secret:'private'}}),{name:'Fixture',phone:''});
console.log('PASS password recovery does not reveal account existence, provider errors stay private, and profile updates exclude credentials and privilege fields.');

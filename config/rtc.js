const crypto=require('crypto');
// Only the session's participants can request ICE settings. Never send the TURN shared secret.
module.exports=function rtcConfig(userId){
 const iceServers=[];
 const stun=process.env.STUN_URL===undefined?'stun:stun.l.google.com:19302':process.env.STUN_URL;
 if(stun&&/^stuns?:/.test(stun))iceServers.push({urls:stun});
 const urls=(process.env.TURN_URLS||'').split(',').map(s=>s.trim()).filter(s=>/^turns?:/.test(s));
 if(urls.length&&process.env.TURN_SHARED_SECRET){
  const username=Math.floor(Date.now()/1000+3600)+':'+userId;
  const credential=crypto.createHmac('sha1',process.env.TURN_SHARED_SECRET).update(username).digest('base64');
  iceServers.push({urls,username,credential});
 }else if(urls.length&&process.env.TURN_USERNAME&&process.env.TURN_CREDENTIAL){
  iceServers.push({urls,username:process.env.TURN_USERNAME,credential:process.env.TURN_CREDENTIAL});
 }
 return {iceServers,relayConfigured:iceServers.some(s=>(Array.isArray(s.urls)?s.urls:[s.urls]).some(u=>/^turns?:/.test(u)))};
};

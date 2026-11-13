const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');const mongoose=require('mongoose');const http=require('http');const bcrypt=require('bcrypt');const supertest=require('supertest');const {Server}=require('socket.io');const {io:client}=require('socket.io-client');const {MongoMemoryReplSet}=require('mongodb-memory-server');
const createApp=require('../app');const connect=require('../config/db');const service=require('../services/sessionService');
const User=require('../models/User'),Availability=require('../models/Availability'),Request=require('../models/SessionRequest'),Practice=require('../models/PracticeSession'),Chat=require('../models/ChatMessage'),Block=require('../models/Block'),Report=require('../models/Report');
let repl,app,server,store,io,url,learner,helper,outsider,la,ha,oa,offer,rid,sid;
const sockets=[];const password='TestingOnly!4455';
async function login(user){const agent=supertest.agent(app);const page=await agent.get('/login');const csrf=page.text.match(/name="csrf-token" content="([^"]+)/)[1];const result=await agent.post('/login').type('form').send({_csrf:csrf,email:user.username+'@test.example',password});assert.equal(result.status,302);const me=await agent.get('/api/me');return {agent,csrf:me.body.csrf,cookie:result.headers['set-cookie'].map(c=>c.split(';')[0]).join('; ')};}
function post(who,path,data={}){return who.agent.post(path).set('x-csrf-token',who.csrf).send(data);}
function emit(socket,event,payload){return new Promise((resolve,reject)=>socket.timeout(3000).emit(event,payload,(e,v)=>e?reject(e):resolve(v)));}
function socketFor(who,csrf=who.csrf){return new Promise((resolve,reject)=>{const s=client(url,{extraHeaders:{Cookie:who.cookie},auth:{csrf},forceNew:true,reconnection:false});sockets.push(s);s.once('connect',()=>resolve(s));s.once('connect_error',reject);});}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
before(async()=>{
 repl=await MongoMemoryReplSet.create({replSet:{count:1,args:['--nounixsocket']},binary:{version:'7.0.24'}});await connect(repl.getUri());
 for(const model of [User,Availability,Request,Practice,Chat,Block,Report])await model.init();
 const setup=createApp({mongoUrl:repl.getUri(),secret:'test-only-secret-which-is-more-than-32-characters'});app=setup.app;store=setup.store;server=http.createServer(app);io=new Server(server,{maxHttpBufferSize:131072});io.engine.use(setup.sessionMiddleware);require('../sockets/socketHandlers')(io);app.set('io',io);service.setIO(io);await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;
 const passwordHash=await bcrypt.hash(password,4);
 [learner,helper,outsider]=await User.create([{name:'Aakash Thapa',username:'aakash',email:'aakash@test.example',passwordHash,adultConfirmed:true},{name:'Sofia Almeida',username:'sofia',email:'sofia@test.example',passwordHash,adultConfirmed:true,helperEnabled:true,country:'Brazil',bio:'Portuguese conversation helper',languagesSpoken:[{language:'Portuguese',level:'Native'}]},{name:'Unrelated Person',username:'outsider',email:'outsider@test.example',passwordHash,adultConfirmed:true}]);
 offer=await Availability.create({helperId:helper._id,language:'Portuguese',level:'Beginner',startTime:new Date(Date.now()-60000),endTime:new Date(Date.now()+86400000)});
 la=await login(learner);ha=await login(helper);oa=await login(outsider);
});
after(async()=>{for(const s of sockets)s.disconnect();if(io)await new Promise(r=>io.close(r));if(server?.listening)await new Promise(r=>server.close(r));if(store)await store.close();await mongoose.disconnect();if(repl)await repl.stop();});
test('Full learner/helper workflow, security, persistence and rendering',async t=>{
 await t.test('Public pages render and public profiles do not expose email or password hashes',async()=>{
  for(const path of ['/','/login','/register','/helpers?language=Portuguese','/profile/'+helper._id]){const r=await supertest(app).get(path);assert.equal(r.status,200,path);assert.doesNotMatch(r.text,/sofia@test.example|passwordHash|\$2b\$/);}
  const r=await supertest(app).get('/helpers?language=Japanese');assert.match(r.text,/No matches just yet/);
  const escaped=await supertest(app).get('/helpers?q=%5B');assert.equal(escaped.status,200);
 });
 await t.test('Authentication, CSRF and wrong-password denial',async()=>{
  assert.equal((await supertest(app).get('/api/me')).status,401);
  assert.equal((await la.agent.post('/api/match').send({language:'Portuguese',level:'Beginner'})).status,403);
  const a=supertest.agent(app),page=await a.get('/login'),csrf=page.text.match(/name="csrf-token" content="([^"]+)/)[1];
  assert.equal((await a.post('/login').type('form').send({_csrf:csrf,email:'sofia@test.example',password:'incorrect'})).status,401);
 });
 await t.test('Registration requires 18+, hashes passwords and persists a session',async()=>{
  const a=supertest.agent(app),page=await a.get('/register'),csrf=page.text.match(/name="csrf-token" content="([^"]+)/)[1];const body={_csrf:csrf,name:'New Person',username:'newperson',email:'new@example.test',password,confirmPassword:password};
  assert.equal((await a.post('/register').type('form').send(body)).status,400);
  assert.equal((await a.post('/register').type('form').send({...body,adult:'on'})).status,302);
  const u=await User.findOne({username:'newperson'}).select('+passwordHash');assert.notEqual(u.passwordHash,password);assert(await bcrypt.compare(password,u.passwordHash));assert.equal((await a.get('/api/me')).body.name,'New Person');
 });
 await t.test('All signed-in pages render with actual data',async()=>{
  for(const path of ['/dashboard','/profile/edit','/profile/'+learner._id,'/availability','/match'])assert.equal((await la.agent.get(path)).status,200,path);
 });
 await t.test('Profile editing is scoped to the current user and escapes markup',async()=>{
  const result=await la.agent.post('/profile/edit').field('_csrf',la.csrf).field('id',String(helper._id)).field('name','Aakash Thapa').field('bio','<script>alert(1)</script>').field('country','Canada').field('timeZone','America/Toronto').field('spokenLanguage','Nepali').field('spokenLevel','Native').field('spokenLanguage1','English').field('spokenLevel1','Advanced').field('learningLanguage','Portuguese').field('learningLevel','Beginner');assert.equal(result.status,302);
  assert.equal((await User.findById(helper._id)).name,'Sofia Almeida');assert.equal((await User.findById(learner._id)).languagesSpoken.length,2);
  const page=await la.agent.get('/profile/'+learner._id);assert.match(page.text,/&lt;script&gt;alert/);assert.doesNotMatch(page.text,/<script>alert/);
 });
 await t.test('Avatar upload decodes actual image bytes and rejects a disguised script',async()=>{
  const sharp=require('sharp');const png=await sharp({create:{width:16,height:16,channels:3,background:'#8877aa'}}).png().toBuffer();
  const valid=await la.agent.post('/profile/edit').field('_csrf',la.csrf).field('name','Aakash Thapa').field('timeZone','UTC').attach('avatar',png,{filename:'avatar.png',contentType:'image/png'});assert.equal(valid.status,302);const image=(await User.findById(learner._id)).profileImage;assert.match(image,/\.webp$/);assert.equal((await supertest(app).get(image)).status,200);
  const invalid=await la.agent.post('/profile/edit').field('_csrf',la.csrf).field('name','Aakash').attach('avatar',Buffer.from('<script>evil()</script>'),{filename:'fake.png',contentType:'image/png'});assert.equal(invalid.status,400);
 });
 await t.test('Availability editing and deletion require ownership',async()=>{
  const body={id:String(offer._id),language:'Portuguese',level:'Beginner',startTime:new Date(),endTime:new Date(Date.now()+3600000)};
  assert.equal((await post(oa,'/api/offers',body)).status,400);
  assert.equal((await oa.agent.delete('/api/offers/'+offer._id).set('x-csrf-token',oa.csrf)).status,409);
  assert.equal((await post(ha,'/api/offers',body)).status,200);
 });
 await t.test('Match Me finds the actual compatible helper',async()=>{
  const result=await post(la,'/api/match',{language:'Portuguese',level:'Beginner',available:'now'});assert.equal(result.status,200);assert.equal(result.body.profileUrl,'/profile/'+helper._id);
  assert.equal((await post(la,'/api/match',{language:'Japanese',level:'Beginner'})).status,404);
 });
 await t.test('Request reserves the offer atomically and prevents duplicate reservation',async()=>{
  assert.equal((await post(la,'/api/requests',{offerId:String(offer._id)})).status,200);const r=await Request.findOne({learnerId:learner._id});rid=String(r._id);
  assert.equal((await post(oa,'/api/requests',{offerId:String(offer._id)})).status,409);
  assert.equal(await Request.countDocuments({availabilityId:offer._id}),1);
  assert.equal((await la.agent.get('/dashboard')).status,200);
 });
 await t.test('Only helper accepts, and both participants confirm before creating a room',async()=>{
  assert.equal((await post(la,'/api/requests/'+rid,{action:'accept'})).status,403);
  assert.equal((await post(oa,'/api/requests/'+rid,{action:'accept'})).status,404);
  assert.equal((await post(ha,'/api/requests/'+rid,{action:'accept'})).status,200);
  assert.equal((await post(la,'/api/requests/'+rid,{action:'confirm'})).status,200);assert.equal(await Practice.countDocuments(),0);
  assert.equal((await post(ha,'/api/requests/'+rid,{action:'confirm'})).status,200);const s=await Practice.findOne({requestId:rid});sid=String(s._id);assert.equal(s.status,'scheduled');
  assert.equal((await post(ha,'/api/requests/'+rid,{action:'confirm'})).status,200);assert.equal(await Practice.countDocuments(),1);
 });
 await t.test('Unrelated user cannot see, enter, extend or end a session',async()=>{
  for(const path of ['/sessions/'+sid,'/api/sessions/'+sid,'/api/sessions/'+sid+'/messages'])assert.equal((await oa.agent.get(path)).status,404);
  for(const action of ['enter','extend','end'])assert.equal((await post(oa,'/api/sessions/'+sid+'/'+action)).status,404);
 });
 await t.test('Room renders and timer persists through page reloads and repeat entry',async()=>{
  assert.equal((await la.agent.get('/sessions/'+sid)).status,200);
  assert.equal((await post(la,'/api/sessions/'+sid+'/enter')).status,200);const first=await Practice.findById(sid);assert.equal(first.status,'active');assert.equal(first.endsAt-first.startedAt,900000);
  assert.equal((await post(ha,'/api/sessions/'+sid+'/enter')).status,200);await post(la,'/api/sessions/'+sid+'/enter');const second=await Practice.findById(sid);assert.equal(first.endsAt.getTime(),second.endsAt.getTime());assert.equal(second.joinedIds.length,2);
  assert.equal((await la.agent.get('/sessions/'+sid)).status,200);assert.equal((await la.agent.get('/dashboard')).status,200);
 });
 await t.test('Real sockets enforce authentication, room isolation, typing, presence and escaped chat data',async()=>{
  await assert.rejects(socketFor(oa,'invalid-csrf'));
  const ls=await socketFor(la),hs=await socketFor(ha),os=await socketFor(oa);let leaked=false;os.on('chat:message',()=>leaked=true);
  assert((await emit(os,'join',sid)).error);assert((await emit(os,'chat:send',{text:'intruder'})).error);
  assert.equal((await emit(ls,'join',sid)).ok,true);const presence=new Promise(resolve=>ls.once('presence',resolve));assert.equal((await emit(hs,'join',sid)).ok,true);assert.equal((await presence).userIds.length,2);
  const typing=new Promise(resolve=>hs.once('typing',resolve));ls.emit('typing');assert.equal((await typing).name,'Aakash Thapa');
  const message=new Promise(resolve=>hs.once('chat:message',resolve));assert.equal((await emit(ls,'chat:send',{text:'Olá! <img src=x onerror=alert(1)>',roomId:'forged',username:'forged'})).ok,true);const received=await message;assert.equal(received.senderId,String(learner._id));assert.equal(received.name,'Aakash Thapa');assert.match(received.text,/Olá/);await sleep(100);assert.equal(leaked,false);
  const history=await la.agent.get('/api/sessions/'+sid+'/messages');assert.equal(history.body.length,1);assert.equal(history.body[0].senderId,String(learner._id));assert.equal(await Chat.countDocuments({sessionId:sid}),1);
 });
 await t.test('Signed-in helper discovery stays inside the dashboard shell; public discovery remains public',async()=>{
  const privatePage=await la.agent.get('/helpers?language=Portuguese');
  assert.equal(privatePage.status,200);assert.match(privatePage.text,/class="app-shell"/);assert.match(privatePage.text,/discovery-in-app/);assert.match(privatePage.text,/href="\/helpers" class="selected"/);assert.doesNotMatch(privatePage.text,/<header class="public-nav/);
  const publicPage=await supertest(app).get('/helpers');assert.match(publicPage.text,/<header class="public-nav/);assert.doesNotMatch(publicPage.text,/class="app-shell"/);
 });
 await t.test('ICE configuration is participant-only and does not expose the TURN shared secret',async()=>{
  assert.equal((await oa.agent.get('/api/sessions/'+sid+'/rtc-config')).status,404);
  const previous={urls:process.env.TURN_URLS,secret:process.env.TURN_SHARED_SECRET};
  try{
   process.env.TURN_URLS='turn:relay.example.test:3478';process.env.TURN_SHARED_SECRET='test-shared-secret';
   const response=await la.agent.get('/api/sessions/'+sid+'/rtc-config');assert.equal(response.status,200);assert.equal(response.headers['cache-control'],'no-store');assert.equal(response.body.relayConfigured,true);assert.doesNotMatch(response.text,/test-shared-secret/);
   const turn=response.body.iceServers.find(s=>Array.isArray(s.urls));assert.match(turn.username,new RegExp(':'+learner._id+'$'));assert.equal(turn.credential,require('crypto').createHmac('sha1','test-shared-secret').update(turn.username).digest('base64'));
  }finally{for(const [key,value] of [['TURN_URLS',previous.urls],['TURN_SHARED_SECRET',previous.secret]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
 });
 await t.test('Call signaling is private, validates payloads, and replaces duplicate tabs safely',async()=>{
  const ls=await socketFor(la),hs=await socketFor(ha),os=await socketFor(oa);
  assert((await emit(os,'call:ready',{})).error);assert((await emit(os,'call:signal',{callId:'forged',signal:{type:'media',video:true,audio:true}})).error);
  await emit(ls,'join',sid);await emit(hs,'join',sid);
  const paired=new Promise(resolve=>ls.once('call:paired',resolve));await emit(ls,'call:ready',{});await emit(hs,'call:ready',{});const pair=await paired;assert.equal(pair.initiator,false);assert.equal(pair.peerUserId,String(helper._id));
  let leaked=false;os.on('call:signal',()=>leaked=true);
  const signal=new Promise(resolve=>hs.once('call:signal',resolve));assert.equal((await emit(ls,'call:signal',{callId:pair.callId,from:'forged',roomId:'another-room',signal:{type:'media',video:true,audio:false}})).ok,true);const received=await signal;assert.equal(received.from,String(learner._id));assert.equal(received.signal.video,true);assert.equal(leaked,false);
  assert((await emit(ls,'call:signal',{callId:pair.callId,signal:{type:'offer',sdp:'x'.repeat(65537)}})).error);
  assert((await emit(ls,'call:signal',{callId:pair.callId,signal:{type:'media',video:'yes',audio:true}})).error);
  const replacement=await socketFor(la);await emit(replacement,'join',sid);const replaced=new Promise(resolve=>ls.once('call:replaced',resolve));const repaired=new Promise(resolve=>hs.once('call:paired',resolve));await emit(replacement,'call:ready',{});await replaced;const newPair=await repaired;assert.notEqual(newPair.callId,pair.callId);
  assert((await emit(ls,'call:signal',{callId:pair.callId,signal:{type:'media',video:true,audio:true}})).error);
  const left=new Promise(resolve=>hs.once('call:peer-left',resolve));replacement.disconnect();await left;ls.disconnect();hs.disconnect();os.disconnect();
 });
 await t.test('Real WebRTC sends video frames and audio in both directions, including camera off/on',async t=>{
  try{require('os').networkInterfaces();}catch{t.skip('This runtime prevents network-interface enumeration. Run npm run test:browser to verify real media in a browser.');return;}
  const ls=await socketFor(la),hs=await socketFor(ha);await emit(ls,'join',sid);await emit(hs,'join',sid);
  await require('./rtcHelpers')({learnerSocket:ls,helperSocket:hs,emit});
 });
 await t.test('Only helper can extend and concurrent attempts apply exactly once',async()=>{
  assert.equal((await post(la,'/api/sessions/'+sid+'/extend')).status,403);const original=(await Practice.findById(sid)).endsAt.getTime();
  const responses=await Promise.all([post(ha,'/api/sessions/'+sid+'/extend'),post(ha,'/api/sessions/'+sid+'/extend')]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal((await Practice.findById(sid)).endsAt.getTime(),original+300000);
 });
 await t.test('Completion counts once even under simultaneous repeated requests',async()=>{
  await Practice.updateOne({_id:sid},{$set:{startedAt:new Date(Date.now()-61000)}});
  const responses=await Promise.all([post(ha,'/api/sessions/'+sid+'/end'),post(la,'/api/sessions/'+sid+'/end')]);responses.forEach(r=>assert.equal(r.status,200));
  assert.equal((await User.findById(helper._id)).helpGiven,1);assert.equal((await User.findById(learner._id)).helpReceived,1);assert.equal((await Practice.findById(sid)).qualified,true);assert.equal((await Availability.findById(offer._id)).reservedBy,null);assert.match((await la.agent.get('/dashboard')).text,/completed · counted/);
 });
 await t.test('Ended rooms reject chat and logout revokes live socket access',async()=>{
  assert.equal((await la.agent.get('/api/sessions/'+sid+'/rtc-config')).status,409);const ls=await socketFor(la);assert((await emit(ls,'join',sid)).error);assert((await emit(ls,'call:ready',{})).error);const os=await socketFor(oa);const disconnected=new Promise(r=>os.once('disconnect',r));const out=await oa.agent.post('/logout').type('form').send({_csrf:oa.csrf});assert.equal(out.status,302);await disconnected;assert.equal((await oa.agent.get('/api/me')).status,401);
 });
 await t.test('Scheduled rooms cannot start early; cancellation releases the offer without credit',async()=>{
  await service.request(learner,offer._id,new Date(Date.now()+5*60000));const r=await Request.findOne({status:'pending',learnerId:learner._id});await service.respond(r._id,helper._id,'accept');await service.respond(r._id,learner._id,'confirm');await service.respond(r._id,helper._id,'confirm');const s=await Practice.findOne({requestId:r._id});await assert.rejects(service.enter(s._id,learner._id),/scheduled time/);await service.finish(s._id,learner._id,true);assert.equal((await User.findById(helper._id)).helpGiven,1);assert.equal((await Availability.findById(offer._id)).reservedBy,null);
 });
 await t.test('Timer expiry completes qualifying sessions without a browser being open',async()=>{
  const r=await service.request(learner,offer._id);await service.respond(r._id,helper._id,'accept');await service.respond(r._id,learner._id,'confirm');await service.respond(r._id,helper._id,'confirm');const s=await Practice.findOne({requestId:r._id});await service.enter(s._id,learner._id);await service.enter(s._id,helper._id);await Practice.updateOne({_id:s._id},{$set:{startedAt:new Date(Date.now()-900000),endsAt:new Date(Date.now()-1)}});await service.expire();await service.expire();assert.equal((await Practice.findById(s._id)).status,'completed');assert.equal((await User.findById(helper._id)).helpGiven,2);
 });
 await t.test('Blocking cancels shared practice, removes matches and prevents direct requests',async()=>{
  const r=await service.request(learner,offer._id);await service.respond(r._id,helper._id,'accept');await service.respond(r._id,learner._id,'confirm');await service.respond(r._id,helper._id,'confirm');const s=await Practice.findOne({requestId:r._id});await service.enter(s._id,learner._id);
  assert.equal((await post(la,'/api/users/'+helper._id+'/block')).status,200);assert.equal((await Practice.findById(s._id)).status,'cancelled');assert.equal((await post(la,'/api/match',{language:'Portuguese',level:'Beginner'})).status,404);assert.equal((await post(la,'/api/requests',{offerId:String(offer._id)})).status,403);
  assert.equal((await la.agent.delete('/api/users/'+helper._id+'/block').set('x-csrf-token',la.csrf)).status,200);assert.equal(await Block.countDocuments(),0);
 });
 await t.test('Reports persist with the authenticated reporter identity',async()=>{
  const response=await post(la,'/api/users/'+helper._id+'/report',{reason:'Other',description:'Testing the reporting flow.',reporterId:String(helper._id),sessionId:sid});assert.equal(response.status,200);const report=await Report.findOne();assert.equal(String(report.reporterId),String(learner._id));assert.equal(report.status,'open');
 });
});

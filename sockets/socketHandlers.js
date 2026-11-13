const User=require('../models/User');const Chat=require('../models/ChatMessage');const service=require('../services/sessionService');
module.exports=(io)=>{
 io.use((socket,next)=>{
  const req=socket.request;if(!req.session)return next(new Error('Please log in.'));req.session.reload(async e=>{
   if(e||!req.session.userId)return next(new Error('Please log in.'));
   if(socket.handshake.auth.csrf!==req.session.csrf)return next(new Error('Refresh and try again.'));
   try{const user=await User.findById(req.session.userId);if(!user)return next(new Error('Please log in.'));socket.data.userId=String(user._id);socket.data.name=user.name;next();}catch(err){next(err);}
  });
 });
 async function guard(socket,sid){
  await new Promise((resolve,reject)=>socket.request.session.reload(e=>e?reject(new Error('Please log in again.')):resolve()));
  if(socket.request.session.userId!==socket.data.userId)throw new Error('Please log in again.');
  const s=await service.get(sid,socket.data.userId);
  if(s.status!=='active'||s.endsAt<=Date.now())throw new Error('This practice is not active.');return s;
 }
 async function presence(sid){const sockets=await io.in(sid).fetchSockets();io.to(sid).emit('presence',{userIds:[...new Set(sockets.map(s=>s.data.userId))]});}
 const calls=require('./callSignaling')(io,guard);
 io.on('connection',socket=>{
  calls.attach(socket);
  socket.join('auth:'+socket.request.sessionID);let lastMessage=0,lastTyping=0;
  socket.on('join',async(sid,ack=()=>{})=>{try{if(typeof sid!=='string')throw new Error('Invalid session.');await guard(socket,sid);if(socket.data.room){calls.detach(socket);await socket.leave(socket.data.room);await presence(socket.data.room);}socket.data.room=sid;await socket.join(sid);await presence(sid);ack({ok:true});}catch(e){ack({error:e.message});}});
  socket.on('chat:send',async(payload,ack=()=>{})=>{
   try{
    const sid=socket.data.room;if(!sid)throw new Error('Join your practice first.');await guard(socket,sid);
    const text=typeof payload?.text==='string'?payload.text.trim():'';if(!text||text.length>2000)throw new Error('Use 1–2,000 characters.');
    if(Date.now()-lastMessage<300)throw new Error('Please wait a moment before sending again.');lastMessage=Date.now();
    const m=await Chat.create({sessionId:sid,senderId:socket.data.userId,text});io.to(sid).emit('chat:message',{id:m._id,senderId:socket.data.userId,name:socket.data.name,text:m.text,createdAt:m.createdAt});ack({ok:true});
   }catch(e){ack({error:e.message});}
  });
  socket.on('typing',async()=>{try{if(Date.now()-lastTyping<800||!socket.data.room)return;lastTyping=Date.now();await guard(socket,socket.data.room);socket.to(socket.data.room).emit('typing',{name:socket.data.name});}catch{}});
  socket.on('disconnect',()=>{if(socket.data.room)presence(socket.data.room).catch(console.error);});
 });
};

require('dotenv').config();const http=require('http');const {Server}=require('socket.io');const connectDB=require('./config/db');const createApp=require('./app');const service=require('./services/sessionService');
async function start(){
 if(!process.env.MONGODB_URI)throw new Error('Set MONGODB_URI in .env first. See README.');
 await connectDB(process.env.MONGODB_URI);
 const {app,sessionMiddleware,store}=createApp({mongoUrl:process.env.MONGODB_URI,secret:process.env.SESSION_SECRET,production:process.env.NODE_ENV==='production',baseUrl:process.env.BASE_URL});
 await Promise.all(Object.values(require('mongoose').models).map(model=>model.init()));
 const server=http.createServer(app);const baseUrl=process.env.BASE_URL||'http://localhost:3000';
 const io=new Server(server,{maxHttpBufferSize:131072,allowRequest:(req,callback)=>callback(null,!req.headers.origin||req.headers.origin===new URL(baseUrl).origin)});
 io.engine.use(sessionMiddleware);require('./sockets/socketHandlers')(io);app.set('io',io);service.setIO(io);
 let running=false;const timer=setInterval(async()=>{if(running)return;running=true;try{await service.expire();}catch(e){console.error('Session expiry failed:',e.message);}finally{running=false;}},1000);
 server.listen(process.env.PORT||3000,()=>console.log('Speak Forward is ready at '+baseUrl));
 const shutdown=()=>{clearInterval(timer);io.close();server.close(async()=>{await store.close();await require('mongoose').disconnect();process.exit(0);});};process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
}start().catch(e=>{console.error(e.message);process.exit(1);});

const path=require('path');const express=require('express');const session=require('express-session');const MongoStore=require('connect-mongo');const helmet=require('helmet');
const {context}=require('./middleware/authMiddleware');const {same}=require('./services/utils');
module.exports=function createApp({mongoUrl,secret,production=false,baseUrl='http://localhost:3000'}){
 if(!secret||secret.length<32)throw new Error('SESSION_SECRET must contain at least 32 characters.');
 const app=express();app.disable('x-powered-by');if(production)app.set('trust proxy',1);
 app.use(helmet({contentSecurityPolicy:{directives:{'script-src':["'self'"],'img-src':["'self'",'data:','blob:'],'media-src':["'self'",'blob:'],'connect-src':["'self'"],'upgrade-insecure-requests':production?[]:null}},strictTransportSecurity:production?undefined:false}));
 app.use(express.static(path.join(__dirname,'public')));app.use(express.urlencoded({extended:false,limit:'20kb'}));app.use(express.json({limit:'20kb'}));
 const store=MongoStore.create({mongoUrl,ttl:86400});
 const sessionMiddleware=session({name:'sf.sid',secret,resave:false,saveUninitialized:false,store,cookie:{httpOnly:true,sameSite:'lax',secure:production,maxAge:86400000}});
 app.use(sessionMiddleware);app.use(context);app.set('view engine','ejs');app.set('views',path.join(__dirname,'views'));
 app.locals.same=same;app.locals.initials=name=>(name||'?').split(' ').filter(Boolean).slice(0,2).map(x=>x[0]).join('');
 app.locals.date=value=>new Date(value).toISOString();
 app.locals.profileCompletion=u=>Math.round([u.bio,u.country,u.goals,u.languagesLearning.length,u.languagesSpoken.length].filter(Boolean).length/5*100);
 app.get('/health',(_req,res)=>res.json({ok:true}));app.use(require('./routes'));app.use((_req,res)=>res.status(404).render('pages/error',{title:'Page not found',message:'This page does not exist. Let’s get you back to a conversation.'}));app.use(require('./middleware/errorMiddleware'));
 return {app,sessionMiddleware,store,baseUrl};
};

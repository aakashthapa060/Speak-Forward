const bcrypt=require('bcrypt');
const User=require('../models/User');
const {fail,text}=require('../services/utils');
const regenerate=req=>new Promise((resolve,reject)=>req.session.regenerate(e=>e?reject(e):resolve()));
const save=req=>new Promise((resolve,reject)=>req.session.save(e=>e?reject(e):resolve()));
exports.register=async(req,res)=>{
 const name=text(req.body.name,80),username=text(req.body.username,24).toLowerCase(),email=text(req.body.email,200).toLowerCase(),password=req.body.password;
 if(!name||!/^[a-z0-9_]{3,24}$/.test(username)||!/^\S+@\S+\.\S+$/.test(email))fail(400,'Enter your name, a valid email and a username of 3–24 letters, numbers or underscores.');
 if(typeof password!=='string'||password.length<10||Buffer.byteLength(password)>72)fail(400,'Use a password of at least 10 characters and at most 72 bytes.');
 if(password!==req.body.confirmPassword)fail(400,'The passwords do not match.');
 if(!['on',true,'true'].includes(req.body.adult))fail(400,'You must confirm that you are 18 or older.');
 const user=await User.create({name,username,email,passwordHash:await bcrypt.hash(password,12),adultConfirmed:true});
 await regenerate(req);req.session.userId=String(user._id);await save(req);res.redirect('/profile/edit');
};
exports.login=async(req,res)=>{
 const user=await User.findOne({email:text(req.body.email,200).toLowerCase()}).select('+passwordHash');
 if(!user||typeof req.body.password!=='string'||!await bcrypt.compare(req.body.password,user.passwordHash))fail(401,'Email or password is incorrect.');
 const old=req.sessionID;req.app.get('io')?.in('auth:'+old).disconnectSockets(true);
 await regenerate(req);req.session.userId=String(user._id);await save(req);res.redirect('/dashboard');
};
exports.logout=(req,res,next)=>{
 req.app.get('io')?.in('auth:'+req.sessionID).disconnectSockets(true);
 req.session.destroy(e=>{if(e)return next(e);res.clearCookie('sf.sid');res.redirect('/');});
};

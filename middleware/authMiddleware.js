const crypto=require('crypto');
const User=require('../models/User');
exports.context=async(req,res,next)=>{
 try{
  res.locals.user=req.session.userId?await User.findById(req.session.userId):null;
  req.user=res.locals.user;
  if(!req.session.csrf) req.session.csrf=crypto.randomBytes(24).toString('hex');
  res.locals.csrf=req.session.csrf;
  res.locals.path=req.path;res.locals.notice=req.session.notice||null;delete req.session.notice;
  next();
 }catch(e){next(e);}
};
exports.auth=(req,res,next)=>{if(req.user)return next();if(req.originalUrl.startsWith('/api/'))return res.status(401).json({error:'Please log in.'});res.redirect('/login');};
exports.csrf=(req,res,next)=>{if(['GET','HEAD','OPTIONS'].includes(req.method))return next();const token=req.get('x-csrf-token')||req.body?._csrf;if(!token||token!==req.session.csrf)return res.status(403).json({error:'This form expired. Refresh the page and try again.'});next();};

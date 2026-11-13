module.exports=(err,req,res,next)=>{
 const status=err.status||(err.code===11000?409:err.name==='ValidationError'||err.name==='CastError'||err.code==='LIMIT_FILE_SIZE'?400:500);
 const message=err.code===11000?'That email, username, or reservation already exists.':status===500?'Something went wrong. Please try again.':err.code==='LIMIT_FILE_SIZE'?'Choose an image smaller than 3 MB.':err.message;
 if(status===500)console.error(err);
 if(req.path.startsWith('/api/'))return res.status(status).json({error:message});
 res.status(status).render('pages/error',{title:'Let’s try that again',message});
};

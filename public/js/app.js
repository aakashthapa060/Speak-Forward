(() => {
 const csrf=document.querySelector('meta[name="csrf-token"]').content;
 let toastTimer;
 window.notify=(message,error=false)=>{const el=document.getElementById('toast');el.textContent=message;el.classList.toggle('error',error);el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,6500);};
 window.api=async(url,data,method='POST')=>{
  const response=await fetch(url,{method,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},...(method==='GET'?{}:{body:JSON.stringify(data||{})})});
  const result=await response.json().catch(()=>({error:'The request could not be completed.'}));if(!response.ok)throw new Error(result.error||'Please try again.');return result;
 };
 const busy=async(button,work)=>{button.disabled=true;try{await work();}catch(e){notify(e.message,true);}finally{button.disabled=false;}};
 const formData=form=>Object.fromEntries(new FormData(form));
 window.localInput=value=>{const d=new Date(value);return new Date(d-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
 document.querySelectorAll('time[datetime]').forEach(el=>{const d=new Date(el.dateTime);el.textContent=new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(d);el.title=d.toLocaleString();});
 document.querySelectorAll('[data-local-min]').forEach(el=>{el.min=localInput(el.dataset.localMin);el.max=localInput(el.dataset.localMax);});
 document.querySelector('[data-back]')?.addEventListener('click',()=>history.back());
 document.querySelectorAll('[data-request]').forEach(button=>button.addEventListener('click',()=>busy(button,async()=>{await api('/api/requests/'+button.dataset.request,{action:button.dataset.action});location.reload();})));
 document.querySelectorAll('[data-offer-request]').forEach(form=>form.addEventListener('submit',e=>{e.preventDefault();busy(form.querySelector('button'),async()=>{const data=formData(form);if(data.proposedTime)data.proposedTime=new Date(data.proposedTime).toISOString();const result=await api('/api/requests',data);location.href=result.redirect;});}));
 const offerForm=document.getElementById('offer-form');
 offerForm?.addEventListener('submit',e=>{e.preventDefault();busy(offerForm.querySelector('button'),async()=>{const data=formData(offerForm);data.startTime=new Date(data.startTime).toISOString();data.endTime=new Date(data.endTime).toISOString();await api('/api/offers',data);location.reload();});});
 document.querySelectorAll('[data-delete-offer]').forEach(button=>button.addEventListener('click',()=>busy(button,async()=>{if(!confirm('Remove this availability offer?'))return;await api('/api/offers/'+button.dataset.deleteOffer,{},'DELETE');location.reload();})));
 document.querySelectorAll('[data-edit-offer]').forEach(button=>button.addEventListener('click',()=>{offerForm.elements.id.value=button.dataset.editOffer;offerForm.elements.language.value=button.dataset.language;offerForm.elements.level.value=button.dataset.level;offerForm.elements.startTime.value=localInput(button.dataset.start);offerForm.elements.endTime.value=localInput(button.dataset.end);document.getElementById('offer-form-title').textContent='Edit your offer';offerForm.scrollIntoView({behavior:'smooth',block:'center'});offerForm.elements.language.focus();}));
 offerForm?.addEventListener('reset',()=>document.getElementById('offer-form-title').textContent='Add an offer');
 document.querySelector('#match-form')?.addEventListener('submit',e=>{e.preventDefault();const form=e.target;busy(form.querySelector('button'),async()=>{const result=await api('/api/match',formData(form));location.href=result.profileUrl;});});
 document.querySelectorAll('[data-block]').forEach(button=>button.addEventListener('click',()=>busy(button,async()=>{if(!confirm('Block this person? Shared sessions and pending requests will be cancelled.'))return;await api('/api/users/'+button.dataset.block+'/block');location.href='/dashboard';})));
 document.querySelectorAll('[data-unblock]').forEach(button=>button.addEventListener('click',()=>busy(button,async()=>{await api('/api/users/'+button.dataset.unblock+'/block',{},'DELETE');location.reload();})));
 document.querySelectorAll('[data-report]').forEach(form=>form.addEventListener('submit',e=>{e.preventDefault();busy(form.querySelector('button'),async()=>{await api('/api/users/'+form.dataset.report+'/report',formData(form));form.reset();notify('Your report was saved for project review.');});}));
 document.querySelectorAll('[data-end]').forEach(button=>button.addEventListener('click',()=>busy(button,async()=>{if(!confirm('Cancel this practice session?'))return;await api('/api/sessions/'+button.dataset.end+'/end',{cancel:true});location.reload();})));
 // Refresh pending invitation states without interrupting active forms or rooms.
 if(location.pathname==='/dashboard')setTimeout(()=>{if(!document.hidden)location.reload();},30000);
})();

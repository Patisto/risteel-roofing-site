const $=selector=>document.querySelector(selector);
const apiBase=(window.RI_API_BASE||((location.hostname==='localhost'||location.hostname==='127.0.0.1')?'':'https://api.risteelroofing.com')).replace(/\/$/,'');
const api=`${apiBase}/api`;
let token=localStorage.getItem('ri_cms_token')||'';
let activeTab='services';
let records=[];
let selected=null;

const defs={
  services:{title:'Services',image:true,fields:[['title','Service name','text'],['summary','Short summary','textarea'],['description','Full details','textarea'],['sort_order','Display order','number'],['active','Visible on website','checkbox']]},
  projects:{title:'Projects',image:true,fields:[['title','Project title','text'],['category','Category','text'],['description','Description','textarea'],['sort_order','Display order','number'],['active','Visible on website','checkbox']]},
  gallery:{title:'Gallery',image:true,fields:[['title','Image title','text'],['alt_text','Image description','text'],['sort_order','Display order','number'],['active','Visible on website','checkbox']]},
  testimonials:{title:'Testimonials',fields:[['quote','Testimonial','textarea'],['author','Client label','text'],['location','Location','text'],['sort_order','Display order','number'],['active','Visible on website','checkbox']]}
};

function imageSrc(value=''){
  if(!value)return '';
  if(/^(https?:|data:|blob:)/i.test(value))return value;
  if(value.startsWith('/uploads/'))return `${apiBase}${value}`;
  if(value.startsWith('assets/'))return new URL(value,'https://risteelroofing.com/').href;
  return value;
}
function escapeHtml(value=''){
  return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function spinner(label='Please wait'){
  return `<span class="spinner button-spinner" aria-hidden="true"></span><span>${escapeHtml(label)}</span>`;
}
async function request(url,options={}){
  const {auth=true,...fetchOptions}=options;
  const isForm=fetchOptions.body instanceof FormData;
  const headers={...(auth?{'Authorization':`Bearer ${token}`}:{})};
  if(!isForm)headers['Content-Type']='application/json';
  Object.assign(headers,fetchOptions.headers||{});
  const response=await fetch(url,{...fetchOptions,headers});
  const text=await response.text();
  let data={};
  if(text){try{data=JSON.parse(text)}catch{throw Error(`The API returned an unreadable response (${response.status}). Check that this CMS is using ${api}.`)} }
  if(response.status===401&&auth){logout();throw Error('Your session has expired. Sign in again.')}
  if(!response.ok)throw Error(data.error||`Request failed (${response.status}).`);
  return response.status===204?null:data;
}
function login(){
  $('#login').classList.remove('hidden');
  $('#dashboard').classList.add('hidden');
  $('#logout').classList.add('hidden');
}
function logout(){
  token='';
  localStorage.removeItem('ri_cms_token');
  login();
}
$('#login-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.currentTarget;
  const button=form.querySelector('button[type="submit"]');
  const error=$('#login-error');
  error.textContent='';
  button.disabled=true;
  button.innerHTML=spinner('Signing in…');
  try{
    const data=await request(`${api}/admin/login`,{method:'POST',auth:false,body:JSON.stringify(Object.fromEntries(new FormData(form)))});
    token=data.token;
    localStorage.setItem('ri_cms_token',token);
    await enter();
  }catch(err){error.textContent=err.message}
  finally{button.disabled=false;button.textContent='Sign in'}
});
$('#logout').addEventListener('click',logout);
$('#tabs').addEventListener('click',event=>{
  const button=event.target.closest('[data-tab]');
  if(!button)return;
  activeTab=button.dataset.tab;
  document.querySelectorAll('.side-nav button').forEach(item=>item.classList.toggle('active',item===button));
  renderTab();
});
async function enter(){
  try{
    await request(`${api}/admin/settings`);
    $('#login').classList.add('hidden');
    $('#dashboard').classList.remove('hidden');
    $('#logout').classList.remove('hidden');
    await renderTab();
  }catch(error){$('#login-error').textContent=error.message;logout()}
}
function showLoading(message='Loading content…'){
  $('#panel').innerHTML=`<div class="loading"><span class="spinner" aria-hidden="true"></span>${escapeHtml(message)}</div>`;
}
function showError(error){
  $('#panel').innerHTML=`<div class="empty error">${escapeHtml(error.message||error)}</div>`;
}
async function renderTab(){
  showLoading();
  try{
    if(activeTab==='messages')return await renderMessages();
    await renderCollection(activeTab);
  }catch(error){showError(error)}
}
async function renderCollection(key,{selectedId=null,notice=''}={}){
  records=await request(`${api}/admin/${key}`);
  const def=defs[key];
  selected=records.find(record=>String(record.id)===String(selectedId))||records[0]||null;
  const itemMarkup=records.length?records.map(record=>{
    const title=record.title||record.author||record.quote||'Untitled';
    return `<button type="button" class="item ${selected&&String(selected.id)===String(record.id)?'active':''}" data-id="${record.id}">${record.image_url?`<img src="${escapeHtml(imageSrc(record.image_url))}" alt="">`:'<span class="item-placeholder" aria-hidden="true">＋</span>'}<span><b>${escapeHtml(title)}</b><small>${record.active?'Visible':'Hidden'}</small></span></button>`;
  }).join(''):'<div class="empty">No items yet. Add your first one to get started.</div>';
  $('#panel').innerHTML=`<div class="panel-head"><div><h2>${escapeHtml(def.title)}</h2><p>Changes appear on your website after saving.</p></div><button type="button" class="add-button" id="add-record">＋ Add ${escapeHtml(def.title.toLowerCase().replace(/s$/,''))}</button></div><div class="content-layout"><div class="item-list">${itemMarkup}</div><form class="editor" id="record-form" novalidate></form></div>`;
  $('#add-record').onclick=()=>{selected=null;renderForm(key,{active:true,sort_order:records.length})};
  document.querySelectorAll('.item').forEach(button=>button.addEventListener('click',()=>{
    selected=records.find(record=>String(record.id)===button.dataset.id)||null;
    document.querySelectorAll('.item').forEach(item=>item.classList.toggle('active',item===button));
    renderForm(key,selected||{});
  }));
  if(selected)renderForm(key,selected,notice);else renderForm(key,{active:true,sort_order:records.length},notice);
}
function renderForm(key,data={},notice=''){
  const form=$('#record-form');
  const def=defs[key];
  const fields=def.fields.map(([name,label,type])=>{
    const value=data[name]??(name==='active'?true:'');
    if(type==='checkbox')return `<label class="check-label"><input name="${name}" type="checkbox" ${value?'checked':''}>${label}</label>`;
    if(type==='textarea')return `<label>${label}<textarea name="${name}" ${name==='quote'||name==='title'?'required':''}>${escapeHtml(value)}</textarea></label>`;
    return `<label>${label}<input name="${name}" type="${type}" value="${escapeHtml(value)}" ${name==='title'?'required':''}></label>`;
  }).join('');
  const currentImage=data.image_url||'';
  const imageField=def.image?`<div class="image-field"><label>Website image</label><div class="image-preview" id="image-preview">${currentImage?`<img src="${escapeHtml(imageSrc(currentImage))}" alt="Current image preview">`:'Choose an image to preview it here'}</div><label class="upload-control"><span>${currentImage?'Choose a replacement image':'Choose an image'}</span><input name="upload" type="file" accept="image/jpeg,image/png,image/webp,image/gif" ${currentImage?'':'required'}></label><p class="helper">Select a JPG, PNG, WEBP or GIF image (maximum 15 MB). It will be resized and saved to the website.</p></div>`:'';
  form.innerHTML=`${notice?`<p class="notice success" role="status">${escapeHtml(notice)}</p>`:''}${fields}${imageField}<div class="actions"><button class="save-button" type="submit">Save changes</button><button class="secondary-button" type="button" id="clear-form">${selected?'Cancel changes':'Clear form'}</button>${selected?'<button class="delete-button" type="button" id="delete-record">Delete</button>':''}</div><p class="notice" id="form-notice" role="status" aria-live="polite"></p>`;
  const fileInput=form.elements.upload;
  if(fileInput)fileInput.addEventListener('change',()=>{
    const file=fileInput.files[0];
    if(!file)return;
    const preview=$('#image-preview');
    const objectUrl=URL.createObjectURL(file);
    preview.innerHTML=`<img src="${objectUrl}" alt="Selected image preview">`;
  });
  form.onsubmit=event=>saveRecord(event,key,data);
  $('#clear-form').onclick=()=>renderForm(key,selected||{active:true,sort_order:records.length});
  const deleteButton=$('#delete-record');
  if(deleteButton)deleteButton.onclick=()=>deleteRecord(key,deleteButton);
}
async function saveRecord(event,key,originalData){
  event.preventDefault();
  const form=event.currentTarget;
  if(!form.reportValidity())return;
  const button=form.querySelector('.save-button');
  const notice=$('#form-notice');
  const file=form.elements.upload?.files?.[0];
  button.disabled=true;
  try{
    let imageUrl=originalData.image_url||'';
    if(file){
      button.innerHTML=spinner('Uploading image…');
      const body=new FormData();
      body.append('image',file);
      const uploaded=await request(`${api}/admin/upload`,{method:'POST',body});
      imageUrl=uploaded.url;
    }
    if(defs[key].image&&!imageUrl)throw Error('Choose an image before saving this item.');
    button.innerHTML=spinner('Saving changes…');
    const payload={};
    for(const [name,,type] of defs[key].fields){
      if(type==='checkbox')payload[name]=form.elements[name].checked;
      else if(type==='number')payload[name]=Number(form.elements[name].value||0);
      else payload[name]=form.elements[name].value;
    }
    if(defs[key].image)payload.image_url=imageUrl;
    const url=selected?`${api}/admin/${key}/${selected.id}`:`${api}/admin/${key}`;
    const saved=await request(url,{method:selected?'PUT':'POST',body:JSON.stringify(payload)});
    await renderCollection(key,{selectedId:saved?.id||selected?.id,notice:'Saved successfully. Your website content has been updated.'});
  }catch(error){
    notice.textContent=error.message;
    notice.className='notice error';
  }finally{
    if(button.isConnected){button.disabled=false;button.textContent='Save changes'}
  }
}
async function deleteRecord(key,button){
  if(!selected||!confirm('Delete this item from the website?'))return;
  const id=selected.id;
  button.disabled=true;
  button.innerHTML=spinner('Deleting…');
  try{
    await request(`${api}/admin/${key}/${id}`,{method:'DELETE'});
    await renderCollection(key,{notice:'Item deleted.'});
  }catch(error){button.disabled=false;button.textContent='Delete';const notice=$('#form-notice');notice.textContent=error.message;notice.className='notice error'}
}
async function renderMessages(){
  const messages=await request(`${api}/admin/messages`);
  const unread=messages.filter(message=>!message.read).length;
  $('#unread-count').textContent=unread?String(unread):'';
  $('#panel').innerHTML=`<div class="panel-head"><div><h2>Messages</h2><p>${messages.length} customer ${messages.length===1?'enquiry':'enquiries'} received</p></div></div>${messages.length?`<div class="message-list">${messages.map(message=>`<article class="message ${message.read?'':'unread'}"><header><div><b>${escapeHtml(message.name)}</b> · <a href="mailto:${escapeHtml(message.email)}">${escapeHtml(message.email)}</a><small><br>${new Date(message.created_at).toLocaleString()}</small></div><div class="message-actions"><button type="button" data-message="${message.id}" data-read="${!message.read}">${message.read?'Mark unread':'Mark read'}</button></div></header><p><b>${escapeHtml(message.service||'General enquiry')}</b>${message.phone?` · ${escapeHtml(message.phone)}`:''}<br>${escapeHtml(message.message)}</p></article>`).join('')}</div>`:'<div class="empty">No enquiries yet.</div>'}`;
  document.querySelectorAll('[data-message]').forEach(button=>button.onclick=async()=>{
    button.disabled=true;button.innerHTML=spinner('Saving…');
    try{await request(`${api}/admin/messages/${button.dataset.message}`,{method:'PATCH',body:JSON.stringify({read:button.dataset.read==='true'})});await renderMessages()}
    catch(error){button.disabled=false;button.textContent='Could not save';button.title=error.message}
  });
}
if(token)enter();else login();

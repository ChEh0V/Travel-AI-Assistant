const $=id=>document.getElementById(id);
const STORAGE='travelai-chat-v2';
const freshState=()=>({id:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),city:'rome',days:2,pace:'balanced',interests:['architecture','walks'],day:0,plan:[],messages:[],budget:Budget.normalize()});
const ARCHIVE='travelai-chat-archive-v1';
let threads=[];
let pendingDeletion=null;
function requestDelete(kind,id){
 if(busy)return;pendingDeletion={kind,id};
 $('delete-title').textContent=kind==='route'?'Удалить маршрут?':'Удалить поездку?';
 $('delete-description').textContent=kind==='route'?'План по дням будет удалён. Переписка, даты, сборы и «Хочу сюда» сохранятся — маршрут можно собрать заново.':'Будут удалены маршрут, переписка, сборы и сохранённые места этой поездки. Другие поездки останутся на месте.';
 $('delete-dialog').showModal();
}
function confirmDelete(){
 if(busy||!pendingDeletion)return;const {kind,id}=pendingDeletion;pendingDeletion=null;$('delete-dialog').close();
 if(kind==='route'){
  if(id!==state.id)return;state=TravelTools.withoutRoute(state);save();renderRoute();toast('Маршрут удалён, поездка сохранена');
 }else{
  threads=TravelTools.removeTrip(threads,id);if(id===state.id){cancelForecast();state=freshState();ensureCompanionState();}
  save();renderChat();renderRoute();location.hash='trips';navigate();toast('Поездка удалена');
 }
}
function isValidThread(value){return value&&DESTINATIONS[value.city]&&[1,2,3].includes(value.days)&&['slow','balanced','active'].includes(value.pace)&&Array.isArray(value.interests)&&Array.isArray(value.messages)&&value.messages.every(m=>m&&['user','assistant'].includes(m.role)&&typeof m.content==='string')&&Array.isArray(value.plan)&&(!value.plan.length||value.plan.length===value.days)&&value.plan.every(day=>Array.isArray(day)&&day.every(p=>p&&typeof p.id==='string'&&typeof p.name==='string'));}
try{const stored=JSON.parse(localStorage.getItem(ARCHIVE));if(Array.isArray(stored))threads=stored.filter(isValidThread).slice(0,12);}catch{}
let state=freshState(),busy=false,toastTimer;
try{const saved=JSON.parse(localStorage.getItem(STORAGE));if(saved&&DESTINATIONS[saved.city]&&[1,2,3].includes(saved.days)&&Array.isArray(saved.messages)&&saved.messages.every(m=>m&&['user','assistant'].includes(m.role)&&typeof m.content==='string')&&Array.isArray(saved.interests)&&Array.isArray(saved.plan)&&saved.plan.every(day=>Array.isArray(day)&&day.every(p=>p&&typeof p.name==='string'&&typeof p.id==='string'))&&(!saved.plan.length||saved.plan.length===saved.days)){state={...freshState(),...saved};state.day=Number.isInteger(state.day)&&state.day>=0&&state.day<state.days?state.day:0;}}catch{}
function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2500);}
function archiveCurrent(){ensureCompanionState();if(!state.messages.length&&!state.budget?.items?.length&&!state.budget?.limit&&!state.wishlist.length&&!state.packing.custom.length&&!state.packing.start)return;state.updated=Date.now();threads=TravelTools.upsertThreads(threads,state);}
const euro=cents=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(cents/100);
function placeLinks(place){
 const el=document.createElement('div');el.className='place-links';
 const map=document.createElement('a');map.href=TravelTools.maps(place,state.city);map.target='_blank';map.rel='noopener noreferrer';map.textContent='На карте и отзывы ↗';el.append(map);
 const ticket=TravelTools.ticket(place);if(ticket){const a=document.createElement('a');a.href=ticket;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Билеты · официальный сайт ↗';el.append(a);}
 return el;
}
function renderPreferences(){
 const groups={stay:{label:'Жильё',options:['Хостел','Отель','Комфорт']},food:{label:'Еда',options:['Перекусы','Кафе','Рестораны']},transport:{label:'Передвижение',options:['Пешком','Общественный','Такси']},activities:{label:'Впечатления',options:['Бесплатное','Микс','Без ограничений']},company:{label:'С кем едете?',options:TravelTools.companies,default:'Не важно'}};
 state.preferences=state.preferences&&typeof state.preferences==='object'?state.preferences:{};delete state.preferences.vibe;
 const container=$('preference-options');container.replaceChildren();
 Object.entries(groups).forEach(([key,group])=>{
  if(!group.options.includes(state.preferences[key]))state.preferences[key]=group.default||group.options[1];
  const row=document.createElement('div');row.className='preference-row';const label=document.createElement('span');label.textContent=group.label;const options=document.createElement('div');options.className='preference-segments';options.setAttribute('role','group');options.setAttribute('aria-label',group.label);
  group.options.forEach(option=>{const button=document.createElement('button');button.type='button';button.textContent=option;button.disabled=busy;const active=state.preferences[key]===option;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',active);button.onclick=()=>{state.preferences[key]=option;if(key==='activities'){state.interests=state.interests.filter(i=>i!=='free');if(option==='Бесплатное')state.interests.push('free');}save();};options.append(button);});
  row.append(label,options);container.append(row);
 });
 $('preference-summary').textContent='';$('preferences-done').disabled=busy;
}
function instagramReply(city){
 const indices={rome:[2,4,6],paris:[3,2,5],barcelona:[1,2,7],prague:[0,2,5],vienna:[0,2,3],lisbon:[0,2,8]}[city];
 return 'Инстаграмные места · '+DESTINATIONS[city].name+'\n\n'+indices.map(i=>'• '+DESTINATIONS[city].places[i][0]+' — '+DESTINATIONS[city].places[i][1]).join('\n\n')+'\n\nЕсли хотите перейти к плану поездки, напишите «Составь маршрут».';
}
function renderBudget(){state.budget=Budget.normalize(state.budget);renderPreferences();}
function openTrip(id,page='chat'){
 if(busy)return;
 cancelForecast();
 const selected=threads.find(t=>t.id===id);if(!selected)return;
 const restored=JSON.parse(JSON.stringify(selected));archiveCurrent();state=restored;ensureCompanionState();
 state.day=Number.isInteger(state.day)&&state.day>=0&&state.day<state.days?state.day:0;
 renderChat();renderRoute();save();location.hash=page;navigate();
}
function renderTrips(){
 const grid=$('trips-grid');if(!grid)return;
 const query=$('trip-search').value.trim().toLocaleLowerCase('ru');
 const matches=threads.filter(t=>(DESTINATIONS[t.city].name+' '+DESTINATIONS[t.city].country+' '+t.messages.filter(m=>m.role==='user').map(m=>m.content).join(' ')).toLocaleLowerCase('ru').includes(query));
 $('trips-total').textContent=query?'Найдено: '+matches.length:'Всего поездок: '+threads.length;
 grid.replaceChildren();
 if(!matches.length){const empty=document.createElement('div');empty.className='trips-empty';const title=document.createElement('h2');title.textContent=query?'Ничего не нашлось':'Начните с первой поездки';const description=document.createElement('p');description.textContent=query?'Попробуйте другой город или слово из переписки.':'Обсудите направление с ассистентом — поездка появится здесь.';empty.append(title,description);if(!query){const b=document.createElement('button');b.className='primary-action';b.textContent='Создать поездку ↗';b.disabled=busy;b.onclick=()=>$('new-trip').click();empty.append(b);}grid.append(empty);return;}
 matches.forEach((trip,index)=>{
  const card=document.createElement('article');card.className='trip-card tone-'+(index%3);if(trip.id===state.id)card.classList.add('current');
  const top=document.createElement('div');top.className='trip-card-top';const code=document.createElement('span');code.textContent={rome:'IT',paris:'FR',barcelona:'ES',prague:'CZ',vienna:'AT',lisbon:'PT'}[trip.city];const status=document.createElement('span');status.textContent=trip.id===state.id?'Текущая поездка':trip.plan.length?'Маршрут составлен':'В обсуждении';top.append(code,status);
  const title=document.createElement('h2');title.textContent=trip.plan.length?DESTINATIONS[trip.city].name:'Новая поездка';
  const meta=document.createElement('p');meta.className='trip-card-meta';meta.textContent=trip.plan.length?DESTINATIONS[trip.city].country+' · '+trip.days+' дн. · '+trip.plan.flat().length+' мест':'Обсуждение с ассистентом';
  const preview=document.createElement('p');preview.className='trip-card-preview';preview.textContent=trip.messages.find(m=>m.role==='user')?.content||'Поездка';
  const actions=document.createElement('div');actions.className='trip-card-actions';const chat=document.createElement('button');chat.textContent='Открыть чат ↗';chat.disabled=busy;chat.onclick=()=>openTrip(trip.id,'chat');actions.append(chat);
  if(trip.plan.length){const route=document.createElement('button');route.textContent='Маршрут';route.disabled=busy;route.onclick=()=>openTrip(trip.id,'route');actions.append(route);}
  const pack=document.createElement('button');pack.textContent='Сборы';pack.disabled=busy;pack.onclick=()=>openTrip(trip.id,'packing');actions.append(pack);const remove=document.createElement('button');remove.className='delete-trip-button';remove.textContent='Удалить поездку';remove.disabled=busy;remove.onclick=()=>requestDelete('trip',trip.id);card.append(top,title,meta,preview,actions,remove);grid.append(card);
 });
}
function renderHistory(){
 const list=$('thread-list');list.replaceChildren();$('history-count').textContent=String(threads.length).padStart(2,'0');
 $('active-trip').hidden=!state.plan.length;$('active-trip').textContent=state.plan.length?DESTINATIONS[state.city].name+' · '+state.days+' дн.':'';
 if(!threads.length){const empty=document.createElement('p');empty.className='history-empty';empty.textContent='Начните новую поездку в чате. Она сохранится здесь вместе с перепиской и маршрутом.';list.append(empty);return;}
 threads.forEach(thread=>{
  const b=document.createElement('button');b.className='thread'+(thread.id===state.id?' active':'');b.disabled=busy;
  const title=document.createElement('strong');title.textContent=thread.plan.length?DESTINATIONS[thread.city].name:(thread.messages.find(m=>m.role==='user')?.content||'Новая поездка').slice(0,55);
  const detail=document.createElement('small');detail.className='trip-detail';detail.textContent=thread.plan.length?DESTINATIONS[thread.city].country+' · '+thread.days+' дн.':'План ещё не составлен';
  const preview=document.createElement('span');preview.className='trip-preview';preview.textContent=(thread.messages.find(m=>m.role==='user')?.content||'Обсуждение поездки').slice(0,90);
  const arrow=document.createElement('span');arrow.className='trip-arrow';arrow.textContent='↗';arrow.setAttribute('aria-hidden','true');
  b.title=title.textContent+' — '+preview.textContent;b.append(title,detail,preview,arrow);
  if(thread.id===state.id)b.setAttribute('aria-current','true');
  b.onclick=()=>{if(busy)return;openTrip(thread.id,'chat');};
  list.append(b);
 });
}
function save(){archiveCurrent();try{localStorage.setItem(STORAGE,JSON.stringify(state));localStorage.setItem(ARCHIVE,JSON.stringify(threads));$('save-state').textContent='Сохранено в браузере';}catch{$('save-state').textContent='Сохранение недоступно';}renderHistory();renderTrips();renderBudget();renderCompanion();}
function messageElement(m){
 const el=document.createElement('div');el.className='message '+(m.role==='user'?'user':'bot');
 const label=document.createElement('div');label.className='message-label';
 if(m.role==='user')label.textContent='ВЫ';else{label.innerHTML='<span class="assistant-avatar" aria-hidden="true">ai</span>';label.append(document.createTextNode('Попутчик'));}
 const content=document.createElement('div');content.className='message-content';
 if(m.role==='user')content.textContent=m.content;else{
  m.content.replace('Это демонстрационный план. ', '').replace('Чтоб лента завидовала, а поездка запомнилась:', '').split('\n').filter(line=>line.trim()).forEach(line=>{
   if(/^День \d+$/.test(line)){const h=document.createElement('h3');h.className='reply-day';h.textContent=line;content.append(h);}
   else if(line.startsWith('• ')){const p=document.createElement('p');p.className='reply-place';const parts=line.slice(2).split(' — ');const strong=document.createElement('strong');strong.textContent=parts.shift();p.append(strong,document.createTextNode(parts.join(' — ')));const place=findChatPlace(strong.textContent,m.city);if(place)p.append(wantButton(place));content.append(p);}
   else{const p=document.createElement('p');p.className='reply-paragraph';p.textContent=line;content.append(p);}
  });
  if(!m.content.includes('Готовлю ответ')){const actions=document.createElement('div');actions.className='reply-actions';const copy=document.createElement('button');copy.textContent='Копировать';copy.onclick=async()=>{try{await navigator.clipboard.writeText(m.content);toast('Ответ скопирован');}catch{toast('Выделите текст ответа, чтобы скопировать');}};actions.append(copy);if(/^День \d+$/m.test(m.content)){const route=document.createElement('a');route.href='#route';route.textContent='Текущий маршрут ↗';actions.append(route);}if(m.kind==='packing'){const packing=document.createElement('a');packing.href='#packing';packing.textContent='Открыть чек-лист ↗';actions.append(packing);}if(m.kind==='destinations'&&m.criteria)content.append(destinationCards(m.criteria));el.append(label,content,actions);return el;}
 }
 el.append(label,content);return el;
}
function renderChat(){$('welcome').hidden=state.messages.length>0;$('followups').hidden=!state.messages.length;$('chat').replaceChildren(...state.messages.map(messageElement));$('chat').scrollTop=$('chat').scrollHeight;}
function renderRoute(){const ready=state.plan.length>0;$('delete-route').hidden=!ready;$('delete-route').disabled=busy;$('route-empty').hidden=ready;$('route-content').hidden=!ready;$('export').hidden=!ready;if(ready)renderPlan();else{$('plan-title').textContent='Маршрут';}}
function navigate(){const page=['chat','route','trips','packing'].includes(location.hash.slice(1))?location.hash.slice(1):'chat';document.querySelectorAll('.page').forEach(el=>el.hidden=el.id!==page+'-page');document.querySelectorAll('[data-page]').forEach(a=>{const active=a.dataset.page===page||((page==='route'||page==='packing')&&a.dataset.page==='trips');a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});$('page-label').textContent={chat:'Ассистент',route:'Маршрут',trips:'Мои поездки',packing:'Сборы'}[page];document.querySelector('.header-number').textContent={chat:'01',route:'03',trips:'02',packing:'04'}[page];document.title='Попутчик — '+$('page-label').textContent;if(page==='chat')$('input').focus();}
function rebuild(previous=state.plan){state.plan=createPlan(state.city,state.days,state.pace,TravelTools.interests(state.preferences,state.interests),previous);state.day=Math.min(state.day,state.days-1);renderRoute();}
function planText(){return state.plan.map((places,i)=>'День '+(i+1)+'\n'+places.map(p=>'• '+p.name+' — '+p.description).join('\n')).join('\n\n');}
function setBusy(value){busy=value;$('send').disabled=value;$('new-trip').disabled=value;$('trips-new').disabled=value;document.querySelectorAll('[data-prompt]').forEach(b=>b.disabled=value);renderRoute();renderHistory();renderTrips();renderBudget();renderCompanion();}
async function ask(text){text=text.trim();if(!text||busy)return;state.messages.push({role:'user',content:text});$('input').value='';renderChat();setBusy(true);const typing=messageElement({role:'assistant',content:'Готовлю ответ…'});typing.classList.add('typing');$('chat').append(typing);$('chat').scrollTop=$('chat').scrollHeight;try{const sharedDates=Companion.extractDates(text,state.days);if(sharedDates)applyTripDates(sharedDates.start,sharedDates.end);if(handleDestinationRequest(text)){return;}state.preferences=TravelTools.infer(text,state.preferences);const response=await getReply(state.messages,state);const previous=response.city&&response.city!==state.city?[]:state.plan;if(response.city&&response.city!==state.city){cancelForecast();state.packing.weather=null;state.city=response.city;}const days=text.match(/(?:на|за)\s*([1-3]|один|одну|два|двое|три)\s*(?:дн|ден|сут)/i);if(days)changeTripLength(({один:1,одну:1,два:2,двое:2,три:3}[days[1].toLowerCase()]||Number(days[1])));if(response.action==='free'&&!state.interests.includes('free'))state.interests.push('free');if(response.action==='slow')state.pace='slow';if(response.action==='walks')state.interests=['walks','architecture'];if(response.action==='instagram')response.reply=instagramReply(state.city);const routeAction=(response.action&&response.action!=='instagram')||days;if(routeAction){rebuild(previous);response.reply=DESTINATIONS[state.city].name+' · '+state.days+' дн.\n\n'+planText()+'\n\nМожете уточнить пожелания здесь или открыть «Маршрут», чтобы закрепить и заменить места.';}state.messages.push({role:'assistant',content:response.reply,city:state.city});}catch{state.messages.push({role:'assistant',content:'Не удалось получить ответ. Попробуйте ещё раз.'});}finally{setBusy(false);renderChat();save();if(!location.hash||location.hash==='#chat')$('input').focus();}}
$('chat-form').onsubmit=e=>{e.preventDefault();ask($('input').value);};$('input').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();ask($('input').value);}};
document.querySelectorAll('[data-prompt]').forEach(b=>b.onclick=()=>ask(b.dataset.prompt));
$('new-trip').onclick=()=>{archiveCurrent();state=freshState();renderChat();renderRoute();save();location.hash='chat';$('input').focus();};
window.addEventListener('hashchange',navigate);
function renderPlan(){const dest=DESTINATIONS[state.city];$('plan-title').textContent=dest.name+', '+state.days+(['',' день',' дня',' дня'][state.days])+' открытий';$('plan-summary').textContent=dest.country+' / '+(state.pace==='slow'?'Без спешки':state.pace==='active'?'Насыщенный темп':'Всё в меру')+'';$('day-tabs').replaceChildren();for(let d=0;d<state.days;d++){const b=document.createElement('button');b.className='day-tab'+(state.day===d?' active':'');b.textContent='День '+(d+1)+(routeDate(d)?' · '+routeDate(d):'');b.setAttribute('role','tab');b.setAttribute('aria-selected',state.day===d);b.onclick=()=>{state.day=d;renderPlan();save();};$('day-tabs').append(b);}$('day-title').textContent=['Первые знакомства','Почувствовать город','Ещё немного открытий'][state.day];if(routeDate(state.day))$('day-title').textContent=routeDate(state.day)+' · '+$('day-title').textContent;$('day-map').href=TravelTools.dayMap(state.plan[state.day],state.city);$('day-map').hidden=!state.plan[state.day].length;$('day-count').textContent=state.plan[state.day].length+' места';$('places').replaceChildren();state.plan[state.day].forEach((place,index)=>{const el=document.createElement('article');el.className='place';el.innerHTML='<span class="place-number">'+String(index+1).padStart(2,'0')+'</span><div class="place-body"><h4></h4><p></p><div class="place-tags"><span class="place-tag type"></span><span class="place-tag cost"></span><span class="duration"></span></div><div class="place-actions"><button class="pin"></button><button class="replace">Заменить ↗</button></div></div>';el.querySelector('h4').textContent=place.name;el.querySelector('p').textContent=place.description;el.querySelector('.type').textContent=TYPE_LABELS[place.type]||'Место';el.querySelector('.cost').textContent=place.free?'Без билета*':'По билету*';el.querySelector('.cost').classList.toggle('free',place.free);el.querySelector('.duration').textContent=place.duration;const pin=el.querySelector('.pin');pin.textContent=place.pinned?'◆ Закреплено':'◇ Закрепить';pin.classList.toggle('pinned',place.pinned);pin.setAttribute('aria-pressed',place.pinned);pin.disabled=busy;pin.onclick=()=>{place.pinned=!place.pinned;renderPlan();save();};const replace=el.querySelector('.replace');replace.disabled=place.pinned||busy;replace.title=place.pinned?'Сначала открепите место':'Предложить другое место';replace.onclick=()=>{if(replacePlace(state,state.day,index)){renderPlan();save();toast('Предложил другое место');}else toast('Других мест в демонстрационном наборе нет');};el.querySelector('.place-body').append(placeLinks(place));$('places').append(el);});}
$('export').onclick=()=>{const lines=['Попутчик — ДЕМОНСТРАЦИОННЫЙ ПЛАН',DESTINATIONS[state.city].name,'Факты, время и условия посещения требуют проверки.',''];state.plan.forEach((places,day)=>{lines.push('День '+(day+1));places.forEach(p=>lines.push('• '+p.name+' — '+p.description+(p.pinned?' [закреплено]':'')));lines.push('');});lines.push('Официальный сайт: '+DESTINATIONS[state.city].url);const url=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='poputchik-'+state.city+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('План скачан');};
ensureCompanionState();renderChat();renderRoute();navigate();save();


$('trip-search').oninput=renderTrips;
$('trips-new').onclick=()=>$('new-trip').click();







$('preferences-done').onclick=()=>$('trip-preferences').open=false;
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('trip-preferences').open=false;});






initCompanion();
$('delete-route').onclick=()=>requestDelete('route',state.id);
$('delete-cancel').onclick=()=>{$('delete-dialog').close();pendingDeletion=null;};
$('delete-confirm').onclick=confirmDelete;

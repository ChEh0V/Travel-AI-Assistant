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
function ticketLink(place,date,time){
 const url=TravelTools.ticket(place);
 if(!url)return null;
 const link=document.createElement('a');
 link.href=url;
 link.target='_blank';
 link.rel='noopener noreferrer';
 link.className='ticket-link';
 const planned=[date,time].filter(Boolean).join(', ');
 link.textContent=planned?'Проверить билет · '+planned+' ↗':'Официальные билеты ↗';
 link.title='Выберите дату и проверьте свободное время на официальном сайте';
 return link;
}
function tourLink(place){
 const tour=TravelTools.tour(place);
 if(!tour)return null;
 const link=document.createElement('a');
 link.href=tour.url;
 link.target='_blank';
 link.rel='noopener noreferrer';
 link.className='ticket-link';
 link.textContent=tour.label+' · по желанию ↗';
 link.title='Отдельное бронирование у организатора';
 return link;
}
const availabilityChecks=new Map();
function showCruiseAvailability(link,place,date,plannedTime,people){
 if(place.id!=='paris-2'||!date||date<Companion.today())return;
 const status=document.createElement('span');
 status.className='availability-status';
 status.textContent='Проверяем рейсы…';
 link.after(status);
 const key=date+':'+people;
 let check=availabilityChecks.get(key);
 if(!check||Date.now()>=check.expires){
  if(availabilityChecks.size>=40)availabilityChecks.delete(availabilityChecks.keys().next().value);
  const params=new URLSearchParams({place:place.id,date,people});
  const result=fetch('/api/ticket-availability?'+params,{signal:AbortSignal.timeout(10000)})
   .then(response=>response.ok?response.json():null).catch(()=>null);
  check={result,expires:Date.now()+60000};
  availabilityChecks.set(key,check);
 }
 check.result.then(result=>{
  if(!status.isConnected)return;
  if(result?.status==='available'&&result.times?.length){
   const minutes=time=>Number(time.slice(0,2))*60+Number(time.slice(3,5));
   const target=plannedTime?minutes(plannedTime):minutes(result.times[0]);
   const closest=result.times.reduce((best,time)=>
    Math.abs(minutes(time)-target)<Math.abs(minutes(best)-target)?time:best);
   status.textContent='Есть рейс в '+closest+' · на '+people+(people===1?' человека':' человек');
   status.classList.add('availability-found');
   status.title='Другие свободные рейсы: '+result.times.join(', ');
  }else if(result?.status==='no_slots'){
   link.textContent='Календарь круиза ↗';
   status.textContent='На эту дату свободных рейсов не найдено';
  }else status.textContent='Не удалось проверить свободные рейсы';
 });
}
function placeLinks(place,visitDate,visitTime,isoDate){
 const el=document.createElement('div');el.className='place-links';
 const map=document.createElement('a');map.href=TravelTools.maps(place,state.city);map.target='_blank';map.rel='noopener noreferrer';map.textContent='На карте и отзывы ↗';el.append(map);
 const ticket=ticketLink(place,visitDate,visitTime);if(ticket)el.append(ticket);
 const tour=tourLink(place);if(tour){
  el.append(tour);
  showCruiseAvailability(tour,place,isoDate,visitTime,state.preferences?.company==='Вдвоём'?2:1);
 }
 if(place.id==='rome-3'){
  const availability=document.createElement('a');
  availability.href='https://disponibilita.museivaticani.va/';
  availability.target='_blank';
  availability.rel='noopener noreferrer';
  availability.textContent='Календарь доступности ↗';
  el.append(availability);
 }
 if(place.id==='lisbon-3'){
  const visit=document.createElement('a');
  visit.href='https://www.museusemonumentos.pt/en/museus-e-monumentos/museu-nacional-do-azulejo';
  visit.target='_blank';
  visit.rel='noopener noreferrer';
  visit.textContent='Проверить статус музея ↗';
  el.append(visit);
 }
 return el;
}
const preferenceGroups={stay:{label:'Жильё',options:['Хостел','Отель','Комфорт']},food:{label:'Еда',options:['Перекусы','Кафе','Рестораны']},transport:{label:'Передвижение',options:['Пешком','Общественный','Такси']},activities:{label:'Впечатления',options:['Бесплатное','Микс','Без ограничений']},company:{label:'С кем едете?',options:TravelTools.companies,default:'Не важно'}};
function renderPreferences(){
 state.preferences=state.preferences&&typeof state.preferences==='object'?state.preferences:{};delete state.preferences.vibe;
 const container=$('preference-options');container.replaceChildren();
 Object.entries(preferenceGroups).forEach(([key,group])=>{
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
 if(m.role==='user')label.textContent='ВЫ';else{label.classList.add('assistant-name');label.textContent='Попутчик';}
 const content=document.createElement('div');content.className='message-content';
 if(m.role==='user')content.textContent=m.content;else{
  let visitDate=null;
  let isoDate=null;
  m.content.replace('Это демонстрационный план. ', '').replace('Чтоб лента завидовала, а поездка запомнилась:', '').split('\n').filter(line=>line.trim()).forEach(line=>{
   const day=line.match(/^День (\d+)(?: · (.+))?$/);
   if(day){
    visitDate=day[2]??null;
    const offset=Companion.day(m.tripStart)+Number(day[1])-1;
    isoDate=Number.isFinite(offset)?new Date(offset*86400000).toISOString().slice(0,10):null;
    const h=document.createElement('h3');h.className='reply-day';h.textContent=line;content.append(h);
   }else if(line.startsWith('• ')){
    const p=document.createElement('p');p.className='reply-place';
    const parts=line.slice(2).split(' — ');
    const heading=parts.shift();
    const timed=heading.match(/^(\d{2}:\d{2})(?: \(след\. день\))?–\d{2}:\d{2}(?: \(след\. день\))? (.+)$/);
    const strong=document.createElement('strong');strong.textContent=heading;
    p.append(strong,document.createTextNode(parts.join(' — ')));
    const place=findChatPlace(timed?.[2]??heading,m.city);
    if(place){
     p.append(wantButton(place));
     const ticket=ticketLink(place,visitDate,timed?.[1]);
     if(ticket)p.append(ticket);
     const tour=tourLink(place);
     if(tour){
      p.append(tour);
      showCruiseAvailability(tour,place,isoDate,timed?.[1],m.tripPeople??1);
     }
    }
    content.append(p);
   }
   else{const p=document.createElement('p');p.className='reply-paragraph';p.textContent=line;content.append(p);}
  });
  for(const source of (Array.isArray(m.sources)?m.sources:[])){
   if(!source || !/^https:\/\//i.test(source.url))continue;
   const link=document.createElement('a');link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';
   link.textContent='['+source.id+'] '+(source.credit || 'Источник')+' · проверено '+String(source.checked).slice(0,10);
   const row=document.createElement('p');row.append(link);
   if(source.license_url?.startsWith('https://creativecommons.org/')){
    const license=document.createElement('a');license.href=source.license_url;license.textContent='CC BY-SA 4.0';
    row.append(document.createTextNode(' · '),license);
   }
   content.append(row);
  }
  if(!m.content.includes('Готовлю ответ')){const actions=document.createElement('div');actions.className='reply-actions';const copy=document.createElement('button');copy.textContent='Копировать';copy.onclick=async()=>{try{await navigator.clipboard.writeText(m.content);toast('Ответ скопирован');}catch{toast('Выделите текст ответа, чтобы скопировать');}};actions.append(copy);if(/^День \d+(?: · .+)?$/m.test(m.content)){const route=document.createElement('a');route.href='#route';route.className='reply-route-link';route.textContent='Текущий маршрут ↗';actions.append(route);}if(m.kind==='packing'){const packing=document.createElement('a');packing.href='#packing';packing.textContent='Открыть чек-лист ↗';actions.append(packing);}if(m.kind==='destinations'&&m.criteria)content.append(destinationCards(m.criteria));el.append(label,content,actions);return el;}
 }
 el.append(label,content);return el;
}
function renderChat(){$('welcome').hidden=state.messages.length>0;$('chat').replaceChildren(...state.messages.map(messageElement));$('chat').scrollTop=$('chat').scrollHeight;}
function renderRoute(){const ready=state.plan.length>0;$('delete-route').hidden=!ready;$('delete-route').disabled=busy;$('route-empty').hidden=ready;$('route-content').hidden=!ready;$('export').hidden=!ready;if(ready)renderPlan();else{$('plan-title').textContent='Маршрут';}}
function navigate(){const page=['chat','route','trips','packing'].includes(location.hash.slice(1))?location.hash.slice(1):'chat';document.querySelectorAll('.page').forEach(el=>el.hidden=el.id!==page+'-page');document.querySelectorAll('[data-page]').forEach(a=>{const active=a.dataset.page===page||((page==='route'||page==='packing')&&a.dataset.page==='trips');a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});$('page-label').textContent={chat:'Ассистент',route:'Маршрут',trips:'Мои поездки',packing:'Сборы'}[page];document.title='Попутчик — '+$('page-label').textContent;$('chat-route-shortcut').hidden=page!=='chat';if(page==='chat')$('input').focus();}
function addTicketStops({walksOnly=false}={}){
 const changes=[];
 const suitable=place=>TravelTools.ticket(place)&&(!walksOnly||place.type!=='art');
 for(const day of state.plan){
  if(day.some(place=>TravelTools.ticket(place)))continue;
  const index=day.findLastIndex(place=>place.free&&!place.pinned&&!TravelTools.tour(place));
  if(index<0)continue;
  const next=replacementOptions(state).find(suitable);
  const old=day[index];
  if(next){
   day[index]={...next,pinned:false};
  }else{
   const donor=state.plan.find(other=>other!==day&&other.filter(place=>TravelTools.ticket(place)).length>1&&
    other.some(place=>!place.pinned&&suitable(place)));
   if(!donor)continue;
   const source=donor.findIndex(place=>!place.pinned&&suitable(place));
   [day[index],donor[source]]=[donor[source],old];
   changes.push({from:day[index].name,to:old.name});
  }
  changes.push({from:old.name,to:day[index].name});
 }
 return changes;
}
function rebuild(previous=state.plan){
 const interests=TravelTools.interests(state.preferences,state.interests);
 state.plan=createPlan(state.city,state.days,state.pace,interests,previous);
 if(!interests.includes('free'))addTicketStops({walksOnly:state.avoidMuseums===true});
 state.day=Math.min(state.day,state.days-1);
 renderRoute();
}
function tripPlanMessage(content){
 return {role:'assistant',city:state.city,content,tripStart:state.dates?.start,
  tripPeople:state.preferences?.company==='Вдвоём'?2:1};
}
function scheduleDay(day){return TravelTools.daySchedule(state.plan[day],state.startTimes?.[day]);}
function planText(){
 return state.plan.map((places,day)=>{
  const date=routeDate(day);
  const heading='День '+(day+1)+(date?' · '+date:'');
  const lines=scheduleDay(day).map(({place,start,end})=>'• '+start+'–'+end+' '+place.name+' — '+place.description);
  return [heading,...lines].join('\n');
 }).join('\n\n');
}
function planTimingNote(){
 const ticketed=state.plan.flat().some(place=>TravelTools.ticket(place));
 return 'Время местное и ориентировочное.'+(ticketed?' Свободные сеансы проверьте по билетным ссылкам.':'');
}
function renderDayHours(schedule){
 const input=$('route-start');
 input.value=state.startTimes?.[state.day]??'10:00';
 input.disabled=busy||!schedule.length;
 $('route-hours-status').textContent=schedule.some(item=>item.endsNextDay)
  ?'Остановки выходят за пределы дня. Начните раньше или сократите план.'
  :'Время местное и ориентировочное · между местами заложено 30 минут.';
}
$('route-start').onchange=event=>{
 if(busy||!event.target.value||!state.plan.length)return;
 if(!state.startTimes||typeof state.startTimes!=='object')state.startTimes={};
 state.startTimes[state.day]=event.target.value;
 renderPlan();
 save();
};
function setBusy(value){busy=value;$('send').disabled=value;$('new-trip').disabled=value;$('trips-new').disabled=value;document.querySelectorAll('[data-prompt]').forEach(b=>b.disabled=value);renderRoute();renderHistory();renderTrips();renderBudget();renderCompanion();}
async function ask(text,{settings=false}={}){text=text.trim();if(!text||busy)return;state.messages.push({role:'user',content:text});if(!settings)$('input').value='';renderChat();setBusy(true);const typing=messageElement({role:'assistant',content:'Готовлю ответ…'});typing.classList.add('typing');$('chat').append(typing);$('chat').scrollTop=$('chat').scrollHeight;try{const sharedDates=Companion.extractDates(text,state.days);if(sharedDates)applyTripDates(sharedDates.start,sharedDates.end);if(!settings&&(handleWishlistPlan(text)||handleDestinationRequest(text)))return;
if(!settings&&/^добавь (?:несколько )?мест[а]? с билетами[.!?]?$/i.test(text)){
 const changes=addTicketStops();
 if(changes.length){
  state.preferences.activities='Микс';
  state.interests=state.interests.filter(interest=>interest!=='free');
 }
 const reply=changes.length
  ?changes.map(change=>'Вместо «'+change.from+'» — «'+change.to+'».').join('\n')+'\n\n'+planText()+'\n\n'+planTimingNote()
  :state.plan.length?'В этом плане уже есть билетные остановки или нет свободных мест для замены.':'Сначала соберите маршрут по нужному городу.';
 state.messages.push(tripPlanMessage(reply));
 return;
}
if(!settings&&state.plan.length&&/^(?:покажи|пришли|выведи)\s+(?:мне\s+)?(?:текущий\s+)?маршрут(?:\s+по\s+часам)?[.!?]?$/i.test(text)){
 state.messages.push(tripPlanMessage(planText()+'\n\n'+planTimingNote()));
 return;
}
if(!settings)state.preferences=TravelTools.infer(text,state.preferences);const response=await (settings?tripAdvice(state.messages,state):getReply(state.messages,state));if(response.action==='replace'){
 const {day,index,replacementId}=response.replacement;
 const old=state.plan[day]?.[index];
 let reply;
 if(!old)reply='Такой остановки нет. Откройте маршрут и проверьте номер места и день.';
 else if(old.pinned)reply='«'+old.name+'» закреплено. Сначала открепите это место в маршруте.';
 else if(!replacePlace(state,day,index,replacementId))reply='В каталоге больше нет свободных мест для замены в этом городе.';
 else reply='В дне '+(day+1)+' заменил «'+old.name+'» на «'+state.plan[day][index].name+'».';
 state.messages.push({role:'assistant',content:reply,city:state.city});
 return;
}if(response.reference){state.messages.push({role:'assistant',content:response.reply,sources:response.sources});return;}const previous=response.city&&response.city!==state.city?[]:state.plan;if(response.city&&response.city!==state.city){cancelForecast();state.packing.weather=null;state.city=response.city;}const days=text.match(/(?:на|за)\s*([1-3]|один|одну|два|двое|три)\s*(?:дн|ден|сут)/i);if(days)changeTripLength(({один:1,одну:1,два:2,двое:2,три:3}[days[1].toLowerCase()]||Number(days[1])));if(response.action==='free'&&!state.interests.includes('free'))state.interests.push('free');if(response.action==='slow')state.pace='slow';if(response.action==='walks'){state.interests=['walks','architecture'];state.avoidMuseums=true;}if(response.action==='instagram')response.reply=instagramReply(state.city);const routeAction=(response.action&&response.action!=='instagram')||days;if(routeAction){rebuild(previous);response.reply=DESTINATIONS[state.city].name+' · '+state.days+' дн.\n\n'+planText()+'\n\n'+planTimingNote()+'\n\nОстановки можно перетаскивать в маршруте. Если хотите заменить место, просто назовите его в чате.';}state.messages.push(routeAction?tripPlanMessage(response.reply):{role:'assistant',content:response.reply,city:state.city});}catch{state.messages.push({role:'assistant',content:'Не удалось получить ответ. Попробуйте ещё раз.'});}finally{setBusy(false);renderChat();save();if(!location.hash||location.hash==='#chat')$('input').focus();}}
$('chat-form').onsubmit=e=>{e.preventDefault();ask($('input').value);};$('input').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();ask($('input').value);}};
document.querySelectorAll('[data-prompt]').forEach(b=>b.onclick=()=>ask(b.dataset.prompt));
function openReplacement(day,index){
 const original=state.plan[day]?.[index];
 if(busy||!original||original.pinned)return;
 const dialog=$('replacement-dialog');
 const query=$('replacement-query');
 const favoritesOnly=$('replacement-favorites');
 const list=$('replacement-options');
 $('replacement-current').textContent='Вместо «'+original.name+'» · День '+(day+1);
 query.value='';
 favoritesOnly.checked=false;
 const renderOptions=()=>{
  const search=query.value.trim().toLowerCase().replace(/ё/g,'е');
  const favorites=new Set(state.wishlist.filter(place=>place.city===state.city).map(place=>place.id));
  const options=replacementOptions(state).filter(place=>
   (!favoritesOnly.checked||favorites.has(place.id))&&place.name.toLowerCase().replace(/ё/g,'е').includes(search));
  list.replaceChildren();
  if(!options.length){
   const empty=document.createElement('p');
   empty.textContent=favoritesOnly.checked?'В «Хочу сюда» нет подходящих свободных мест для этой поездки.':'Свободных мест по этому запросу нет.';
   list.append(empty);
  }
  for(const place of options){
   const button=document.createElement('button');
   button.type='button';
   button.className='replacement-option';
   button.textContent=(favorites.has(place.id)?'♥ ':'')+place.name+(TravelTools.ticket(place)?' · по билету':'');
   button.onclick=()=>{
    if(busy||state.plan[day]?.[index]?.id!==original.id||!replacePlace(state,day,index,place.id))return;
    dialog.close();
    renderRoute();
    save();
    toast('Остановка заменена');
    $('places').children[index]?.querySelector('.choose-replacement')?.focus();
   };
   list.append(button);
  }
 };
 query.oninput=renderOptions;
 favoritesOnly.onchange=renderOptions;
 renderOptions();
 dialog.showModal();
 query.focus();
}

$('new-trip').onclick=()=>{archiveCurrent();state=freshState();renderChat();renderRoute();save();location.hash='chat';$('input').focus();};
window.addEventListener('hashchange',navigate);
$('add-ticket-stops').onclick=()=>{
 location.hash='chat';
 navigate();
 ask('Добавь места с билетами');
};
function renderPlan(){renderRouteWeather();
 const addTickets=$('add-ticket-stops');
 const canReplace=state.plan.some(day=>!day.some(place=>TravelTools.ticket(place))&&
  day.some(place=>place.free&&!place.pinned&&!TravelTools.tour(place)));
 addTickets.hidden=!(canReplace&&replacementOptions(state).some(place=>TravelTools.ticket(place)));
 addTickets.disabled=busy;
 const dest=DESTINATIONS[state.city];$('plan-title').textContent=dest.name+', '+state.days+(['',' день',' дня',' дня'][state.days])+' открытий';$('plan-summary').textContent=dest.country+' / '+(state.pace==='slow'?'Без спешки':state.pace==='active'?'Насыщенный темп':'Всё в меру')+'';$('day-tabs').replaceChildren();for(let d=0;d<state.days;d++){const b=document.createElement('button');b.className='day-tab'+(state.day===d?' active':'');b.textContent='День '+(d+1)+(routeDate(d)?' · '+routeDate(d):'');b.setAttribute('role','tab');b.setAttribute('aria-selected',state.day===d);b.onclick=()=>{state.day=d;renderPlan();save();};$('day-tabs').append(b);}$('day-title').textContent=['Первые знакомства','Почувствовать город','Ещё немного открытий'][state.day];if(routeDate(state.day))$('day-title').textContent=routeDate(state.day)+' · '+$('day-title').textContent;$('day-map').href=TravelTools.dayMap(state.plan[state.day],state.city);$('day-map').hidden=!state.plan[state.day].length;$('day-count').textContent=state.plan[state.day].length+' места';$('places').replaceChildren();const places=state.plan[state.day];let dragFrom=null;const schedule=scheduleDay(state.day);renderDayHours(schedule);places.forEach((place,index)=>{const el=document.createElement('article');el.className='place';el.innerHTML='<span class="place-number" aria-hidden="true">⋮⋮ '+String(index+1).padStart(2,'0')+'</span><div class="place-body"><span class="place-time"></span><h4></h4><p></p><div class="place-tags"><span class="place-tag type"></span><span class="place-tag cost"></span><span class="duration"></span></div><div class="place-actions"><button class="pin"></button><button type="button" class="choose-replacement">Заменить</button><div class="place-order"><button type="button" class="move-up">↑</button><button type="button" class="move-down">↓</button></div></div></div>';el.querySelector('.place-time').textContent=schedule[index].start+'–'+schedule[index].end;el.querySelector('h4').textContent=place.name;el.querySelector('p').textContent=place.description;el.querySelector('.type').textContent=TYPE_LABELS[place.type]||'Место';el.querySelector('.cost').textContent=place.id==='lisbon-3'?'Уточнить открытие':place.free?'Без билета*':'По билету*';el.querySelector('.cost').classList.toggle('free',place.free);el.querySelector('.duration').textContent=place.duration;const pin=el.querySelector('.pin');pin.textContent=place.pinned?'◆ Закреплено':'◇ Закрепить';pin.classList.toggle('pinned',place.pinned);pin.setAttribute('aria-pressed',place.pinned);pin.disabled=busy;pin.onclick=()=>{place.pinned=!place.pinned;renderPlan();save();};const replace=el.querySelector('.choose-replacement');
 replace.disabled=busy||place.pinned;
 replace.title=place.pinned?'Сначала открепите место':'Выбрать другое место';
 replace.onclick=()=>openReplacement(state.day,index);
 el.draggable=!busy;
 let fromControl=false;
 el.addEventListener('pointerdown',event=>{fromControl=!!event.target.closest('button,a,input');});
 const move=(target)=>{
  if(busy||!swapPlaces(places,index,target))return false;
  renderPlan();
  save();
  return true;
 };
 el.addEventListener('dragstart',event=>{
  if(busy||fromControl){event.preventDefault();return;}
  dragFrom=index;
  event.dataTransfer.effectAllowed='move';
  event.dataTransfer.setData('text/plain',place.name);
  el.classList.add('dragging');
 });
 el.addEventListener('dragend',()=>{
  dragFrom=null;
  el.classList.remove('dragging');
 });
 el.addEventListener('dragover',event=>{
  if(busy||dragFrom===null||dragFrom===index)return;
  event.preventDefault();
  event.dataTransfer.dropEffect='move';
  el.classList.add('drop-target');
 });
 el.addEventListener('dragleave',event=>{
  if(!el.contains(event.relatedTarget))el.classList.remove('drop-target');
 });
 el.addEventListener('drop',event=>{
  el.classList.remove('drop-target');
  if(busy||dragFrom===null)return;
  event.preventDefault();
  if(swapPlaces(places,dragFrom,index)){renderPlan();save();}
 });
 for(const [selector,offset,label] of [['.move-up',-1,'Выше'],['.move-down',1,'Ниже']]){
  const button=el.querySelector(selector);
  const target=index+offset;
  button.disabled=busy||!places[target];
  button.setAttribute('aria-label',label+': '+place.name);
  button.title=label;
  button.onclick=()=>{
   if(move(target)){
    const card=$('places').children[target];
    const next=card.querySelector(selector);
    (next.disabled?card.querySelector('.pin'):next).focus();
   }
  };
 }
 const links=placeLinks(place,routeDate(state.day),schedule[index].start,routeDayKey(state.day));
 links.querySelectorAll('a').forEach(link=>link.draggable=false);
 el.querySelector('.place-body').append(links);$('places').append(el);});}
$('export').onclick=()=>{
 const lines=['Попутчик · '+DESTINATIONS[state.city].name,planTimingNote(),''];
 state.plan.forEach((places,day)=>{
  lines.push('День '+(day+1)+(routeDate(day)?' · '+routeDate(day):''));
  for(const {place,start,end} of scheduleDay(day)){
   lines.push(start+'–'+end+' · '+place.name+' — '+place.description+(place.pinned?' [закреплено]':''));
   const ticket=TravelTools.ticket(place);
   if(ticket)lines.push(ticket);
   const tour=TravelTools.tour(place);
   if(tour)lines.push(tour.label+' (по желанию): '+tour.url);
  }
  lines.push('');
 });
 const url=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='poputchik-'+state.city+'.txt';a.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);toast('План скачан');
};
ensureCompanionState();renderChat();renderRoute();navigate();save();


$('trip-search').oninput=renderTrips;
$('trips-new').onclick=()=>$('new-trip').click();







$('preferences-done').onclick=()=>{
 if(busy)return;
 const choices=Object.entries(preferenceGroups).map(([key,group])=>group.label.replace(/\?$/,'')+': '+state.preferences[key]);
 $('trip-preferences').open=false;
 ask('Мои настройки поездки\n'+choices.join('\n')+'\nЧто посоветуешь с учётом этих пожеланий?',{settings:true});
};
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('trip-preferences').open=false;});






initCompanion();
$('delete-route').onclick=()=>requestDelete('route',state.id);
$('delete-cancel').onclick=()=>{$('delete-dialog').close();pendingDeletion=null;};
$('delete-confirm').onclick=confirmDelete;

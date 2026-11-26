let forecastController=null;
let forecastStatus='';
function tripDateLabel(){return state.dates?.start&&state.dates?.end?state.dates.start.split('-').reverse().join('.')+' — '+state.dates.end.split('-').reverse().join('.'):'Даты пока не выбраны';}
function routeDayKey(index){return state.dates?.start?new Date((Companion.day(state.dates.start)+index)*86400000).toISOString().slice(0,10):null;}
function routeDate(index){const date=routeDayKey(index);return date?new Intl.DateTimeFormat('ru-RU',{timeZone:'UTC',day:'numeric',month:'short'}).format(new Date(date)):null;}
function ensureCompanionState(){
 state.packing=Companion.normalizePacking(state.packing);
 const previous=state.dates||{start:state.packing.start,end:state.packing.end};
 state.dates=Companion.dateRange(previous.start,previous.end).valid?{start:previous.start,end:previous.end}:{start:'',end:''};
 state.packing.start=state.dates.start;state.packing.end=state.dates.end;
 state.wishlist=Array.isArray(state.wishlist)?state.wishlist.filter(p=>p&&typeof p.id==='string'&&DESTINATIONS[p.city]&&typeof p.name==='string'):[];
}
function cancelForecast(){if(forecastController)forecastController.abort();forecastController=null;forecastStatus='';}
function findChatPlace(name,preferredCity){
 const cities=[preferredCity,state.city,...Object.keys(DESTINATIONS)].filter((v,i,a)=>DESTINATIONS[v]&&a.indexOf(v)===i);
 for(const city of cities){const index=DESTINATIONS[city].places.findIndex(p=>p[0]===name);if(index>=0){const p=DESTINATIONS[city].places[index];return {id:city+'-'+index,city,name:p[0],description:p[1],type:p[2],free:p[3],duration:p[2]==='art'?'~ 2 часа':'~ 1 час',pinned:false};}}
 return null;
}
function wantButton(place){
 const button=document.createElement('button');button.type='button';button.className='want-button';button.dataset.placeId=place.id;
 const selected=state.wishlist?.some(p=>p.id===place.id);button.textContent=selected?'♥ В «Хочу сюда»':'♡ Хочу сюда';button.setAttribute('aria-pressed',!!selected);
 button.onclick=()=>{if(busy)return;ensureCompanionState();const exists=state.wishlist.some(p=>p.id===place.id);state.wishlist=exists?state.wishlist.filter(p=>p.id!==place.id):[...state.wishlist,{...place}];save();toast(exists?'Место убрано из списка':'Сохранено в «Хочу сюда»');};return button;
}
function destinationCards(criteria){
 const wrapper=document.createElement('div');wrapper.className='destination-offers';
 (criteria.matches||[]).filter(match=>DESTINATIONS[match.city]).forEach(match=>{
  const card=document.createElement('article');card.className='destination-offer';const name=document.createElement('h3');name.textContent=DESTINATIONS[match.city].name;const country=document.createElement('span');country.textContent=DESTINATIONS[match.city].country;const reason=document.createElement('p');reason.textContent=match.reason;
  const button=document.createElement('button');button.type='button';button.className='secondary';button.disabled=busy;button.textContent='Выбрать и собрать маршрут ↗';
  button.onclick=()=>{if(busy)return;cancelForecast();if(state.city!==match.city){state.plan=[];state.packing.weather=null;}state.city=match.city;changeTripLength(criteria.days);state.day=0;if(criteria.calm)state.pace='slow';ask('Составь маршрут: '+DESTINATIONS[match.city].name+' на '+criteria.days+' дня');};
  card.append(country,name,reason,button);wrapper.append(card);
 });return wrapper;
}
function handleDestinationRequest(text){
 if(/чек.?лист|сборы|что взять|собрать чемодан/i.test(text)){state.messages.push({role:'assistant',content:state.plan.length?(state.dates.start?'Чек-лист готов на даты вашей поездки. В сборах — погода, рекомендации по одежде и отмечаемый список вещей.':'Чек-лист готов. Когда зададите общие даты поездки, добавим погодные советы по одежде.'):'Сначала выберем город поездки, затем подготовим сборы.',kind:state.plan.length?'packing':undefined});return true;}
 if(!/подбери (?:город|направление)|подобрать (?:город|направление)|куда поехать|(?:море|пляж).*(?:евро|€)/i.test(text))return false;
 const criteria=Companion.search(text);
 let reply='Вот направления, которые подходят по описанию. Выберите город — продолжим с маршрутом.';
 if(criteria.budget!==null)reply+='\n\nВаш ориентир: до '+criteria.budget+' € за '+criteria.requestedDays+' дн. Цены на ваши даты ещё не проверены. Уточните в чате, откуда едете и входит ли дорога в эту сумму.';
 if(criteria.requestedDays>3)reply+='\n\nСейчас пример маршрута можно собрать на 1–3 дня.';
 state.messages.push({role:'assistant',content:reply,kind:'destinations',criteria});return true;
}
function renderWishlist(){
 const list=$('wishlist-list');
 list.replaceChildren();
 if(!state.wishlist.length){
  const empty=document.createElement('li');
  empty.className='companion-empty';
  empty.textContent='Пока нет сохранённых мест.';
  list.append(empty);
 }
 for(const place of state.wishlist){
  const row=document.createElement('li');
  row.className='wish-row';
  const name=document.createElement('strong');
  name.textContent=place.name;
  const city=document.createElement('small');
  city.textContent=DESTINATIONS[place.city].name;
  const text=document.createElement('div');
  text.className='saved-place-name';
  text.append(name,city);
  const remove=document.createElement('button');
  remove.type='button';
  remove.className='wish-remove';
  remove.setAttribute('aria-label','Убрать '+place.name);
  remove.textContent='Убрать';
  remove.disabled=busy;
  remove.onclick=()=>{
   state.wishlist=state.wishlist.filter(saved=>saved.id!==place.id);
   save();
  };
  row.append(text,remove);
  list.append(row);
 }
}

function handleWishlistPlan(text){
 if(!/(?:собери|составь)\s+(?:мне\s+)?маршрут\s+из\s+[«"']?(?:хочу сюда|избранного)/i.test(text))return false;
 try{
  state.plan=Companion.wishlistPlan(state.wishlist,state.city,state.days);
  state.day=0;
  renderRoute();
  state.messages.push({role:'assistant',city:state.city,content:'Маршрут из «Хочу сюда» · '+DESTINATIONS[state.city].name+'\n\n'+planText()});
 }catch(error){
  state.messages.push({role:'assistant',content:error.message});
 }
 return true;
}
function renderRouteWeather(){
 const date=routeDayKey(state.day);
 const forecast=Companion.tripWeather(state);
 const day=forecast?.days.find(item=>item.date===date);
 const window=Companion.forecastWindow(state.dates.start,state.dates.end);
 const button=$('route-weather-refresh');
 button.hidden=!!date&&window!=='available';
 button.disabled=busy||!!forecastController;
 button.textContent=date?'Обновить прогноз':'Выбрать даты';
 $('route-weather-source').hidden=!day;
 const status=$('route-weather-status');
 $('route-weather-title').textContent=date?'Погода · '+routeDate(state.day):'Погода на день';
 status.classList.toggle('has-forecast',!!day&&!forecastController&&window==='available');
 if(!date)status.textContent='Выберите даты, чтобы увидеть прогноз.';
 else if(forecastController)status.textContent='Загружаем прогноз…';
 else if(window==='future')status.textContent='Прогноз появится ближе к поездке.';
 else if(window==='past')status.textContent='Дата уже прошла.';
 else if(day)status.textContent=Math.round(day.min)+'…'+Math.round(day.max)+' °C · вероятность осадков '+Math.round(day.rain)+'%';
 else if(forecastStatus)status.textContent='Не удалось загрузить прогноз. Попробуйте ещё раз.';
 else status.textContent='Прогноз пока не загружен.';
}

function renderPacking(){
 const p=state.packing;$('packing-city').textContent=state.plan.length?DESTINATIONS[state.city].name:'Выберите город в чате';
 $('packing-date-summary').textContent=tripDateLabel();
 $('packing-weather-refresh').disabled=busy||!!forecastController||!state.plan.length||!state.dates.start;
 const weather=Companion.tripWeather(state);const correct=!!weather;
 const window=Companion.forecastWindow(p.start,p.end);
 $('weather-status').textContent=forecastStatus||(correct?'Прогноз на даты поездки. Рекомендации добавлены в чек-лист. Обновлён '+new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(weather.updated))+'.':!p.start?'Задайте даты один раз в настройках поездки — они появятся здесь автоматически.':window==='future'?'До поездки ещё далеко: прогноз доступен только на ближайшие 16 дней. Базовый чек-лист уже готов.':window==='past'?'Для прошедших дат прогноз не запрашивается.':window==='invalid'?'Проверьте даты: от 1 до 30 дней.':'Нажмите «Обновить погоду», чтобы дополнить рекомендации на даты поездки.');
 $('weather-days').replaceChildren();
 if(correct)weather.days.forEach(day=>{const card=document.createElement('div');card.className='weather-day';const date=document.createElement('span');date.textContent=day.date.slice(8)+'.'+day.date.slice(5,7);const temperature=document.createElement('strong');temperature.textContent=Math.round(day.min)+'…'+Math.round(day.max)+' °C';const rain=document.createElement('small');rain.textContent='Осадки: '+Math.round(day.rain)+'%';card.append(date,temperature,rain);$('weather-days').append(card);});
 $('clothing-tips').replaceChildren();Companion.clothing(correct?weather:null).forEach(tip=>{const card=document.createElement('article');card.className='clothing-tip';const h=document.createElement('h3');h.textContent=tip.title;const text=document.createElement('p');text.textContent=tip.text;card.append(h,text);$('clothing-tips').append(card);});
 const items=Companion.packingItems({...p,weather:correct?weather:null},state.preferences?.company);const done=items.filter(item=>p.checked[item.id]).length;$('packing-count').textContent=done+' / '+items.length+' готово';$('packing-list').replaceChildren();let group='';
 items.forEach(item=>{if(group!==item.group){group=item.group;const h=document.createElement('h3');h.className='packing-group';h.textContent=group;$('packing-list').append(h);}const row=document.createElement('label');row.className='packing-item';const check=document.createElement('input');check.type='checkbox';check.checked=!!p.checked[item.id];check.disabled=busy;check.onchange=()=>{state.packing.checked[item.id]=check.checked;save();};const text=document.createElement('span');text.textContent=item.label;row.append(check,text);$('packing-list').append(row);});
 $('packing-add').querySelectorAll('input,button').forEach(el=>el.disabled=busy);
}
function renderCompanion(){
 ensureCompanionState();$('trip-date-button').textContent=state.dates.start?tripDateLabel():'Даты поездки';$('wishlist-count').textContent=state.wishlist.length;renderWishlist();renderPacking();renderRouteWeather();
 document.querySelectorAll('.want-button').forEach(b=>{const exists=state.wishlist.some(p=>p.id===b.dataset.placeId);b.textContent=exists?'♥ В «Хочу сюда»':'♡ Хочу сюда';b.setAttribute('aria-pressed',exists);b.disabled=busy;});
}
async function loadForecast(){
 cancelForecast();const p=state.packing;const range=Companion.dateRange(p.start,p.end);if(!range.valid){forecastStatus='Укажите корректный период от 1 до 30 дней.';renderPacking();return;}
 const window=Companion.forecastWindow(p.start,p.end);if(window!=='available'){renderPacking();return;}
 const tripId=state.id,city=state.city,start=p.start,end=p.end;const coords=Companion.coordinates[city];const controller=new AbortController();forecastController=controller;forecastStatus='Получаем прогноз на ваши даты…';renderPacking();renderRouteWeather();const timeout=setTimeout(()=>controller.abort(),12000);
 try{
  const params=new URLSearchParams({latitude:coords[0],longitude:coords[1],daily:'temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,uv_index_max',timezone:'auto',start_date:start,end_date:end});
  const response=await fetch('https://api.open-meteo.com/v1/forecast?'+params,{signal:controller.signal});if(!response.ok)throw new Error('Forecast HTTP '+response.status);const data=await response.json();const days=Companion.readForecast(data,start,end);
  if(state.id!==tripId||state.city!==city||state.packing.start!==start||state.packing.end!==end)return;
  state.packing.weather={city,start,end,days,updated:Date.now()};forecastStatus='';
 }catch{if(state.id===tripId&&forecastController===controller)forecastStatus='Не удалось получить погоду. Попробуйте ещё раз; базовый чек-лист доступен без сети.';}
 finally{clearTimeout(timeout);if(forecastController===controller){forecastController=null;save();}}
}
function initCompanion(){
 $('city-finder').onclick=()=>{if(!busy){$('finder-dialog').showModal();$('finder-input').focus();}};
 $('finder-form').onsubmit=e=>{e.preventDefault();const text=$('finder-input').value.trim();if(!text||busy)return;$('finder-dialog').close();location.hash='chat';ask('Подбери город: '+text);};
 $('open-wishlist').onclick=()=>{renderWishlist();$('wishlist-dialog').showModal();};
 document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
 $('trip-date-button').onclick=openTripDates;$('packing-edit-dates').onclick=openTripDates;
 $('packing-weather-refresh').onclick=()=>{if(!busy)loadForecast();};
 $('route-weather-refresh').onclick=()=>{if(!busy)(state.dates.start?loadForecast():openTripDates());};
 $('trip-start').onchange=()=>{const start=$('trip-start').value;$('trip-end').min=start||Companion.today();if(Companion.day(start))$('trip-end').max=new Date((Companion.day(start)+2)*86400000).toISOString().slice(0,10);};
 $('trip-dates-form').onsubmit=e=>{e.preventDefault();if(busy)return;const start=$('trip-start').value,end=$('trip-end').value;const range=Companion.dateRange(start,end);if(!range.valid||range.days>3){$('trip-dates-error').textContent='Выберите период от 1 до 3 дней.';return;}applyTripDates(start,end);$('trip-dates-dialog').close();if(state.plan.length&&Companion.forecastWindow(start,end)==='available')loadForecast();};
 $('packing-add').onsubmit=e=>{e.preventDefault();const label=$('packing-item').value.trim();if(!label||busy)return;state.packing.custom.push({id:'custom-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,6),label});$('packing-item').value='';save();};
}
function openTripDates(){if(busy)return;$('trip-start').value=state.dates.start;$('trip-end').value=state.dates.end;$('trip-start').min=Companion.today();$('trip-end').min=state.dates.start||Companion.today();$('trip-dates-error').textContent='';$('trip-dates-dialog').showModal();}
function applyTripDates(start,end){
 const range=Companion.dateRange(start,end);if(!range.valid||range.days>3)return false;
 cancelForecast();state.dates={start,end};state.packing.start=start;state.packing.end=end;state.packing.weather=null;
 state.days=range.days;state.day=Math.min(state.day,state.days-1);if(state.plan.length)rebuild(state.plan);
 save();renderRoute();return true;
}
function changeTripLength(days){
 if(state.dates?.start&&state.days!==days){cancelForecast();state.dates.end=new Date((Companion.day(state.dates.start)+days-1)*86400000).toISOString().slice(0,10);state.packing.start=state.dates.start;state.packing.end=state.dates.end;state.packing.weather=null;}
 state.days=days;
}

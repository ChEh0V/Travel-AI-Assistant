/* Демонстрационные данные, не результат поиска RAG. */
const DESTINATIONS = {
 rome:{name:'Рим',country:'Италия',keys:['рим','rome'],url:'https://www.turismoroma.it/en',places:[['Колизей','Античная архитектура и история города. Осмотр интерьера планируйте отдельно.','architecture',false],['Римский форум','Продолжите знакомство с античным городом среди руин и старых улиц.','architecture',false],['Фонтан Треви','Остановитесь на площади и рассмотрите скульптуры фонтана.','walks',true],['Музеи Ватикана','Живопись и скульптура: выделите время на спокойное знакомство с коллекцией.','art',false],['Трастевере','Прогулка по небольшим улицам и знакомство с атмосферой района.','food',true],['Вилла Боргезе','Зелёная пауза среди прогулочных дорожек и деревьев.','walks',true],['Площадь Навона','Архитектура площади и прогулка по историческому центру.','architecture',true],['Капитолийские музеи','Коллекции искусства и история Рима.','art',false],['Кампо-деи-Фьори','Знакомство с местными продуктами; покупки оплачиваются отдельно.','food',true]]},
 paris:{name:'Париж',country:'Франция',keys:['париж','paris'],url:'https://parisjetaime.com/eng/',places:[['Лувр','Выберите несколько залов вместо попытки увидеть всю коллекцию.','art',false],['Сад Тюильри','Прогулка между аллеями и фонтанами.','walks',true],['Набережные Сены','Посмотрите на город с берега и найдите место для паузы.','walks',true],['Монмартр','Улицы на холме, небольшие площади и виды на крыши.','architecture',true],['Музей Орсе','Искусство в здании бывшего вокзала.','art',false],['Люксембургский сад','Спокойная прогулка и отдых среди деревьев.','walks',true],['Латинский квартал','Старые улицы, книжные витрины и архитектура.','architecture',true],['Улица Монторгёй','Гастрономическая прогулка; еда оплачивается отдельно.','food',true],['Центр Помпиду снаружи','Рассмотрите необычный фасад с городской площади.','architecture',true]]},
 barcelona:{name:'Барселона',country:'Испания',keys:['барселон','barcelona'],url:'https://www.barcelonaturisme.com/wv3/en/',places:[['Саграда-Фамилия','Архитектура Гауди и детали фасадов; интерьер требует билета.','architecture',false],['Готический квартал','Узкие улицы и небольшие площади старого города.','architecture',true],['Набережная Барселонеты','Прогулка к морю и время для отдыха.','walks',true],['Музей Пикассо','Знакомство с ранними работами художника.','art',false],['Рынок Санта-Катерина','Местные продукты и гастрономические открытия; покупки отдельно.','food',true],['Монжуик','Прогулочные дорожки и виды на город; отдельные объекты платные.','walks',true],['Пасео-де-Грасиа','Архитектура модернизма: прогулка с осмотром фасадов.','architecture',true],['Парк Гуэль','Мозаики и архитектура парка.','architecture',false],['Парк Сьютаделья','Зелёная пауза в городе.','walks',true]]},
 prague:{name:'Прага',country:'Чехия',keys:['праг','prague'],url:'https://prague.eu/en/',places:[['Карлов мост','Прогулка над Влтавой и знакомство со скульптурами.','architecture',true],['Староместская площадь','Исторические фасады и атмосфера центра.','architecture',true],['Кампа','Спокойные улицы и прогулка у воды.','walks',true],['Пражский Град','Архитектурный ансамбль; условия входа зависят от объекта.','architecture',false],['Национальная галерея','Выберите коллекцию по своим интересам.','art',false],['Летенские сады','Аллеи и виды на мосты.','walks',true],['Мала-Страна','Исторические улицы у подножия холма.','architecture',true],['Винограды','Квартал для знакомства с местной кухней; еда отдельно.','food',true],['Вышеград','Прогулка по территории с видами на реку.','walks',true]]},
 vienna:{name:'Вена',country:'Австрия',keys:['вен','vienna'],url:'https://www.wien.info/en',places:[['Собор Святого Стефана снаружи','Рассмотрите готический фасад и площадь вокруг.','architecture',true],['Музей истории искусств','Живопись и музейные коллекции.','art',false],['Штадтпарк','Прогулка среди зелени и городских памятников.','walks',true],['Бельведер','Дворцовый ансамбль и искусство; посещение музея по билету.','art',false],['Нашмаркт','Гастрономическая прогулка; дегустации и покупки отдельно.','food',true],['Рингштрассе','Знакомство с архитектурой бульварного кольца.','architecture',true],['Фольксгартен','Сад для неспешной паузы в центре.','walks',true],['Музейный квартал','Искусство и общественные пространства.','art',false],['Дунайский канал','Прогулка у воды и городское искусство.','walks',true]]},
 lisbon:{name:'Лиссабон',country:'Португалия',keys:['лиссабон','lisbon'],url:'https://www.visitlisboa.com/en',places:[['Алфама','Старые улицы и лестницы: учитывайте перепады высот.','architecture',true],['Площадь Коммерции','Архитектура площади и выход к реке.','architecture',true],['Набережная Тежу','Прогулка у воды с паузой на отдых.','walks',true],['Музей азулежу','История декоративной керамики и её художественных традиций.','art',false],['Шиаду','Книжные магазины и знакомство с местными кафе; покупки отдельно.','food',true],['Сад Эштрела','Зелёные аллеи для спокойного дня.','walks',true],['Белен','Исторический район: прогулка с осмотром архитектуры снаружи.','architecture',true],['Музей Галуста Гюльбенкяна','Коллекции искусства разных эпох.','art',false],['Граса','Виды на город; маршрут по холмам.','walks',true]]}
};
const TYPE_LABELS={architecture:'Архитектура',art:'Искусство',walks:'Прогулка',food:'Местная кухня'};
function createPlan(city,days,pace,interests=[],previous=[]){
 const pool=DESTINATIONS[city].places.map((p,i)=>({id:city+'-'+i,name:p[0],description:p[1],type:p[2],free:p[3],duration:p[2]==='art'?'~ 2 часа':'~ 1 час',pinned:false}));
 const score=place=>Number(interests.includes(place.type))+2*Number(interests.includes('free')&&place.free);
 const ranked=pool.slice().sort((a,b)=>score(b)-score(a));
 const used=new Set(previous.slice(0,days).flatMap(day=>day.filter(p=>p.pinned).map(p=>p.id)));const count=pace==='slow'?2:3;
 return Array.from({length:days},(_,day)=>{
  const pinned=(previous[day]||[]).filter(p=>p.pinned);pinned.forEach(p=>used.add(p.id));
  const picks=ranked.filter(p=>!used.has(p.id)).slice(0,Math.max(0,count-pinned.length));picks.forEach(p=>used.add(p.id));return [...pinned,...picks];
 });
}
function requiresVerifiedTickets(state){
 return state.city==='barcelona'||(['paris','prague'].includes(state.city)&&!!state.dates?.start);
}

function replacementOptions(state){
 const used=new Set(state.plan.flat().map(place=>place.id));
 const favorites=(state.wishlist??[]).filter(place=>place.city===state.city);
 const places=[...createPlan(state.city,3,'active',[]).flat(),...favorites];
 return [...new Map(places.map(place=>[place.id,place])).values()].filter(place=>
  !used.has(place.id)&&(!requiresVerifiedTickets(state)||place.free));
}

function datedPlanBase(state){
 const reserved=new Set(state.plan.flat().filter(place=>place.free).map(place=>place.id));
 const free=createPlan(state.city,3,'active',[]).flat().filter(place=>place.free&&!reserved.has(place.id));
 return state.plan.map(day=>day.flatMap(place=>{
  const next=place.free?place:free.shift();
  return next?[next]:[];
 }));
}

function replacePlace(state,day,index,replacementId){
 const old=state.plan[day]?.[index];
 if(!old||old.pinned)return false;
 const next=replacementOptions(state).find(place=>!replacementId||place.id===replacementId);
 if(!next)return false;
 state.plan[day][index]={...next,pinned:false};
 return true;
}

function swapPlaces(places, first, second){
 if(first===second || !places[first] || !places[second])return false;
 [places[first],places[second]]=[places[second],places[first]];
 return true;
}

function placeWords(text){
 return text.toLowerCase().replace(/ё/g,'е').match(/[\p{L}\p{N}]+/gu)??[];
}

function mentionedPlaces(places,text){
 const words=placeWords(text);
 const exact=places.filter(place=>{
  const name=placeWords(place.name).join(' ');
  return (' '+words.join(' ')+' ').includes(' '+name+' ');
 });
 if(exact.length)return exact;
 return places.filter(place=>placeWords(place.name).some(name=>{
  if(name.length<4||['музей','площадь','улица','город'].includes(name))return false;
  return words.some(word=>word===name || (word.length>=4&&Math.abs(word.length-name.length)<=2&&
    (word.startsWith(name.slice(0,-1))||name.startsWith(word.slice(0,-1)))));
 }));
}

function replacementRequest(question,context){
 const numbered=question.match(/^\s*замени\s+место\s*(?:№\s*)?(\d+)(?:\s+(?:в\s+дне|на\s+день|день)\s*(\d+))?\s*[.!?]?\s*$/i);
 if(numbered)return {day:numbered[2]?Number(numbered[2])-1:(context.day??0),index:Number(numbered[1])-1};
 const plan=context.plan??[];
 if(/замени\s+музеи|без музеев/.test(question))return null;
 const insteadFirst=question.match(/^(?:давай\s+)?вместо\s+(.+?)\s+(?:давай|лучше|хочу)\s+(.+)/i);
 const instead=question.match(/^(?:давай\s+)?(?:лучше\s+)?(.+?)\s+вместо\s+(.+)/i);
 const replace=question.match(/(?:заменить|заменишь|заменим|замени|поменять|поменяй|поменяем)\s+(.+)/i);
 if(!insteadFirst&&!instead&&!replace)return null;
 if(!plan.length)return {reply:'Сначала соберите маршрут, чтобы в нём можно было заменить остановку.'};
 const [oldText,newText]=insteadFirst?insteadFirst.slice(1):instead?[instead[2],instead[1]]:replace[1].split(/\s+на\s+/,2);
 const stops=plan.flatMap((places,day)=>places.map((place,index)=>({name:place.name,day,index})));
 const matches=mentionedPlaces(stops,oldText);
 if(matches.length!==1)return {reply:'Какую остановку заменить? Назовите место из маршрута.'};
 if(!newText)return matches[0];
 const options=replacementOptions(context);
 const replacements=mentionedPlaces(options,newText);
 if(replacements.length!==1)return {reply:'Не нашёл однозначной замены среди свободных мест этого города. Выберите вариант в маршруте через поиск или «Хочу сюда».'};
 return {...matches[0],replacementId:replacements[0].id};
}

async function requestChat(messages,context,advice){
 const history=messages.slice(-8).map(m=>({role:m.role,content:m.content.slice(0,3000)}));
 const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({messages:history,city:context.city,advice}),signal:AbortSignal.timeout(105000)});
 if(!response.ok)throw new Error('Ассистент недоступен');
 return response.json();
}

async function tripAdvice(messages,context){
 const destination=DESTINATIONS[context.city];
 const plan=(context.plan??[]).map((day,index)=>{
   const schedule=TravelTools.daySchedule(day,context.startTimes?.[index]);
   return 'День '+(index+1)+': '+schedule.map(({place,start})=>start+' '+place.name).join(', ');
 }).join('\n');
 const preferences=Object.values(context.preferences??{}).join(', ');
 const dates=context.dates?.start?'Даты поездки: '+context.dates.start+' — '+context.dates.end:'';
 const weather=Companion.tripWeather(context);
 const forecast=weather?.days.map(day=>day.date+': '+day.min+'…'+day.max+' °C, вероятность осадков '+day.rain+'%').join('; ');
 const advice=['Город: '+(destination?.name??'не выбран'),plan,
   dates,forecast?'Прогноз Open-Meteo: '+forecast:'',
   preferences?'Предпочтения поездки: '+preferences:'',
   'Места из каталога: '+(destination?.places.map(p=>p[0]).join(', ')??'')].filter(Boolean).join('\n');
 const data=await requestChat(messages,context,advice);
 return {reply:data.reply,reference:true,city:null,action:null};
}

function barcelonaTicketQuestion(text){
 const query=text.toLowerCase().trim();
 if(!/билет|сеанс|слот/.test(query)||!/^(билет|сеанс|слот)|есть ли|есть билет|наличие|доступн|сколько|цен[ауеы]|купить|проверь|проверить|расписание|во сколько/.test(query))return [];
 const options=createPlan('barcelona',3,'active',[]).flat().filter(place=>!place.free);
 return mentionedPlaces(options,text);
}

async function getReply(messages,context){
 const q=messages[messages.length-1].content.toLowerCase();
 const ticketPlaces=barcelonaTicketQuestion(q);
 if(ticketPlaces.length){
  return {reference:true,city:'barcelona',ticketLookup:true,reply:
   ticketPlaces.map(place=>'• '+place.name+' — Свободные часы на нужную дату можно посмотреть в кассе.').join('\n')};
 }
 const replacement=replacementRequest(q,context);
 if(replacement?.reply)return {reference:true,reply:replacement.reply};
 if(replacement)return {action:'replace',replacement};
 if(/^\s*замени\s+место[.!?\s]*$/.test(q)){
   return {reference:true,reply:'Какое место заменить? Назовите его, и я подберу другое.'};
 }
 if(context.plan?.length&&/погод[ауые]|вероятность осадков|температура/.test(q)){
   const start=context.dates?.start;
   const end=context.dates?.end;
   const period=Companion.forecastWindow(start,end);
   const weather=Companion.tripWeather(context);
   const reply=!start?'Укажите даты поездки, чтобы получить прогноз.':
     period==='past'?'Эти даты уже прошли. Для них прогноз не запрашивается.':
     period==='future'?'Для этих дат прогноз пока недоступен. Open-Meteo показывает до 16 дней вперёд.':
     weather?'Прогноз для '+DESTINATIONS[context.city].name+' по Open-Meteo:\n'+weather.days.map(
       day=>day.date+': '+Math.round(day.min)+'…'+Math.round(day.max)+' °C · вероятность осадков '+Math.round(day.rain)+'%'
     ).join('\n'):'Откройте маршрут и нажмите «Обновить прогноз», чтобы загрузить погоду на даты поездки.';
   return {reference:true,reply};
 }
 const city=Object.keys(DESTINATIONS).find(k=>DESTINATIONS[k].keys.some(key=>q.includes(key)));
 const outsideRoute=!city && /маршрут.*(?: по | в )/i.test(q);
 const routeCommand=/маршрут|составь план|почему.*план|инстаграм|instagram|больше бесплатного|сделай спокойнее|замени музеи|замен.*на прогул|без музеев/.test(q);
 const newDestination=!city && /(?:еду|хочу|поеду) в |поездка в /.test(q);
 const factual=/куда сходить|что посетить|что интересного|расскажи|путеводител|кухн|что попробовать|что посмотреть|достопримечательност|куда съездить|адрес|наход|как найти|координат|тематик|располож|сайт|музе|орсе|лувр|событи|афиш|выставк|мастер.класс|концерт|мероприяти|коллекци|источник|откуда|билет|скидк|цен[ауые]|расписан|открыт|там/.test(q);
 const clarifying=/^(Уточните название|Какой из упомянутых)/.test(messages.at(-2)?.content || "");
 if(outsideRoute || newDestination || (!routeCommand && (factual || clarifying))){
   const data=await requestChat(messages,context);
   const reply=outsideRoute && data.status==="answered" ? "По путеводителю для этого направления можно рассмотреть следующие места.\n"+data.reply : data.reply;
   return {reply,sources:data.sources,reference:true,city:null,action:null};
 }
 const result={reply:'',action:null,city:null};
 if(/инстаграм|instagram/.test(q)){if(city||context.plan?.length){result.city=city||context.city;result.action='instagram';}else result.reply='Для какого города ищем инстаграмные места? Напишите направление — подберём уголки для вашей ленты.';}
 else if(city&&city!==context.city){result.city=city;result.action='city';result.reply='Переключаю поездку: '+DESTINATIONS[city].name+'. Подготовил маршрут с вашими пожеланиями.';}
 else if(/бесплат|эконом/.test(q)){result.action='free';result.reply='Добавил предпочтение бесплатных прогулок. Доступные места поставил в начало плана; закреплённые сохранил. ';}
 else if(/спокой|меньше ход|без спеш|поспокой/.test(q)){result.action='slow';result.reply='Сделал программу спокойнее: до двух мест в день. Закреплённые места остаются. ';}
 else if(/без музе|вместо музе|замени музеи|замен.*на прогул/.test(q)){result.action='walks';result.reply='Сместил акцент на прогулки и архитектуру. Закреплённые места оставил.';}
 else if(/почему/.test(q)){result.reply='План использует выбранный город, число дней, темп и интересы. Сначала идут места, подходящие вашим предпочтениям. ';}
 else if(/маршрут|составь план|собер/.test(q)||/(?:на|за)\s*(?:[1-3]|один|одну|два|двое|три)\s*(?:дн|ден|сут)/.test(q)){result.action='rebuild';result.reply='Подготовил маршрут. Можно обсудить изменения здесь.';}
 else return tripAdvice(messages,context);
 return new Promise(resolve=>setTimeout(()=>resolve(result),500));
}
if(typeof module!=='undefined')module.exports={DESTINATIONS,createPlan,replacementOptions,replacePlace,swapPlaces,getReply,requiresVerifiedTickets,datedPlanBase};

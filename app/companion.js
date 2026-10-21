const Companion = (() => {
 const coordinates={rome:[41.9028,12.4964],paris:[48.8566,2.3522],barcelona:[41.3874,2.1686],prague:[50.0755,14.4378],vienna:[48.2082,16.3738],lisbon:[38.7223,-9.1393]};
 const profiles={
  barcelona:{tags:['sea','walks','art'],reason:'Море в городе, архитектура и прогулки по кварталам.'},
  lisbon:{tags:['coast','walks','food'],reason:'Городские прогулки и побережье рядом. На пляж нужно ехать отдельно.'},
  prague:{tags:['walks','architecture','calm'],reason:'Старый город, парки и прогулки вдоль реки.'},
  vienna:{tags:['art','calm','architecture'],reason:'Музеи, дворцы и спокойные прогулки по садам.'},
  rome:{tags:['architecture','food','walks'],reason:'Античная архитектура, старые кварталы и местная кухня.'},
  paris:{tags:['art','walks','architecture'],reason:'Музеи, набережные и прогулки по разным кварталам.'}
 };
 const dayMs=86400000;
 function day(iso){if(!/^\d{4}-\d{2}-\d{2}$/.test(iso||''))return NaN;const value=Date.parse(iso+'T00:00:00Z');return Number.isFinite(value)&&new Date(value).toISOString().slice(0,10)===iso?value/dayMs:NaN;}
 function dateRange(start,end){const a=day(start),b=day(end);if(!Number.isFinite(a)||!Number.isFinite(b)||b<a)return {valid:false,days:0};return {valid:b-a<30,days:b-a+1};}
 function extractDates(text,duration=2,now=today()){
  let dates=text.match(/\b\d{4}-\d{2}-\d{2}\b/g)||[];
  if(!dates.length){const found=[...text.matchAll(/\b(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?\b/g)];dates=found.map(m=>(m[3]||now.slice(0,4))+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0'));}
  if(!dates.length||!Number.isFinite(day(dates[0])))return null;
  const start=dates[0],end=dates[1]||new Date((day(start)+Math.max(1,Math.min(3,duration))-1)*dayMs).toISOString().slice(0,10);
  const range=dateRange(start,end);return range.valid&&range.days<=3?{start,end}:null;
 }
 function today(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');}
 function forecastWindow(start,end,now=today()){const range=dateRange(start,end);if(!range.valid)return 'invalid';if(day(start)<day(now))return 'past';if(day(end)>day(now)+15)return 'future';return 'available';}
 function normalizePacking(value){const v=value&&typeof value==='object'?value:{};return {start:typeof v.start==='string'?v.start:'',end:typeof v.end==='string'?v.end:'',checked:v.checked&&typeof v.checked==='object'?v.checked:{},custom:Array.isArray(v.custom)?v.custom.filter(t=>t&&typeof t.id==='string'&&typeof t.label==='string').slice(0,100):[],weather:v.weather&&Array.isArray(v.weather.days)?v.weather:null};}
 function packingItems(packing,company){
  const result=[{id:'docs',label:'Документы и сохранённые бронирования',group:'Главное'},{id:'charger',label:'Телефон и зарядка',group:'Главное'},{id:'shoes',label:'Удобная обувь',group:'Вещи'},{id:'care',label:'Средства гигиены',group:'Вещи'},{id:'offline',label:'Скачать карты и адрес проживания',group:'Перед выездом'}];
  if(company==='С семьёй')result.push({id:'family',label:'Проверить документы и вещи всех участников',group:'Перед выездом'});
  const days=packing.weather?.days||[];
  if(days.some(d=>d.rain>=40))result.push({id:'rain',label:'Зонт или лёгкий дождевик',group:'По погоде'});
  if(days.some(d=>d.min<12))result.push({id:'warm',label:'Тёплый слой для прохладных часов',group:'По погоде'});
  if(days.some(d=>d.max>=25))result.push({id:'heat',label:'Головной убор и бутылка для воды',group:'По погоде'});
  if(days.some(d=>d.wind>=30))result.push({id:'wind',label:'Ветровка',group:'По погоде'});
  if(days.some(d=>d.uv>=6))result.push({id:'sun',label:'Солнцезащитный крем',group:'По погоде'});
  return [...result,...packing.custom.map(t=>({...t,group:'Мои пункты'}))];
 }
 function clothing(weather){
  const days=weather?.days||[];
  if(!days.length)return [{title:'База на каждый день',text:'Удобная разношенная обувь, носки и одежда, которую можно сочетать слоями. Погодные советы появятся после обновления прогноза.'}];
  const min=Math.min(...days.map(d=>d.min)),max=Math.max(...days.map(d=>d.max));
  const result=[{title:'Днём · до '+Math.round(max)+' °C',text:max>=25?'Лёгкая дышащая одежда, головной убор и удобная обувь. Возьмите воду.':max>=16?'Лонгслив или футболка с дополнительным слоем: лёгкая кофта или куртка, которую можно снять.':'Закрытая обувь, длинные брюки и тёплый верхний слой. Подберите куртку по своим ощущениям.'},{title:'Утром и вечером · от '+Math.round(min)+' °C',text:min<5?'Тёплая куртка, свитер и закрытая обувь; пригодятся шарф и перчатки.':min<12?'Свитер или флис под куртку. Не рассчитывайте только на дневную температуру.':'Лёгкая кофта на вечер и слой, который удобно убрать в рюкзак.'}];
  if(days.some(d=>d.rain>=40))result.push({title:'Если пойдёт дождь',text:'Дождевик или зонт, обувь с защищённым верхом и запасные носки. Учитывайте мокрые и скользкие поверхности.'});
  if(days.some(d=>d.wind>=30))result.push({title:'Ветрено',text:'Верхний слой с защитой от ветра. На открытых площадях и у воды может ощущаться прохладнее.'});
  result.push({title:'Для прогулок и музеев',text:'Удобная обувь важнее новой пары для фото. Для отдельных храмов и объектов проверьте правила одежды на официальном сайте.'});
  return result;
 }
 function wishlistPlan(places,city,days){
  if(!Number.isInteger(days)||days<1||days>3)throw new Error('Выберите 1–3 дня');
  const unique=[...new Map(places.filter(p=>p.city===city).map(p=>[p.id,p])).values()];
  if(!unique.length)throw new Error('Выберите хотя бы одно место вашего города');
  const plan=Array.from({length:days},()=>[]);unique.forEach((p,i)=>{const target=Math.min(days-1,Math.floor(i*days/unique.length));plan[target].push({...p,pinned:true});});
  return plan;
 }
 function readForecast(data,start,end){
  const d=data?.daily;if(!d||!Array.isArray(d.time))throw new Error('Некорректный прогноз');
  const days=d.time.map((date,i)=>({date,min:d.temperature_2m_min?.[i],max:d.temperature_2m_max?.[i],rain:d.precipitation_probability_max?.[i],wind:d.wind_speed_10m_max?.[i],uv:d.uv_index_max?.[i]}));
  if(days.length!==dateRange(start,end).days||days[0]?.date!==start||days.at(-1)?.date!==end||days.some((x,i)=>day(x.date)!==day(start)+i||!['min','max','rain','wind','uv'].every(k=>Number.isFinite(x[k]))))throw new Error('Неполный прогноз');
  return days;
 }
 function search(text){
  const q=text.toLowerCase();const sea=/мор[еяю]|пляж|побереж/.test(q),calm=/спокой|неспеш|без спеш|тихо/.test(q),art=/музе|искусств/.test(q),food=/еда|кухн|гастро/.test(q);
  const budget=q.match(/(?:до|бюджет\s*)\s*(\d+(?:[.,]\d+)?)\s*(?:евро|€|eur)/i);const duration=q.match(/(?:за|на)\s*(\d+|два|три|один)\s*(?:дн|ден)/);
  const parsedDays=duration?({два:2,три:3,один:1}[duration[1]]||Number(duration[1])):2;
  const days=Math.max(1,Math.min(3,parsedDays));
  const matches=Object.entries(profiles).filter(([,p])=>!sea||p.tags.includes('sea')||p.tags.includes('coast')).map(([city,p])=>({city,reason:p.reason,score:(sea?(p.tags.includes('sea')?5:3):0)+(calm&&p.tags.includes('calm')?3:0)+(art&&p.tags.includes('art')?3:0)+(food&&p.tags.includes('food')?3:0)})).sort((a,b)=>b.score-a.score).slice(0,3);
  return {matches,days,requestedDays:parsedDays,budget:budget?Number(budget[1].replace(',','.')):null,calm};
 }
 return {coordinates,day,dateRange,extractDates,today,forecastWindow,normalizePacking,packingItems,clothing,wishlistPlan,readForecast,search};
})();
if(typeof module!=='undefined')module.exports=Companion;

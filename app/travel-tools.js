const TravelTools = (() => {
 const companies=['Не важно','Один / одна','Вдвоём','С друзьями','С семьёй'];
 const tickets={
  'rome-0':'https://ticketing.colosseo.it/en/',
  'rome-1':'https://colosseo.it/en/opening-times-and-tickets/',
  'rome-3':'https://tickets.museivaticani.va/',
  'rome-7':'https://www.museicapitolini.org/it/infopage/biglietti',
  'paris-0':'https://www.louvre.fr/en/visit/tickets-and-prices',
  'paris-4':'https://billetterie.musee-orsay.fr/',
  'barcelona-0':'https://sagradafamilia.org/en/tickets',
  'barcelona-3':'https://museupicassobcn.cat/en/plan-your-visit/buy-tickets-and-opening-hours',
  'barcelona-7':'https://parkguell.barcelona/en/buy-tickets',
  'prague-3':'https://www.hrad.cz/en/prague-castle-for-visitors/tickets',
  'prague-4':'https://www.ngprague.cz/en/about/admission/',
  'vienna-1':'https://shop.khm.at/en/tickets/kunsthistorisches-museum-200000000001005-T001-02',
  'vienna-3':'https://www.belvedere.at/en/visit',
  'vienna-7':'https://www.mqw.at/en/visit/opening-hours/',
  'lisbon-7':'https://gulbenkian.pt/en/useful-information/tickets/'
 };
 const tours={
  'paris-2':{label:'Круиз по Сене',url:'https://vedettesdupontneuf.com/cruises/'},
  'prague-1':{label:'Экскурсия по Старому городу',url:'https://prague.eu/en/produkt/old-town-jewish-quarter-5/'}
 };
 const cities={rome:'Rome Italy',paris:'Paris France',barcelona:'Barcelona Spain',prague:'Prague Czechia',vienna:'Vienna Austria',lisbon:'Lisbon Portugal'};
 function interests(preferences={},base=[]) {
  return [...new Set([...base,...(preferences.activities==='Бесплатное'?['free']:[])])];
 }
 function maps(place,city){return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(place.name+' '+(cities[city]||city));}
 function dayMap(places,city){
  if(!places.length)return null;
  if(places.length===1)return maps(places[0],city);
  const query=p=>p.name+' '+(cities[city]||city);
  return 'https://www.google.com/maps/dir/?api=1&travelmode=walking&origin='+encodeURIComponent(query(places[0]))+'&destination='+encodeURIComponent(query(places.at(-1)))+(places.length>2?'&waypoints='+encodeURIComponent(places.slice(1,-1).map(query).join('|')):'');
 }
 function clockLabel(minutes){
  const hour=Math.floor(minutes/60);
  const remainder=String(minutes%60).padStart(2,'0');
  return String(hour%24).padStart(2,'0')+':'+remainder+(hour>=24?' (след. день)':'');
 }
 function daySchedule(places,start='10:00'){
  const [hours,minutes]=/^([01]\d|2[0-3]):[0-5]\d$/.test(start)?start.split(':').map(Number):[10,0];
  let cursor=hours*60+minutes;
  let lunch=false;
  return places.map((place,index)=>{
   const duration=place.type==='art'?120:60;
   let gap=index?30:0;
   if(index&&!lunch&&cursor<15*60&&cursor+gap>=12*60+30&&cursor+gap+duration>13*60){
    gap+=45;
    lunch=true;
   }
   const from=cursor+gap;
   const to=from+duration;
   cursor=to;
   return {place,start:clockLabel(from),end:clockLabel(to),gap,endsNextDay:to>=24*60};
  });
 }
 function infer(text,previous={}){
  const result={...previous};
  delete result.vibe;
  if(/с друзьями|компани[еяю] друзей/i.test(text))result.company='С друзьями';
  else if(/с семь[её]й|с детьми|семейн/i.test(text))result.company='С семьёй';
  else if(/вдво[её]м|с парнем|с девушкой|с женой|с мужем/i.test(text))result.company='Вдвоём';
  else if(/еду (?:один|одна)|соло/i.test(text))result.company='Один / одна';
  return result;
 }
 function upsertThreads(threads,state,limit=12){
  const snapshot=JSON.parse(JSON.stringify(state));const next=threads.slice();const index=next.findIndex(t=>t.id===state.id);
  if(index>=0)next[index]=snapshot;else next.unshift(snapshot);
  return next.slice(0,limit);
 }
 function removeTrip(threads,id){return threads.filter(t=>t.id!==id);}
 function withoutRoute(trip){return {...JSON.parse(JSON.stringify(trip)),plan:[],day:0};}
 return {companies,interests,infer,maps,dayMap,daySchedule,upsertThreads,removeTrip,withoutRoute,
  ticket:place=>Object.hasOwn(tickets,place.id)?tickets[place.id]:null,
  tour:place=>Object.hasOwn(tours,place.id)?tours[place.id]:null};
})();
if(typeof module!=='undefined')module.exports=TravelTools;

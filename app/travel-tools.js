const TravelTools = (() => {
 const companies=['Не важно','Один / одна','Вдвоём','С друзьями','С семьёй'];
 const tickets={
  'paris-0':'https://www.louvre.fr/en/visit/hours-admission',
  'barcelona-0':'https://sagradafamilia.org/en/tickets',
  'barcelona-7':'https://parkguell.barcelona/en/buy-tickets'
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
 return {companies,interests,infer,maps,dayMap,upsertThreads,removeTrip,withoutRoute,ticket:place=>Object.hasOwn(tickets,place.id)?tickets[place.id]:null};
})();
if(typeof module!=='undefined')module.exports=TravelTools;

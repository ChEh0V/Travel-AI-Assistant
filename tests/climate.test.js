const test=require('node:test'), assert=require('node:assert/strict'), c=require('../app/companion');
test('сравнение городов учитывает пожелание и использует полный месяц',async()=>{
 const cities=['rome','prague','paris'].map(city=>({city,reason:'',score:0}));
 const archive=async()=>({ok:true,json:async()=>[31,17,23].map(t=>({daily:{temperature_2m_max:Array(31).fill(t)}}))});
 for(const [word,first] of [['жарко','rome'],['тепло','paris'],['прохладно','prague']]){
  const matches=await c.climateMatches(cities,c.travelMonth('в июле'),c.climatePreference('хочу туда где '+word),archive);
  assert.equal(matches[0].city,first);
 }
 await assert.rejects(()=>c.climateMatches(cities,7,'cool',async()=>({ok:false})));
});

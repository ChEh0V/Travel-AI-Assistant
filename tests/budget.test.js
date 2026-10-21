const test=require('node:test');
const assert=require('node:assert/strict');
const Budget=require('../app/budget.js');
test('бюджет: периодичность суммы и количество путешественников',()=>{
 const result=Budget.calculate({travelers:2,limit:1000,items:[{id:'a',label:'Отель',category:'stay',basis:'day',amount:80},{id:'b',label:'Еда',category:'food',basis:'personDay',amount:20},{id:'c',label:'Билеты',category:'activities',basis:'person',amount:15},{id:'d',label:'Такси',category:'transport',basis:'total',amount:10}]},3);
 assert.equal(result.total,40000);assert.equal(result.perPerson,20000);assert.equal(result.remaining,60000);assert.equal(result.byCategory.stay,24000);
});
test('бюджет: копейки, оплаченные суммы и превышение лимита',()=>{
 const result=Budget.calculate({travelers:1,limit:0.2,items:[{id:'a',label:'A',category:'other',basis:'total',amount:0.1,paid:true},{id:'b',label:'B',category:'other',basis:'total',amount:0.2}]},1);
 assert.equal(result.total,30);assert.equal(result.paid,10);assert.equal(result.remaining,-10);assert.equal(result.progress,100);
});
test('бюджет: старые сохранения, неизвестные категории и некорректные суммы',()=>{
 assert.deepEqual(Budget.normalize(),{limit:0,travelers:1,allocations:{stay:0,food:0,transport:0,activities:0,other:0},items:[]});
 const value=Budget.normalize({limit:-5,travelers:0,items:[{id:'x',label:'Неверно',category:'__proto__',basis:'day',amount:1},{id:'y',label:'Минус',category:'food',basis:'total',amount:-1}]});
 assert.equal(value.items.length,0);assert.equal(value.limit,0);assert.equal(value.travelers,1);
});
test('бюджет: данные не изменяются при пересчёте и не смешиваются',()=>{
 const a={limit:500,travelers:2,items:[{id:'x',label:'Еда',category:'food',basis:'personDay',amount:10}]};const snapshot=JSON.stringify(a);
 assert.equal(Budget.calculate(a,2).total,4000);assert.equal(Budget.calculate({limit:100,travelers:1,items:[]},2).total,0);assert.equal(JSON.stringify(a),snapshot);
});


test('пожелания по категориям задают общий лимит без дублирования расходов',()=>{
 const original={limit:0,travelers:2,items:[{id:'hotel',label:'Бронь',category:'stay',basis:'total',amount:100}]};
 const stay=Budget.allocate(original,'stay',50,3);const food=Budget.allocate(stay,'food',20,3);
 assert.equal(food.limit,420);assert.equal(food.allocations.stay,50);assert.equal(food.allocations.food,20);
 assert.equal(Budget.calculate(food,3).total,10000);assert.equal(original.limit,0);
 assert.equal(Budget.allocate(food,'food',-5,3).allocations.food,20);
});

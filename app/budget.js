/* Manual trip estimates. Money is calculated in cents, no external prices. */
const Budget = (() => {
  const categories = {stay:'Жильё', food:'Еда', transport:'Транспорт', activities:'Впечатления', other:'Другое'};
  const bases = {total:'На всю поездку', person:'На человека', day:'В день', personDay:'На человека в день'};
  const cents = value => Math.round(Number(value) * 100);
  const validAmount = value => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 10000000;
  function normalize(value) {
    const budget = value && typeof value === 'object' ? value : {};
    return {
      limit: validAmount(budget.limit) ? cents(budget.limit)/100 : 0,
      travelers: Number.isInteger(Number(budget.travelers)) && Number(budget.travelers)>=1 && Number(budget.travelers)<=50 ? Number(budget.travelers) : 1,
      allocations: Object.fromEntries(Object.keys(categories).map(key=>[key,validAmount(budget.allocations?.[key])?Math.min(1000,cents(budget.allocations[key])/100):0])),
      items: Array.isArray(budget.items) ? budget.items.filter(item => item && typeof item.id==='string' && typeof item.label==='string' && item.label.trim() && Object.hasOwn(categories,item.category) && Object.hasOwn(bases,item.basis) && validAmount(item.amount)).map(item => ({id:item.id,label:item.label.slice(0,100),category:item.category,basis:item.basis,amount:cents(item.amount)/100,paid:!!item.paid})) : []
    };
  }
  function calculate(value, days) {
    const budget=normalize(value);
    const duration=Number.isInteger(Number(days))&&Number(days)>=1&&Number(days)<=365 ? Number(days) : 1;
    const byCategory=Object.fromEntries(Object.keys(categories).map(key=>[key,0]));
    let total=0,paid=0;
    const rows=budget.items.map(item=>{
      const multiplier=(item.basis==='person'||item.basis==='personDay'?budget.travelers:1)*(item.basis==='day'||item.basis==='personDay'?duration:1);
      const amount=cents(item.amount)*multiplier;
      total+=amount;byCategory[item.category]+=amount;if(item.paid)paid+=amount;
      return {...item,total:amount};
    });
    const limit=cents(budget.limit);
    return {total,paid,remaining:limit-total,limit,byCategory,rows,perPerson:Math.round(total/budget.travelers),perDay:Math.round(total/duration),progress:limit>0?Math.min(100,total/limit*100):0};
  }
  function allocate(value,category,amount,days) {
    const budget=normalize(value);
    if(!Object.hasOwn(categories,category)||!validAmount(amount))return budget;
    budget.allocations[category]=Math.min(1000,cents(amount)/100);
    const duration=Number.isInteger(Number(days))&&Number(days)>0&&Number(days)<=365?Number(days):1;
    budget.limit=Object.values(budget.allocations).reduce((sum,n)=>sum+cents(n),0)*budget.travelers*duration/100;
    return budget;
  }
  return {categories,bases,normalize,calculate,validAmount,allocate};
})();
if(typeof module!=='undefined') module.exports=Budget;

/* Purpose-bound referral rewards. The server owns eligibility and balances. */
(function(root){'use strict';
const policy=Object.freeze({version:'defense-circle-v1',minOrder:5000,credit:1000,standardPrice:6000,holdDays:14,validDays:365,maxRedemption:6000,eligibleTypes:['svc_defense']});
function money(n){return new Intl.NumberFormat('ru-RU').format(Math.max(0,Math.floor(Number(n)||0)))+' ₽'}
function preview(count,price=policy.standardPrice,used=0){count=Math.max(0,Math.min(60,Math.floor(Number(count)||0)));price=Math.max(policy.standardPrice,Math.floor(Number(price)||0));const earned=count*policy.credit,available=Math.max(0,earned-Math.max(0,Math.floor(Number(used)||0))),applied=Math.min(available,policy.maxRedemption,price);return{count,earned,available,applied,due:price-applied,left:available-applied,next:Math.max(0,Math.ceil((policy.standardPrice-available)/policy.credit)),acquisitionCeiling:policy.credit/policy.minOrder};}
const api={policy,money,preview};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SalonReferralPolicy=api;
})(typeof window!=='undefined'?window:globalThis);

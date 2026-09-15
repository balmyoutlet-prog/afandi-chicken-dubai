const {test}=require('node:test');
const assert=require('node:assert/strict');
const {feeForDistanceKm,distanceKm,quote,nearestBranch}=require('../delivery-pricing.js');
for (const [km,fee] of [[0,5],[0.5,5],[4.999999,5],[5,5],[5.000001,10],[7.5,10],[9.999999,10],[10,10],[10.000001,15],[12,15],[15,15],[15.000001,15],[20,15],[100,15]]) {
  test(`${km} km costs AED ${fee}`,()=>assert.equal(feeForDistanceKm(km),fee));
}
test('invalid distances cannot produce a fee',()=>{
  for(const value of [-1,NaN,Infinity,null,undefined,'5'])assert.throws(()=>feeForDistanceKm(value),RangeError);
});
test('distance uses geographic radius, and identical pins have zero distance',()=>{
  assert.equal(distanceKm({lat:25.309641,lng:55.372841},{lat:25.309641,lng:55.372841}),0);
  assert(Math.abs(distanceKm({lat:0,lng:0},{lat:1,lng:0})-111.1950802335)<0.000001);
});
test('missing, low-trust or invalid coordinates do not default to zero or maximum delivery fee',()=>{
  assert.equal(quote({mode:'Delivery'}).feeAED,null);
  assert.equal(quote({mode:'Delivery',customer:{lat:25,lng:55},branch:{id:'dubai',lat:25,lng:55}}).feeAED,null);
  assert.equal(quote({mode:'Delivery',customer:{lat:NaN,lng:55},branch:{id:'test',lat:25,lng:55,verified:true}}).feeAED,null);
});
test('pickup and dine-in have no delivery fee and need no customer location',()=>{
  for(const mode of ['Takeaway','Dine-in'])assert.deepEqual(quote({mode}),{status:'ready',feeAED:0,distanceKm:null});
});
test('a verified selected branch is used for both distance and price',()=>{
  const branch={id:'taawun',lat:25.309641,lng:55.372841,verified:true};
  const result=quote({mode:'Delivery',customer:branch,branch});
  assert.equal(result.status,'ready');assert.equal(result.feeAED,5);assert.equal(result.branchId,'taawun');
});
test('incomplete branch coordinates never give an incorrect nearest-of-five recommendation',()=>{
  assert.equal(nearestBranch({lat:25,lng:55},[{id:'a',lat:25,lng:55,verified:true},{id:'b'}]).branch,null);
  const result=nearestBranch({lat:25,lng:55},[{id:'a',lat:26,lng:55,verified:true},{id:'b',lat:25.001,lng:55,verified:true}]);
  assert.equal(result.branch.id,'b');
});

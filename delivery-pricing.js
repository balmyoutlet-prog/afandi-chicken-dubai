/* Geographic-radius delivery pricing. All five original map pins and phones were
 * explicitly reconfirmed by the owner on 2026-09-15. Names/phones/map links stay
 * in app.js unchanged. Coordinates below are the PIN, not the map viewport.
 * Three short links resolved through the same Google feature IDs / CID metadata.
 * No routing API, geocoding bill, customer tracking, or maximum service radius.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AfandiDeliveryPricing = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const branchPins = Object.freeze({
    dubai: Object.freeze({id:'dubai',lat:25.2155801,lng:55.3171835,verified:true,cid:'17394960900906958847'}),
    majaz: Object.freeze({id:'majaz',lat:25.3422812,lng:55.3851121,verified:true,cid:'13898347668581505636'}),
    taawun: Object.freeze({id:'taawun',lat:25.309641,lng:55.372841,verified:true}),
    marsa: Object.freeze({id:'marsa',lat:25.421204,lng:55.443203,verified:true}),
    khalifa: Object.freeze({id:'khalifa',lat:25.3896446,lng:55.4592689,verified:true,cid:'4137536501169179377'})
  });
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  function validPoint(p) {return !!p && finite(p.lat) && finite(p.lng) && Math.abs(p.lat)<=90 && Math.abs(p.lng)<=180;}
  function feeForDistanceKm(km) {
    if (!finite(km) || km<0) throw new RangeError('Valid non-negative distance required');
    return km<=5 ? 5 : km<=10 ? 10 : 15;
  }
  function distanceKm(a,b) {
    if (!validPoint(a)||!validPoint(b)) throw new RangeError('Two valid coordinates required');
    const rad = d=>d*Math.PI/180;
    const h = Math.sin(rad(b.lat-a.lat)/2)**2 + Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lng-a.lng)/2)**2;
    return 12742.0176*Math.asin(Math.sqrt(Math.max(0,Math.min(1,h))));
  }
  function quote({mode,customer,branch}) {
    if (mode==='Takeaway'||mode==='Dine-in') return {status:'ready',feeAED:0,distanceKm:null};
    if (mode!=='Delivery') return {status:'needs_order_type',feeAED:null};
    if (!validPoint(customer)) return {status:'needs_customer_location',feeAED:null};
    if (!branch||branch.verified!==true||!validPoint(branch)) return {status:'needs_verified_branch_location',feeAED:null};
    const km=distanceKm(customer,branch);
    return {status:'ready',branchId:branch.id,feeAED:feeForDistanceKm(km),distanceKm:km,basis:'geographic-radius'};
  }
  function nearestBranch(customer,list=Object.values(branchPins)) {
    if (!validPoint(customer)) return {status:'needs_customer_location',branch:null};
    if (!Array.isArray(list)||!list.length||list.some(b=>!b||!b.verified||!validPoint(b))) return {status:'needs_verified_branch_locations',branch:null};
    const ranked=list.map(branch=>({branch,distanceKm:distanceKm(customer,branch)})).sort((a,b)=>a.distanceKm-b.distanceKm);
    return {status:'ready',...ranked[0]};
  }
  function parsePoint(input) {
    if (typeof input!=='string'||input.length>2048) return null;
    let s=input.trim().replace(/[٠-٩]/g,d=>String(d.charCodeAt(0)-1632)).replace(/[۰-۹]/g,d=>String(d.charCodeAt(0)-1776)).replace(/،/g,',');
    const pair = text => {
      const m=text.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
      if (!m) return null;
      const p={lat:Number(m[1]),lng:Number(m[2])};
      return validPoint(p)?p:null;
    };
    if (pair(s)) return pair(s);
    try {
      const url=new URL(s);
      if (url.protocol!=='https:' || !['www.google.com','google.com','maps.google.com','maps.google.ae','www.google.ae'].includes(url.hostname)) return null;
      const pin=decodeURIComponent(url.href).match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
      if(pin) return pair(pin[1]+','+pin[2]);
      return pair(url.searchParams.get('q')||url.searchParams.get('query')||'');
      // @lat,lng alone is a map-camera position, not a verified delivery pin.
    } catch (_) {return null;}
  }
  return Object.freeze({branchPins,validPoint,feeForDistanceKm,distanceKm,quote,nearestBranch,parsePoint});
});

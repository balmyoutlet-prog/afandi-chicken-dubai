/* Afandi delivery UI. Coordinates stay in page memory and only enter the branch
 * WhatsApp draft on explicit submit. No analytics receives exact location.
 * GPS and optional OpenStreetMap tiles load only after the customer asks.
 */
(function () {
  'use strict';
  const P=window.AfandiDeliveryPricing, form=document.getElementById('checkoutForm');
  if(!P||!form) return;
  const el=id=>document.getElementById(id);
  const txt=(ar,en)=>lang==='ar'?ar:en;
  let candidate=null, confirmed=false, busy=false, sequence=0, messageKey='';
  let map=null, marker=null, mapPromise=null, tilesLoaded=false;
  const translations={
    title:['لوكيشن التوصيل','Delivery location'],
    policy:['حتى 5 كم: 5 درهم · أكثر من 5 إلى 10 كم: 10 درهم · أكثر من 10 كم: 15 درهم، حتى لو أبعد من 15 كم.','Up to 5 km: AED 5 · Over 5 to 10 km: AED 10 · Over 10 km: AED 15, including beyond 15 km.'],
    basis:['الحسبة خط مستقيم من الفرع المختار، مش مسافة طريق السيارة.','Calculated by straight-line distance from the selected branch, not driving distance.'],
    gps:['حدّد موقعي الحالي','Use my current location'],
    map:['اختَر عالخريطة','Choose on map'],
    manual:['عندك رابط موقع؟ أدخله هون','Have a location link? Enter it here'],
    coordinates:['رابط Google Maps فيه إحداثيات، أو خط العرض وخط الطول','Google Maps pin link with coordinates, or latitude, longitude'],
    apply:['اعتمد هالنقطة','Use this point'],
    confirm:['أكّد: هيدا موقع التوصيل','Confirm: deliver to this location'],
    clear:['غيّر / امسح الموقع','Change / clear location'],
    check:['راجع النقطة على Google Maps','Check this point on Google Maps'],
    mapHelp:['كبّر الخريطة واضغط على موقع التوصيل أو حرّك الدبوس.','Zoom in and tap your delivery location, or drag the pin.'],
    center:['اختَر وسط الخريطة','Choose map centre'],
    privacy:['الموقع يبقى بهالصفحة، وبينضاف لرسالة الفرع عند الإرسال. الخريطة الاختيارية تستخدم OpenStreetMap. الفرع بيؤكّد إمكانية ووقت التوصيل.','Your location stays on this page and is included in the branch message when you send. The optional map uses OpenStreetMap. The branch confirms delivery availability and timing.'],
    locating:['عم نحدّد موقعك…','Finding your location…'],
    denied:['المتصفح ما سمح باللوكيشن. اختَر نقطة عالخريطة أو أدخل إحداثيات موقع التوصيل.','Location permission was denied. Choose a point on the map or enter delivery coordinates.'],
    unavailable:['ما قدرنا نحدّد الموقع. جرّب من جديد أو اختَر عالخريطة.','Location is unavailable. Try again or choose on the map.'],
    timeout:['تحديد الموقع أخد وقت طويل. جرّب من جديد أو اختَر عالخريطة.','Location timed out. Try again or choose on the map.'],
    invalid:['هالرابط ما فيه نقطة واضحة. اختَر عالخريطة أو أدخل الإحداثيات مثل 25.21558,55.31718.','This link has no usable pin. Choose on the map or enter coordinates such as 25.21558,55.31718.'],
    imprecise:['دقّة GPS ضعيفة. حدّد دبوس التوصيل عالخريطة أو أدخل إحداثيات دقيقة قبل التأكيد.','GPS accuracy is low. Refine the delivery pin on the map or enter precise coordinates before confirming.'],
    loadingMap:['عم نحمل الخريطة…','Loading the map…'],
    mapFailed:['الخريطة ما تحمّلت. استخدم موقعي الحالي أو أدخل رابط فيه إحداثيات.','The map could not load. Use current location or enter a link containing coordinates.'],
    chooseFirst:['حدّد وأكّد موقع التوصيل حتى نحسب الرسوم الصح.','Choose and confirm your delivery location to calculate the correct fee.'],
    chooseBranch:['اختَر الفرع حتى نحسب المسافة والرسوم.','Select a branch to calculate distance and delivery fee.']
  };
  const tr=key=>translations[key]?translations[key][lang==='ar'?0:1]:'';
  const panel=document.createElement('section');
  panel.id='deliveryLocationPanel';panel.className='delivery-location';panel.hidden=true;
  panel.setAttribute('aria-labelledby','deliveryLocationTitle');
  panel.innerHTML=`<h3 id="deliveryLocationTitle" data-delivery-copy="title"></h3>
    <p class="delivery-policy" data-delivery-copy="policy"></p>
    <p class="delivery-note" data-delivery-copy="basis"></p>
    <div class="delivery-actions"><button id="deliveryUseGPS" type="button" data-delivery-copy="gps"></button><button id="deliveryOpenMap" type="button" data-delivery-copy="map"></button></div>
    <details id="deliveryManual"><summary data-delivery-copy="manual"></summary><label for="deliveryCoordinates" data-delivery-copy="coordinates"></label><input id="deliveryCoordinates" type="text" dir="ltr" autocomplete="off" maxlength="2048" placeholder="25.21558,55.31718"><button id="deliveryApplyCoordinates" type="button" data-delivery-copy="apply"></button></details>
    <div id="deliveryMapWrap" hidden><p data-delivery-copy="mapHelp"></p><div id="deliveryMap" tabindex="0"></div><button id="deliveryMapCenter" type="button" data-delivery-copy="center" disabled></button></div>
    <p id="deliveryLocationMessage" class="delivery-message" role="status" aria-live="polite"></p>
    <div id="deliveryCandidate" hidden><a id="deliveryViewPoint" target="_blank" rel="noopener noreferrer" data-delivery-copy="check"></a><p id="deliveryPointText" dir="ltr"></p><button id="deliveryConfirmLocation" type="button" data-delivery-copy="confirm"></button><button id="deliveryClearLocation" type="button" data-delivery-copy="clear"></button></div>
    <p id="deliveryQuoteDetail" class="delivery-quote" aria-live="polite"></p><button id="deliveryNearestBranch" type="button" hidden></button>
    <p class="delivery-note" data-delivery-copy="privacy"></p>`;
  el('deliveryAddressWrap').after(panel);
  function pointLink(point){return 'https://www.google.com/maps?q='+point.lat.toFixed(7)+','+point.lng.toFixed(7);}
  function pointForQuote(){return confirmed&&candidate?{lat:candidate.lat,lng:candidate.lng}:null;}
  function getQuote(){return P.quote({mode:selectedMode(),customer:pointForQuote(),branch:P.branchPins[el('branchSelect').value]});}
  function totalLabel(){return selectedMode()==='Delivery'&&getQuote().status!=='ready'?money(totals())+txt(' + التوصيل',' + delivery'):money(orderTotal());}
  function refresh(){
    const delivery=selectedMode()==='Delivery';panel.hidden=!delivery;
    panel.querySelectorAll('[data-delivery-copy]').forEach(node=>{node.textContent=tr(node.dataset.deliveryCopy);});
    el('deliveryUseGPS').disabled=busy;el('deliveryUseGPS').textContent=busy?tr('locating'):tr('gps');
    el('deliveryCandidate').hidden=!candidate;
    el('deliveryConfirmLocation').hidden=confirmed;
    el('deliveryConfirmLocation').disabled=!candidate||candidate.imprecise===true;
    if(candidate){el('deliveryViewPoint').href=pointLink(candidate);el('deliveryPointText').textContent=candidate.lat.toFixed(6)+', '+candidate.lng.toFixed(6)+(candidate.accuracy?txt(' · دقّة تقريبية ±',' · Approx. accuracy ±')+Math.round(candidate.accuracy)+' m':'');}
    el('deliveryLocationMessage').textContent=messageKey?tr(messageKey):'';
    el('deliveryMap').setAttribute('aria-label',tr('mapHelp'));
    const q=getQuote(), row=el('deliveryFeeRow'), label=form.querySelector('[data-i18n="orderValue"]');
    row.hidden=!delivery;
    row.querySelector('strong').textContent=q.status==='ready'?money(q.feeAED):txt('بعد تحديد الموقع','After choosing location');
    el('checkoutTotal').textContent=totalLabel();
    if(label)label.textContent=delivery&&q.status!=='ready'?txt('قيمة الأصناف + رسوم التوصيل','Items subtotal + delivery'):t('orderValue');
    if(delivery&&q.status==='ready'){
      const branch=branches.find(b=>b.id===q.branchId);
      const band=q.feeAED===5?txt('حتى 5 كم','up to 5 km'):q.feeAED===10?txt('أكثر من 5 إلى 10 كم','over 5 to 10 km'):txt('أكثر من 10 كم، والسقف 15 درهم','over 10 km, capped at AED 15');
      el('deliveryQuoteDetail').textContent=txt('من فرع ','From ')+branchName(branch)+' · '+q.distanceKm.toFixed(2)+txt(' كم تقريباً',' km approx.')+' · '+band+' · '+money(q.feeAED);
    }else el('deliveryQuoteDetail').textContent=delivery?tr(confirmed?'chooseBranch':'chooseFirst'):'';
    const nearest=confirmed?P.nearestBranch(candidate):null;
    const button=el('deliveryNearestBranch');
    button.hidden=!delivery||!nearest||nearest.status!=='ready'||nearest.branch.id===el('branchSelect').value;
    if(!button.hidden){const b=branches.find(b=>b.id===nearest.branch.id);button.textContent=txt('الأقرب إلك: ','Your nearest branch: ')+branchName(b)+txt(' — اختَر هالفرع',' — choose this branch');button.dataset.branch=nearest.branch.id;}
    // Invalidate a stale add-on success message when location or fee changes.
    const status=el('checkoutMerchStatus');if(status)status.textContent='';
  }
  function invalidate(){confirmed=false;messageKey='';sequence++;busy=false;}
  function setCandidate(point,source,accuracy){
    if(!P.validPoint(point)){messageKey='invalid';refresh();return;}
    invalidate();candidate={lat:point.lat,lng:point.lng,source,accuracy:accuracy||null,imprecise:source==='gps'&&(!Number.isFinite(accuracy)||accuracy>250)};
    messageKey=candidate.imprecise?'imprecise':'';
    if(map){if(marker)marker.setLatLng([point.lat,point.lng]);else createMarker(point);}
    refresh();
  }
  function createMarker(point){
    marker=L.marker([point.lat,point.lng],{draggable:true,icon:L.divIcon({className:'delivery-pin',html:'<span aria-hidden="true">●</span>',iconSize:[30,30],iconAnchor:[15,15]}),title:tr('title')}).addTo(map);
    marker.on('dragend',()=>{const p=marker.getLatLng();setCandidate({lat:p.lat,lng:p.lng},'map');});
  }
  el('deliveryUseGPS').onclick=()=>{
    invalidate();candidate=null;busy=true;messageKey='locating';const request=++sequence;refresh();
    if(!navigator.geolocation){busy=false;messageKey='unavailable';refresh();return;}
    navigator.geolocation.getCurrentPosition(position=>{
      if(request!==sequence)return;
      busy=false;setCandidate({lat:position.coords.latitude,lng:position.coords.longitude},'gps',position.coords.accuracy);
      if(map&&candidate)map.setView([candidate.lat,candidate.lng],16);
    },error=>{if(request!==sequence)return;busy=false;messageKey=error.code===1?'denied':error.code===3?'timeout':'unavailable';refresh();},{enableHighAccuracy:true,timeout:12000,maximumAge:0});
  };
  el('deliveryCoordinates').addEventListener('input',()=>{invalidate();candidate=null;el('deliveryCoordinates').setCustomValidity('');refresh();});
  el('deliveryCoordinates').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();el('deliveryApplyCoordinates').click();}});
  el('deliveryApplyCoordinates').onclick=()=>{
    const point=P.parsePoint(el('deliveryCoordinates').value);
    if(!point){invalidate();candidate=null;messageKey='invalid';el('deliveryCoordinates').setCustomValidity(tr('invalid'));refresh();el('deliveryCoordinates').reportValidity();return;}
    el('deliveryCoordinates').setCustomValidity('');setCandidate(point,'manual');
    if(map)map.setView([point.lat,point.lng],16);
  };
  el('deliveryConfirmLocation').onclick=()=>{
    if(!candidate||candidate.imprecise)return;
    confirmed=true;messageKey='';
    if(!el('branchSelect').value){const n=P.nearestBranch(candidate);if(n.status==='ready'){el('branchSelect').value=n.branch.id;el('branchSelect').dispatchEvent(new Event('change',{bubbles:true}));}}
    refresh();
  };
  el('deliveryClearLocation').onclick=()=>{invalidate();candidate=null;el('deliveryCoordinates').value='';el('deliveryCoordinates').setCustomValidity('');if(marker){marker.remove();marker=null;}refresh();el('deliveryUseGPS').focus();};
  el('deliveryNearestBranch').onclick=()=>{el('branchSelect').value=el('deliveryNearestBranch').dataset.branch;el('branchSelect').dispatchEvent(new Event('change',{bubbles:true}));};
  function loadMapLibrary(){
    if(window.L)return Promise.resolve();
    if(mapPromise)return mapPromise;
    mapPromise=Promise.all(['css','js'].map(kind=>new Promise((resolve,reject)=>{
      const node=document.createElement(kind==='css'?'link':'script');
      if(kind==='css'){node.rel='stylesheet';node.href='./assets/vendor/leaflet/leaflet.css';}else node.src='./assets/vendor/leaflet/leaflet.js';
      const timer=setTimeout(()=>{node.remove();reject(new Error('Map load timeout'));},12000);
      node.onload=()=>{clearTimeout(timer);resolve();};node.onerror=()=>{clearTimeout(timer);node.remove();reject(new Error('Map unavailable'));};document.head.appendChild(node);
    }))).catch(error=>{mapPromise=null;throw error;});return mapPromise;
  }
  el('deliveryOpenMap').onclick=async()=>{
    el('deliveryMapWrap').hidden=false;messageKey='loadingMap';refresh();
    try{
      await loadMapLibrary();
      if(!map){
        const center=candidate||P.branchPins[el('branchSelect').value]||P.branchPins.dubai;
        map=L.map('deliveryMap',{center:[center.lat,center.lng],zoom:candidate?16:12,scrollWheelZoom:false,minZoom:3,maxZoom:19});
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>'})
          .on('tileload',()=>{tilesLoaded=true;el('deliveryMapCenter').disabled=false;if(messageKey==='mapFailed'){messageKey='';refresh();}})
          .on('tileerror',()=>{if(!tilesLoaded){messageKey='mapFailed';refresh();}}).addTo(map);
        for(const branch of branches){const p=P.branchPins[branch.id];const title=document.createElement('span');title.textContent=branchName(branch);L.circleMarker([p.lat,p.lng],{radius:5,color:'#d50012',fillOpacity:1}).addTo(map).bindTooltip(title);}
        map.on('click',e=>{if(tilesLoaded)setCandidate({lat:e.latlng.lat,lng:e.latlng.lng},'map');});
        if(candidate)createMarker(candidate);
      }
      messageKey='';refresh();setTimeout(()=>map.invalidateSize(),0);
    }catch(_){messageKey='mapFailed';refresh();}
  };
  el('deliveryMapCenter').onclick=()=>{if(!map||!tilesLoaded)return;const point=map.getCenter();setCandidate({lat:point.lat,lng:point.lng},'map');};
  function validateForSubmit(){
    if(selectedMode()!=='Delivery')return true;
    if(getQuote().status==='ready')return true;
    messageKey=confirmed?'chooseBranch':'chooseFirst';refresh();panel.scrollIntoView({block:'center'});el(confirmed?'branchSelect':'deliveryUseGPS').focus();return false;
  }
  function whatsappLines(){
    if(selectedMode()!=='Delivery'||getQuote().status!=='ready')return '';
    const q=getQuote();return '\n'+txt('المسافة بخط مستقيم من الفرع','Straight-line distance from branch')+': '+q.distanceKm.toFixed(2)+' km\n'+txt('موقع التوصيل','Delivery location')+': '+pointLink(candidate);
  }
  window.AfandiDeliveryUI=Object.freeze({getQuote,totalLabel,validateForSubmit,whatsappLines,getPoint:()=>pointForQuote()});
  const originalUpdate=updateFulfilmentUI;
  updateFulfilmentUI=function(){originalUpdate();refresh();};
  el('branchSelect').addEventListener('change',refresh);
  document.querySelectorAll('[name="mode"]').forEach(input=>input.addEventListener('change',()=>{
    if(selectedMode()!=='Delivery'){sequence++;busy=false;messageKey='';el('deliveryCoordinates').setCustomValidity('');}
    el('deliveryCoordinates').disabled=selectedMode()!=='Delivery';refresh();
  }));
  const oldLanguage=applyLanguage;
  applyLanguage=function(next,remember=false){oldLanguage(next,remember);refresh();};
  updateFulfilmentUI();
})();

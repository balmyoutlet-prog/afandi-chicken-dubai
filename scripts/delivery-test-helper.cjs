module.exports=async function setDeliveryLocation(page, branchId='dubai'){
 const point=await page.evaluate(id=>window.AfandiDeliveryPricing.branchPins[id],branchId);
 if(!point)throw Error('No confirmed branch pin: '+branchId);
 if(!(await page.locator('#deliveryManual').evaluate(el=>el.open)))await page.locator('#deliveryManual summary').click();
 await page.locator('#deliveryCoordinates').fill(point.lat+','+point.lng);
 await page.locator('#deliveryApplyCoordinates').click();
 await page.locator('#deliveryConfirmLocation').click();
};

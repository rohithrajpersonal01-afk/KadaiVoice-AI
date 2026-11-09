// SAMPLE catalogue. Prices are made-up demo prices, NOT real market prices.
// price is per `unit`. Optional packSize = SAMPLE size of one "packet" (so "1 packet oil" = 1 L).
// price is per `unit`. Add aliases here to improve matching (no other code changes needed).
const p = (id, name, tamilName, tanglishName, aliases, category, unit, price, packSize) =>
  ({ id, name, tamilName, tanglishName, aliases, category, unit, price, image: `${id}.jpg`, ...(packSize && { packSize }) });

export const CATALOGUE = [
  p('rice', 'Rice', 'அரிசி', 'Arisi', ['rice', 'arisi', 'ari', 'ரைஸ்'], 'Grains', 'kg', 60),
  p('sugar', 'Sugar', 'சர்க்கரை', 'Sarkarai', ['sugar', 'sarkarai', 'sakkarai', 'chakkarai', 'sakkara', 'sarkkarai', 'சுகர்', 'சக்கரை'], 'Essentials', 'kg', 45, { qty: 1, unit: 'kg' }),
  p('mustard', 'Mustard seeds', 'கடுகு', 'Kadugu', ['mustard', 'mustard seeds', 'mustard seed', 'kadugu'], 'Spices', 'kg', 160),
  p('urad-dal', 'Urad dal', 'உளுத்தம் பருப்பு', 'Ulutham paruppu', ['urad dal', 'ulutham paruppu', 'ulunthu', 'ulundu', 'black gram dal', 'urad', 'உளுந்து', 'உளுத்தம்பருப்பு', 'உளுந்தம் பருப்பு'], 'Pulses', 'kg', 140),
  p('toor-dal', 'Toor dal', 'துவரம் பருப்பு', 'Thuvaram paruppu', ['toor dal', 'tur dal', 'thuvaram paruppu', 'thuvaram', 'arhar dal', 'toor', 'துவரம்பருப்பு'], 'Pulses', 'kg', 160),
  p('wheat-flour', 'Wheat flour', 'கோதுமை மாவு', 'Godhumai maavu', ['wheat flour', 'atta', 'godhumai maavu', 'godhumai mavu', 'godumai maavu', 'ஆட்டா'], 'Grains', 'kg', 50),
  p('cooking-oil', 'Cooking oil', 'எண்ணெய்', 'Ennai', ['cooking oil', 'oil', 'ennai', 'ennei', 'ஆயில்'], 'Essentials', 'l', 140, { qty: 1, unit: 'l' }),
  p('salt', 'Salt', 'உப்பு', 'Uppu', ['salt', 'uppu', 'சால்ட்'], 'Essentials', 'kg', 25, { qty: 1, unit: 'kg' }),
  p('turmeric', 'Turmeric', 'மஞ்சள்', 'Manjal', ['turmeric', 'turmeric powder', 'manjal', 'manjal podi', 'மஞ்சள் தூள்'], 'Spices', 'kg', 220),
  p('chilli-powder', 'Chilli powder', 'மிளகாய்த்தூள்', 'Milagai podi', ['chilli powder', 'chili powder', 'milagai podi', 'milagai thool', 'milagai', 'மிளகாய் பொடி', 'மிளகாய் தூள்'], 'Spices', 'kg', 300),
  p('eggs', 'Eggs', 'முட்டை', 'Muttai', ['eggs', 'egg', 'muttai'], 'Dairy & Eggs', 'piece', 7),
  p('milk', 'Milk', 'பால்', 'Paal', ['milk', 'paal', 'pal', 'மில்க்'], 'Dairy & Eggs', 'packet', 28),
];
